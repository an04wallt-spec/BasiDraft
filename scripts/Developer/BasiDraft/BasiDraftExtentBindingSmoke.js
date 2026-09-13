include("scripts/Draw/Dimension/BasiDraftOverall/BasiDraftOverall.js");
include("scripts/Developer/BasiDraft/BasiDraftUpdateFromDxf.js");

var di = EAction.getDocumentInterface();
var document = EAction.getDocument();
if (isNull(di) || isNull(document)) {
    throw new Error("BasiDraft extent binding smoke: no active old DXF document");
}

var logical = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (logical.views.length !== 1) {
    throw new Error("Expected exactly one logical view in extent fixture");
}
var box = logical.views[0].box;
if (Math.abs((box.maxX-box.minX)-100.0) > 1.0e-6 ||
    Math.abs((box.maxY-box.minY)-200.0) > 1.0e-6) {
    throw new Error("Old extent fixture must be 100 x 200");
}

var widthData = new RDimRotatedData();
widthData.setExtensionPoint1(new RVector(box.minX, box.minY));
widthData.setExtensionPoint2(new RVector(box.maxX, box.minY));
widthData.setDefinitionPoint(new RVector((box.minX+box.maxX)*0.5, box.minY-10.0));
widthData.setRotation(0.0);
widthData.setLinearFactor(1.0);

var heightData = new RDimRotatedData();
heightData.setExtensionPoint1(new RVector(box.minX, box.minY));
heightData.setExtensionPoint2(new RVector(box.minX, box.maxY));
heightData.setDefinitionPoint(new RVector(box.minX-10.0, (box.minY+box.maxY)*0.5));
heightData.setRotation(Math.PI/2.0);
heightData.setLinearFactor(1.0);

var widthEntity = new RDimRotatedEntity(document, widthData);
var heightEntity = new RDimRotatedEntity(document, heightData);
if (!BasiDraftDimensionBinding.attach(
        widthEntity,
        BasiDraftDimensionBinding.makeViewExtentBinding(0, "width")) ||
    !BasiDraftDimensionBinding.attach(
        heightEntity,
        BasiDraftDimensionBinding.makeViewExtentBinding(0, "height"))) {
    throw new Error("Failed to attach view-extent bindings");
}

var add = new RAddObjectsOperation();
add.setText(qsTr("BasiDraft: extent binding smoke dimensions"));
add.addObject(widthEntity);
add.addObject(heightEntity);
di.applyOperation(add);

var ids = document.queryAllEntities(false, false, RS.EntityDimRotated);
if (ids.length !== 2) {
    throw new Error("Expected exactly two BasiDraft overall dimensions");
}

var oldInfo = new QFileInfo(document.getFileName());
var newFileName = oldInfo.absolutePath() + QDir.separator +
    "basidraft_extent_new_r12.dxf";
var update = BasiDraftUpdateFromDxf.refresh(di, newFileName);
if (isNull(update.comparison) || !update.comparison.ok || !update.refresh.applied) {
    throw new Error(
        "Extent refresh failed: " +
        (isNull(update.refresh) ? "no refresh result" : update.refresh.error)
    );
}
if (isNull(update.refresh.dimensionStats) ||
    update.refresh.dimensionStats.updated !== 1 ||
    update.refresh.dimensionStats.current !== 1 ||
    update.refresh.dimensionStats.needsReview !== 0 ||
    update.refresh.dimensionStats.lost !== 0 ||
    update.refresh.dimensionStats.unbound !== 0) {
    throw new Error("Wrong extent dimension refresh statistics");
}

var refreshed = document.queryAllEntities(false, false, RS.EntityDimRotated);
var widthFound = false;
var heightFound = false;
for (var i=0; i<refreshed.length; ++i) {
    var entity = document.queryEntity(refreshed[i]);
    var binding = BasiDraftDimensionBinding.read(entity);
    if (isNull(binding) || binding.kind !== "viewExtent") {
        throw new Error("Overall dimension lost its semantic extent binding");
    }

    var measured = entity.getData().getMeasuredValue();
    if (binding.mode === "width") {
        widthFound = true;
        if (Math.abs(measured-110.0) > 1.0e-6 ||
            Math.abs(entity.getExtensionPoint2().x-130.0) > 1.0e-6 ||
            Math.abs(entity.getDefinitionPoint().x-75.0) > 1.0e-6) {
            throw new Error("Overall width did not follow resized logical view");
        }
    }
    else if (binding.mode === "height") {
        heightFound = true;
        if (Math.abs(measured-200.0) > 1.0e-6) {
            throw new Error("Unchanged overall height was modified unexpectedly");
        }
    }
}
if (!widthFound || !heightFound) {
    throw new Error("Both width and height extent bindings must survive refresh");
}

// The source replacement and both dimension decisions must still be one undo.
di.undo();
var undone = document.queryAllEntities(false, false, RS.EntityDimRotated);
var oldWidthFound = false;
for (var u=0; u<undone.length; ++u) {
    var oldEntity = document.queryEntity(undone[u]);
    var oldBinding = BasiDraftDimensionBinding.read(oldEntity);
    if (!isNull(oldBinding) && oldBinding.mode === "width") {
        oldWidthFound = true;
        if (Math.abs(oldEntity.getData().getMeasuredValue()-100.0) > 1.0e-6) {
            throw new Error("Undo did not restore original overall width");
        }
    }
}
if (!oldWidthFound) {
    throw new Error("Undo lost width dimension binding");
}

print(
    "BasiDraft extent binding passed: overall width 100 -> 110, height 200 kept, " +
    "semantic bindings and one-step undo verified"
);
