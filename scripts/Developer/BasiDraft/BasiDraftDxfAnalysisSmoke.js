include("scripts/Developer/BasiDraft/BasiDraftDxfAnalysis.js");

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

print("BasiDraft DXF analysis smoke passed: frame=1, blocks=2, loose=1, legacy annotations=1");
