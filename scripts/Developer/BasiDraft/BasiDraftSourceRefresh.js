include("scripts/Developer/BasiDraft/BasiDraftOwnership.js");
include("scripts/Developer/BasiDraft/BasiDraftDimensionBinding.js");

/**
 * Atomically replaces imported DXF source geometry while preserving BasiDraft-
 * owned documentation entities and updating safe semantic bindings.
 *
 * Safety policy:
 * - regenerated DXF must contain geometry only (no foreign annotation objects);
 * - every existing bound dimension is preflighted before any mutation;
 * - NeedsReview / Lost bindings abort automatic refresh entirely;
 * - source replacement and bound-dimension updates share one QCAD transaction
 *   group so one Undo / Redo operates on the complete refresh.
 */
function BasiDraftSourceRefresh() {
}

BasiDraftSourceRefresh.preflightDimensions = function(document, comparison, tolerance) {
    var result = {
        ok:true,
        updated:0,
        current:0,
        needsReview:0,
        lost:0,
        unbound:0,
        plans:[]
    };

    var ids = document.queryAllEntities(false, false, RS.EntityDimRotated);
    for (var i=0; i<ids.length; ++i) {
        var entity = document.queryEntity(ids[i]);
        var plan = BasiDraftDimensionBinding.plan(entity, comparison, tolerance);
        result.plans.push({entityId:ids[i], plan:plan});

        if (!plan.bound) {
            ++result.unbound;
        }
        else if (plan.status === "Updated") {
            ++result.updated;
        }
        else if (plan.status === "Current") {
            ++result.current;
        }
        else if (plan.status === "NeedsReview") {
            ++result.needsReview;
            result.ok = false;
        }
        else if (plan.status === "Lost") {
            ++result.lost;
            result.ok = false;
        }
    }
    return result;
};

BasiDraftSourceRefresh.collectSourceEntities = function(document) {
    var result = [];
    var ids = document.queryBlockEntities(document.getModelSpaceBlockId());
    for (var i=0; i<ids.length; ++i) {
        var entity = document.queryEntity(ids[i]);
        if (isNull(entity) || BasiDraftOwnership.isOwned(entity)) {
            continue;
        }
        result.push(entity);
    }
    return result;
};

BasiDraftSourceRefresh.apply = function(documentInterface, comparison, tolerance) {
    var result = {
        applied:false,
        error:"",
        removedSourceEntityCount:0,
        dimensionStats:undefined,
        preflight:undefined
    };

    if (isNull(documentInterface) || isNull(comparison) || !comparison.ok) {
        result.error = "Revision comparison is not safe to apply";
        return result;
    }

    var document = documentInterface.getDocument();
    if (isNull(document) || isNull(comparison.temporaryDocument)) {
        result.error = "Missing current or regenerated DXF document";
        return result;
    }

    // Production import contract: BAZIS supplies geometry. BasiDraft owns all
    // annotations. Refuse a regenerated source that unexpectedly brings its own
    // dimensions / text / leaders / hatches instead of silently importing them.
    if (!isNull(comparison.newLogical) &&
        !isNull(comparison.newLogical.analysis) &&
        comparison.newLogical.analysis.foreignAnnotationCount !== 0) {
        result.error = "Regenerated DXF contains foreign annotations";
        return result;
    }

    var preflight = BasiDraftSourceRefresh.preflightDimensions(
        document,
        comparison,
        tolerance
    );
    result.preflight = preflight;
    if (!preflight.ok) {
        result.error = "One or more bound dimensions require review";
        return result;
    }

    var sourceEntities = BasiDraftSourceRefresh.collectSourceEntities(document);
    if (sourceEntities.length === 0) {
        result.error = "Current document contains no replaceable DXF source geometry";
        return result;
    }

    var oldCurrentBlockId = document.getCurrentBlockId();
    var oldAutoGroup = document.getAutoTransactionGroup();
    var tag = "BasiDraftUpdateFromDxf_" + Date.now();
    var mutationStarted = false;

    documentInterface.tagState(tag);

    try {
        document.startTransactionGroup();
        document.setAutoTransactionGroup(true);
        mutationStarted = true;

        // 1. Remove only non-BasiDraft model-space entities from the old source.
        var del = new RDeleteObjectsOperation();
        del.setText(qsTr("BasiDraft: удалить старую DXF-геометрию"));
        for (var d=0; d<sourceEntities.length; ++d) {
            del.deleteObject(sourceEntities[d]);
        }
        var deleteTransaction = documentInterface.applyOperation(del);
        if (deleteTransaction.isFailed()) {
            throw new Error("Failed to remove old DXF source geometry");
        }
        result.removedSourceEntityCount = sourceEntities.length;

        // 2. Paste regenerated source into model space. RPasteOperation copies
        // required layers / blocks together with their references.
        document.setCurrentBlock(document.getModelSpaceBlockId());
        var paste = new RPasteOperation(comparison.temporaryDocument);
        paste.setOverwriteLayers(true);
        paste.setOverwriteBlocks(true);
        paste.setToCurrentLayer(false);
        paste.setText(qsTr("BasiDraft: загрузить новую DXF-геометрию"));
        var pasteTransaction = documentInterface.applyOperation(paste);
        if (pasteTransaction.isFailed()) {
            throw new Error("Failed to paste regenerated DXF source geometry");
        }

        // 3. Move only semantic dimension anchors that were proven to follow
        // the localized model revision.
        var dimensionStats = BasiDraftDimensionBinding.applyAll(
            documentInterface,
            comparison,
            tolerance
        );
        result.dimensionStats = dimensionStats;
        if (dimensionStats.needsReview !== 0 || dimensionStats.lost !== 0) {
            throw new Error("Dimension binding became unsafe during apply");
        }

        result.applied = true;
    }
    catch (e) {
        result.error = e.toString();
    }
    finally {
        document.setAutoTransactionGroup(oldAutoGroup);
        if (document.isBlockIdValid && document.isBlockIdValid(oldCurrentBlockId)) {
            document.setCurrentBlock(oldCurrentBlockId);
        }
        else {
            document.setCurrentBlock(document.getModelSpaceBlockId());
        }
    }

    if (!result.applied && mutationStarted) {
        // Roll back every transaction made after the tag. This preserves the
        // original drawing even if a lower-level QCAD operation fails midway.
        documentInterface.undoToTag(tag);
        result.removedSourceEntityCount = 0;
        result.dimensionStats = undefined;
    }

    return result;
};
