include("scripts/Developer/BasiDraft/BasiDraftDxfAnalysis.js");
include("scripts/Developer/BasiDraft/BasiDraftLogicalViews.js");

var document = EAction.getDocument();
if (isNull(document)) {
    throw new Error("BasiDraft DXF analysis smoke: no document opened");
}

var result = BasiDraftDxfAnalysis.analyzeDocument(document);

if (result.totalTopLevelEntities !== 5) {
    throw new Error("Expected 5 top-level entities, got " + result.totalTopLevelEntities);
}
if (result.foreignAnnotationCount !== 1) {
    throw new Error("Expected 1 foreign annotation, got " + result.foreignAnnotationCount);
}
if (result.topLevelBlockReferenceCount !== 3) {
    throw new Error("Expected 3 block references, got " + result.topLevelBlockReferenceCount);
}
if (result.looseGeometryCount !== 1) {
    throw new Error("Expected 1 loose geometry entity, got " + result.looseGeometryCount);
}
if (result.frameCandidates.length !== 1) {
    throw new Error("Expected exactly one sheet-frame candidate, got " + result.frameCandidates.length);
}
if (result.frameCandidates[0].referencedBlockName !== "FRAME") {
    throw new Error("Wrong sheet-frame candidate: " + result.frameCandidates[0].referencedBlockName);
}
if (result.frameCandidates[0].primitiveCount !== 4) {
    throw new Error("Expected frame primitive count 4, got " + result.frameCandidates[0].primitiveCount);
}
if (result.blockCandidates.length !== 2) {
    throw new Error("Expected two ordinary block candidates, got " + result.blockCandidates.length);
}
if (result.geometryItems.length !== 3) {
    throw new Error("Expected 3 geometry items after filtering, got " + result.geometryItems.length);
}

var candidates = {};
for (var i=0; i<result.blockCandidates.length; ++i) {
    candidates[result.blockCandidates[i].referencedBlockName] = result.blockCandidates[i];
}

if (isNull(candidates["VIEW_A"]) || candidates["VIEW_A"].primitiveCount !== 5) {
    throw new Error("VIEW_A was not analyzed as a 5-primitive geometry block");
}
if (isNull(candidates["VIEW_B"]) || candidates["VIEW_B"].primitiveCount !== 5) {
    throw new Error("VIEW_B was not analyzed as a 5-primitive geometry block");
}

var logical = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (logical.views.length !== 2) {
    throw new Error("Expected 2 logical views, got " + logical.views.length);
}

// VIEW_A remains one 5-primitive logical view. VIEW_B absorbs the loose line
// drawn inside its extents and therefore becomes a 6-primitive logical view.
if (logical.views[0].primitiveCount !== 5) {
    throw new Error("Expected first logical view primitive count 5, got " + logical.views[0].primitiveCount);
}
if (logical.views[1].primitiveCount !== 6) {
    throw new Error("Expected second logical view primitive count 6, got " + logical.views[1].primitiveCount);
}
if (logical.views[0].snapshot.lines.length !== 5) {
    throw new Error("Expected first logical snapshot to contain 5 lines");
}
if (logical.views[1].snapshot.lines.length !== 6) {
    throw new Error("Expected second logical snapshot to contain 6 lines");
}
if (logical.views[0].snapshot.unsupportedPrimitiveCount !== 0 ||
    logical.views[1].snapshot.unsupportedPrimitiveCount !== 0) {
    throw new Error("Synthetic DXF produced unsupported snapshot primitives");
}

print("BasiDraft DXF runtime passed: frame=1, logical views=2, snapshots=5/6 primitives");
