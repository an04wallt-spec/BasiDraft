include("scripts/Developer/BasiDraft/BasiDraftUpdateFromDxf.js");

var di = EAction.getDocumentInterface();
var document = EAction.getDocument();
if (isNull(di) || isNull(document)) {
    throw new Error("BasiDraft nested annotation guard: no active document");
}

var before = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (before.views.length !== 1) {
    throw new Error("Expected one clean old logical view");
}
var beforeSnapshot = before.views[0].snapshot;

var info = new QFileInfo(document.getFileName());
var badFile = info.absolutePath() + QDir.separator +
    "basidraft_nested_annotation_r12.dxf";

var comparison = BasiDraftUpdateFromDxf.compare(document, badFile);
if (!comparison.ok) {
    throw new Error("Geometry comparison itself should succeed for annotation guard fixture");
}
if (comparison.newLogical.analysis.foreignAnnotationCount !== 1) {
    throw new Error(
        "Expected exactly one nested foreign annotation, got " +
        comparison.newLogical.analysis.foreignAnnotationCount
    );
}

var update = BasiDraftUpdateFromDxf.refresh(di, badFile);
if (isNull(update.refresh) || update.refresh.applied) {
    throw new Error("Refresh with nested foreign annotation must be rejected");
}
if (update.refresh.error !== "Regenerated DXF contains foreign annotations") {
    throw new Error("Wrong nested annotation rejection reason: " + update.refresh.error);
}

// Rejection must be pre-mutation. Current source geometry remains identical and
// Undo stack is not consumed by a partial source replacement.
var after = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (after.views.length !== 1) {
    throw new Error("Rejected refresh changed logical view count");
}
var similarity = BasiDraftRuntimeRevision.compareSnapshots(
    beforeSnapshot,
    after.views[0].snapshot,
    BasiDraftRuntimeRevision.defaultOptions()
);
if (similarity.removedPrimitiveCount !== 0 ||
    similarity.addedPrimitiveCount !== 0 ||
    Math.abs(similarity.score-1.0) > 1.0e-12) {
    throw new Error("Rejected refresh modified current source geometry");
}

print(
    "BasiDraft nested annotation guard passed: TEXT inside INSERT detected, " +
    "refresh rejected before mutation"
);
