include("scripts/Developer/BasiDraft/BasiDraftUpdateFromDxf.js");

var di = EAction.getDocumentInterface();
var document = EAction.getDocument();
if (isNull(di) || isNull(document)) {
    throw new Error("BasiDraft bound dimension smoke: no active old DXF document");
}

// The old FRONT view is inserted at (20,40). Its shelf line is therefore
// world-space (40,140) -> (100,140). Create a native vertical QCAD dimension
// from cabinet bottom to that shelf and bind endpoint 2 to the shelf line.
var data = new RDimRotatedData();
data.setExtensionPoint1(new RVector(40.0, 40.0));
data.setExtensionPoint2(new RVector(40.0, 140.0));
data.setDefinitionPoint(new RVector(10.0, 90.0));
data.setRotation(Math.PI/2.0);
data.setLinearFactor(1.0);

if (!data.isValid()) {
    throw new Error("BasiDraft bound dimension smoke: invalid test dimension data");
}

var dimension = new RDimRotatedEntity(document, data);
BasiDraftDimensionBinding.attach(
    dimension,
    BasiDraftDimensionBinding.makeLineBinding(
        0,
        2,
        {x1:40.0, y1:140.0, x2:100.0, y2:140.0}
    )
);

var add = new RAddObjectOperation(dimension, qsTr("BasiDraft: test bound dimension"));
di.applyOperation(add);

var ids = document.queryAllEntities(false, false, RS.EntityDimRotated);
if (ids.length !== 1) {
    throw new Error("Expected exactly one native QCAD dimension, got " + ids.length);
}

var dimensionId = ids[0];
var before = document.queryEntity(dimensionId);
if (Math.abs(before.getData().getMeasuredValue()-100.0) > 1.0e-6) {
    throw new Error("Initial bound dimension must measure 100.0");
}

var oldInfo = new QFileInfo(document.getFileName());
var newFileName = oldInfo.absolutePath() + QDir.separator +
    "basidraft_revision_new_r12.dxf";
var comparison = BasiDraftUpdateFromDxf.compare(document, newFileName);
if (!comparison.ok) {
    throw new Error("UpdateFromDxf comparison failed: " + comparison.error);
}

var stats = BasiDraftUpdateFromDxf.applyBoundDimensions(di, comparison);
if (stats.updated !== 1 || stats.needsReview !== 0 || stats.lost !== 0) {
    throw new Error(
        "Wrong binding update stats: updated=" + stats.updated +
        ", needsReview=" + stats.needsReview +
        ", lost=" + stats.lost
    );
}

var after = document.queryEntity(dimensionId);
var ep1 = after.getExtensionPoint1();
var ep2 = after.getExtensionPoint2();
if (Math.abs(ep1.y-40.0) > 1.0e-6) {
    throw new Error("Fixed dimension endpoint moved unexpectedly");
}
if (Math.abs(ep2.y-142.772) > 1.0e-6) {
    throw new Error("Bound shelf endpoint did not move to Y=142.772: " + ep2.y);
}
if (Math.abs(after.getData().getMeasuredValue()-102.772) > 1.0e-6) {
    throw new Error(
        "Native QCAD dimension did not recompute to 102.772: " +
        after.getData().getMeasuredValue()
    );
}

var bindingAfter = BasiDraftDimensionBinding.read(after);
if (isNull(bindingAfter) || Math.abs(bindingAfter.line.y1-142.772) > 1.0e-6) {
    throw new Error("Stored BasiDraft binding was not advanced to new shelf geometry");
}

// The automatic update must participate in ordinary QCAD undo / redo.
di.undo();
var undone = document.queryEntity(dimensionId);
if (Math.abs(undone.getExtensionPoint2().y-140.0) > 1.0e-6 ||
    Math.abs(undone.getData().getMeasuredValue()-100.0) > 1.0e-6) {
    throw new Error("Undo did not restore the original bound dimension");
}

di.redo();
var redone = document.queryEntity(dimensionId);
if (Math.abs(redone.getExtensionPoint2().y-142.772) > 1.0e-6 ||
    Math.abs(redone.getData().getMeasuredValue()-102.772) > 1.0e-6) {
    throw new Error("Redo did not restore the revision-updated dimension");
}

print(
    "BasiDraft bound dimension update passed: native QCAD dimension 100.000 -> " +
    "102.772, shelf endpoint +2.772, undo/redo verified"
);
