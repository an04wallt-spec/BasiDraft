include("scripts/Draw/Dimension/BasiDraftOverall/BasiDraftOverall.js");

if (typeof(BasiDraftOverall) === "undefined") {
    throw new Error("BasiDraftOverall action was not loaded");
}

var testBox = new RBox(20.0, 30.0, 120.0, 80.0);
var data = BasiDraftOverall.createDimensionData(testBox, 10.0);

if (data.length !== 2) {
    throw new Error("Expected two overall dimensions, got " + data.length);
}

var width = data[0].getMeasuredValue();
var height = data[1].getMeasuredValue();

if (Math.abs(width - 100.0) > 1.0e-9) {
    throw new Error("Wrong width dimension: " + width);
}

if (Math.abs(height - 50.0) > 1.0e-9) {
    throw new Error("Wrong height dimension: " + height);
}

print("BasiDraft script smoke test passed: 100 x 50");
