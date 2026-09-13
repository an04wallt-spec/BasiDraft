include("scripts/Draw/Dimension/BasiDraftOverall/BasiDraftOverall.js");

var document = EAction.getDocument();
if (isNull(document)) {
    throw new Error("BasiDraft E2E: no document was opened");
}

// The real BAZIS fixture contains one line from (20,30) to (120,80).
// Selecting imported geometry reproduces the first BasiDraft user workflow:
// open LDW -> select one view -> create overall dimensions.
document.selectAllEntities();

if (!document.hasSelection()) {
    throw new Error("BasiDraft E2E: LDW opened but no CAD geometry was imported");
}

var box = document.getSelectionBox();
if (isNull(box) || !box.isValid() || !box.isSane()) {
    throw new Error("BasiDraft E2E: imported geometry has no valid bounds");
}

if (Math.abs(box.getWidth() - 100.0) > 1.0e-9) {
    throw new Error("BasiDraft E2E: wrong imported width: " + box.getWidth());
}

if (Math.abs(box.getHeight() - 50.0) > 1.0e-9) {
    throw new Error("BasiDraft E2E: wrong imported height: " + box.getHeight());
}

var dimensions = BasiDraftOverall.createDimensionData(box, 10.0);
if (dimensions.length !== 2) {
    throw new Error("BasiDraft E2E: expected 2 overall dimensions, got " + dimensions.length);
}

if (Math.abs(dimensions[0].getMeasuredValue() - 100.0) > 1.0e-9) {
    throw new Error("BasiDraft E2E: wrong automatic width dimension: " + dimensions[0].getMeasuredValue());
}

if (Math.abs(dimensions[1].getMeasuredValue() - 50.0) > 1.0e-9) {
    throw new Error("BasiDraft E2E: wrong automatic height dimension: " + dimensions[1].getMeasuredValue());
}

print("BasiDraft LDW end-to-end test passed: real BAZIS LDW -> QCAD -> 100 x 50 dimensions");
