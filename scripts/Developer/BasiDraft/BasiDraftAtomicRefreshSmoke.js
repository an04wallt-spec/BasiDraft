include("scripts/Developer/BasiDraft/BasiDraftUpdateFromDxf.js");

function snapshotsFromLogical(logical) {
    var result = [];
    for (var i=0; i<logical.views.length; ++i) {
        result.push(logical.views[i].snapshot);
    }
    return result;
}

function assertSameViewSet(expected, actual, label) {
    var revision = BasiDraftRuntimeRevision.compareViewSets(
        expected,
        actual,
        BasiDraftRuntimeRevision.defaultOptions()
    );
    if (revision.oldViews.length !== expected.length ||
        revision.unmatchedNewViews.length !== 0) {
        throw new Error(label + ": view-set cardinality mismatch");
    }
    for (var i=0; i<revision.oldViews.length; ++i) {
        var r = revision.oldViews[i];
        if (!r.matched || r.ambiguous ||
            r.diff.similarity.removedPrimitiveCount !== 0 ||
            r.diff.similarity.addedPrimitiveCount !== 0) {
            throw new Error(label + ": view " + i + " is not geometrically identical");
        }
    }
}

var di = EAction.getDocumentInterface();
var document = EAction.getDocument();
if (isNull(di) || isNull(document)) {
    throw new Error("BasiDraft atomic refresh smoke: no active old DXF document");
}

var oldLogical = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (oldLogical.views.length !== 3) {
    throw new Error("Expected 3 old logical source views");
}
var oldSnapshots = snapshotsFromLogical(oldLogical);

// Create one BasiDraft-owned native dimension anchored to the shelf in the old
// FRONT view. The ownership marker must protect it when old DXF source entities
// are deleted during refresh.
var data = new RDimRotatedData();
data.setExtensionPoint1(new RVector(40.0, 40.0));
data.setExtensionPoint2(new RVector(40.0, 140.0));
data.setDefinitionPoint(new RVector(10.0, 90.0));
data.setRotation(Math.PI/2.0);
data.setLinearFactor(1.0);
var dimension = new RDimRotatedEntity(document, data);
BasiDraftDimensionBinding.attach(
    dimension,
    BasiDraftDimensionBinding.makeLineBinding(
        0,
        2,
        {x1:40.0, y1:140.0, x2:100.0, y2:140.0}
    )
);
var add = new RAddObjectOperation(dimension, qsTr("BasiDraft: atomic refresh test dimension"));
di.applyOperation(add);

var dimensionIds = document.queryAllEntities(false, false, RS.EntityDimRotated);
if (dimensionIds.length !== 1) {
    throw new Error("Expected exactly one BasiDraft dimension before refresh");
}
var dimensionId = dimensionIds[0];
if (!BasiDraftOwnership.isOwned(document.queryEntity(dimensionId))) {
    throw new Error("Bound dimension is not marked as BasiDraft-owned");
}

var oldInfo = new QFileInfo(document.getFileName());
var newFileName = oldInfo.absolutePath() + QDir.separator +
    "basidraft_revision_new_r12.dxf";
var update = BasiDraftUpdateFromDxf.refresh(di, newFileName);
if (isNull(update.comparison) || !update.comparison.ok) {
    throw new Error("Atomic refresh comparison failed");
}
if (!update.refresh.applied) {
    throw new Error("Atomic refresh was not applied: " + update.refresh.error);
}
if (update.refresh.removedSourceEntityCount !== 13) {
    throw new Error(
        "Expected 13 old top-level source entities to be replaced, got " +
        update.refresh.removedSourceEntityCount
    );
}
if (isNull(update.refresh.dimensionStats) ||
    update.refresh.dimensionStats.updated !== 1 ||
    update.refresh.dimensionStats.needsReview !== 0 ||
    update.refresh.dimensionStats.lost !== 0) {
    throw new Error("Bound dimension was not safely updated during atomic refresh");
}

var newSnapshots = snapshotsFromLogical(update.comparison.newLogical);
var afterLogical = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (afterLogical.views.length !== 3) {
    throw new Error("Refreshed document must still contain exactly 3 source views");
}
assertSameViewSet(newSnapshots, snapshotsFromLogical(afterLogical), "after refresh");

var afterDimension = document.queryEntity(dimensionId);
if (isNull(afterDimension) || !BasiDraftOwnership.isOwned(afterDimension)) {
    throw new Error("BasiDraft dimension was lost while replacing DXF source");
}
if (Math.abs(afterDimension.getExtensionPoint2().y-142.772) > 1.0e-6 ||
    Math.abs(afterDimension.getData().getMeasuredValue()-102.772) > 1.0e-6) {
    throw new Error("Bound dimension did not follow refreshed shelf geometry");
}

// One Undo must roll back source replacement and the bound dimension together.
di.undo();
var undoLogical = BasiDraftLogicalViews.analyzeLogicalViews(document);
assertSameViewSet(oldSnapshots, snapshotsFromLogical(undoLogical), "after single undo");
var undoDimension = document.queryEntity(dimensionId);
if (isNull(undoDimension) ||
    Math.abs(undoDimension.getExtensionPoint2().y-140.0) > 1.0e-6 ||
    Math.abs(undoDimension.getData().getMeasuredValue()-100.0) > 1.0e-6) {
    throw new Error("Single Undo did not restore old source and dimension together");
}

// One Redo must reapply the entire source + annotation refresh group.
di.redo();
var redoLogical = BasiDraftLogicalViews.analyzeLogicalViews(document);
assertSameViewSet(newSnapshots, snapshotsFromLogical(redoLogical), "after single redo");
var redoDimension = document.queryEntity(dimensionId);
if (isNull(redoDimension) ||
    Math.abs(redoDimension.getExtensionPoint2().y-142.772) > 1.0e-6 ||
    Math.abs(redoDimension.getData().getMeasuredValue()-102.772) > 1.0e-6) {
    throw new Error("Single Redo did not restore new source and dimension together");
}

print(
    "BasiDraft atomic DXF refresh passed: source geometry replaced, bound native " +
    "dimension 100.000 -> 102.772, one-step undo/redo verified"
);
