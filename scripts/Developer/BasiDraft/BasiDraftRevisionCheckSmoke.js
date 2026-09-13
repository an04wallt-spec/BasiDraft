include("scripts/Developer/BasiDraft/BasiDraftRuntimeRevision.js");

var document = EAction.getDocument();
if (isNull(document)) {
    throw new Error("BasiDraft revision check: no regenerated DXF document opened");
}

var savedText = RSettings.getStringValue(
    "BasiDraft/RevisionSmoke/OldState",
    ""
);
if (savedText.length === 0) {
    throw new Error("BasiDraft revision check: old view state was not persisted");
}

var saved = JSON.parse(savedText);
if (saved.schema !== 1 || saved.viewCount !== 3 || saved.snapshots.length !== 3) {
    throw new Error("BasiDraft revision check: invalid old view state");
}

var current = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (current.views.length !== 3) {
    throw new Error("BasiDraft revision check: expected 3 new logical views, got " + current.views.length);
}

var newSnapshots = [];
for (var i=0; i<current.views.length; ++i) {
    if (current.views[i].snapshot.unsupportedPrimitiveCount !== 0) {
        throw new Error("BasiDraft revision check: unsupported primitive in new view " + i);
    }
    newSnapshots.push(current.views[i].snapshot);
}

var options = BasiDraftRuntimeRevision.defaultOptions();
var revision = BasiDraftRuntimeRevision.compareViewSets(
    saved.snapshots,
    newSnapshots,
    options
);

if (revision.oldViews.length !== 3 || revision.unmatchedNewViews.length !== 0) {
    throw new Error("BasiDraft revision check: failed one-to-one 3-view matching");
}

var expectedRemoved = [3, 4, 0];
var expectedAdded = [3, 4, 0];
for (var v=0; v<3; ++v) {
    var r = revision.oldViews[v];
    if (!r.matched || r.ambiguous) {
        throw new Error("BasiDraft revision check: old view " + v + " was not matched safely");
    }
    if (r.newViewIndex !== v) {
        throw new Error("BasiDraft revision check: old view " + v + " mapped to wrong new view " + r.newViewIndex);
    }
    if (r.diff.similarity.removedPrimitiveCount !== expectedRemoved[v] ||
        r.diff.similarity.addedPrimitiveCount !== expectedAdded[v]) {
        throw new Error(
            "BasiDraft revision check: view " + v +
            " expected revision " + expectedRemoved[v] + "/" + expectedAdded[v] +
            " but got " + r.diff.similarity.removedPrimitiveCount + "/" +
            r.diff.similarity.addedPrimitiveCount
        );
    }
}

var frontMotion = BasiDraftRuntimeRevision.detectLocalLineTranslation(
    revision.oldViews[0].diff,
    options.coordinateTolerance
);
var sectionMotion = BasiDraftRuntimeRevision.detectLocalLineTranslation(
    revision.oldViews[1].diff,
    options.coordinateTolerance
);

if (!frontMotion.detected || frontMotion.ambiguous ||
    Math.abs(frontMotion.dx) > 1.0e-6 ||
    Math.abs(frontMotion.dy-2.772) > 1.0e-6 ||
    frontMotion.supportCount !== 3) {
    throw new Error(
        "BasiDraft revision check: wrong front shelf motion dx=" + frontMotion.dx +
        " dy=" + frontMotion.dy + " support=" + frontMotion.supportCount
    );
}

if (!sectionMotion.detected || sectionMotion.ambiguous ||
    Math.abs(sectionMotion.dx) > 1.0e-6 ||
    Math.abs(sectionMotion.dy-2.772) > 1.0e-6 ||
    sectionMotion.supportCount !== 4) {
    throw new Error(
        "BasiDraft revision check: wrong section shelf motion dx=" + sectionMotion.dx +
        " dy=" + sectionMotion.dy + " support=" + sectionMotion.supportCount
    );
}

if (revision.oldViews[2].diff.similarity.score !== 1.0) {
    throw new Error("BasiDraft revision check: unchanged right view was not preserved exactly");
}

print(
    "BasiDraft two-DXF revision runtime passed: views=3, front=3/3 dy=2.772, " +
    "section=4/4 dy=2.772, right=unchanged"
);
