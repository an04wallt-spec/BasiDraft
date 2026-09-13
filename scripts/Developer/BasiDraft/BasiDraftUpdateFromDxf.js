include("scripts/Developer/BasiDraft/BasiDraftDxfLoader.js");
include("scripts/Developer/BasiDraft/BasiDraftRuntimeRevision.js");

/**
 * Product-side service for comparing the currently open BasiDraft/QCAD document
 * with a regenerated BAZIS DXF loaded into an isolated in-memory document.
 *
 * This function is intentionally non-destructive: callers receive a complete
 * revision plan first. A later apply stage may update source geometry and bound
 * BasiDraft annotations only after every automatic match has passed the safety
 * policy.
 */
function BasiDraftUpdateFromDxf() {
}

BasiDraftUpdateFromDxf.compare = function(currentDocument, newFileName, options) {
    var result = {
        ok:false,
        error:"",
        oldLogical:undefined,
        newLogical:undefined,
        revision:undefined,
        changedViews:[],
        unchangedViews:[],
        ambiguousViews:[],
        unmatchedOldViews:[],
        unmatchedNewViews:[],
        temporaryDocument:undefined,
        temporaryDocumentInterface:undefined,
        temporaryStorage:undefined,
        temporarySpatialIndex:undefined
    };

    if (isNull(currentDocument)) {
        result.error = "No current document";
        return result;
    }

    if (isNull(options)) {
        options = BasiDraftRuntimeRevision.defaultOptions();
    }

    var oldLogical = BasiDraftLogicalViews.analyzeLogicalViews(currentDocument);
    if (oldLogical.views.length === 0) {
        result.error = "Current document contains no logical geometry views";
        return result;
    }

    var loaded = BasiDraftDxfLoader.load(newFileName, "");
    if (!loaded.ok) {
        result.error = "Cannot import regenerated DXF, error code: " + loaded.errorCode;
        return result;
    }

    var newLogical = BasiDraftLogicalViews.analyzeLogicalViews(loaded.document);
    if (newLogical.views.length === 0) {
        result.error = "Regenerated DXF contains no logical geometry views";
        return result;
    }

    var oldSnapshots = [];
    var newSnapshots = [];
    var i;

    for (i=0; i<oldLogical.views.length; ++i) {
        if (oldLogical.views[i].snapshot.unsupportedPrimitiveCount !== 0) {
            result.error = "Current view " + i + " contains unsupported geometry";
            return result;
        }
        oldSnapshots.push(oldLogical.views[i].snapshot);
    }

    for (i=0; i<newLogical.views.length; ++i) {
        if (newLogical.views[i].snapshot.unsupportedPrimitiveCount !== 0) {
            result.error = "Regenerated view " + i + " contains unsupported geometry";
            return result;
        }
        newSnapshots.push(newLogical.views[i].snapshot);
    }

    var revision = BasiDraftRuntimeRevision.compareViewSets(
        oldSnapshots,
        newSnapshots,
        options
    );

    for (i=0; i<revision.oldViews.length; ++i) {
        var r = revision.oldViews[i];
        if (r.ambiguous) {
            result.ambiguousViews.push(i);
            continue;
        }
        if (!r.matched) {
            result.unmatchedOldViews.push(i);
            continue;
        }

        var removed = r.diff.similarity.removedPrimitiveCount;
        var added = r.diff.similarity.addedPrimitiveCount;
        if (removed === 0 && added === 0) {
            result.unchangedViews.push(i);
            continue;
        }

        result.changedViews.push({
            oldViewIndex:i,
            newViewIndex:r.newViewIndex,
            similarity:r.diff.similarity.score,
            removedPrimitiveCount:removed,
            addedPrimitiveCount:added,
            motion:BasiDraftRuntimeRevision.detectLocalLineTranslation(
                r.diff,
                options.coordinateTolerance
            ),
            diff:r.diff
        });
    }

    result.unmatchedNewViews = revision.unmatchedNewViews;
    result.oldLogical = oldLogical;
    result.newLogical = newLogical;
    result.revision = revision;

    // Keep ownership references alive for the caller while it inspects / applies
    // the revision plan. Nothing is inserted into an MDI window.
    result.temporaryDocument = loaded.document;
    result.temporaryDocumentInterface = loaded.documentInterface;
    result.temporaryStorage = loaded.storage;
    result.temporarySpatialIndex = loaded.spatialIndex;
    result.ok = result.ambiguousViews.length === 0 &&
                result.unmatchedOldViews.length === 0 &&
                result.unmatchedNewViews.length === 0;
    return result;
};
