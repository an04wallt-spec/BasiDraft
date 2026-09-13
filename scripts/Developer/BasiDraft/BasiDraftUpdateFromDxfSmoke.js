include("scripts/Developer/BasiDraft/BasiDraftUpdateFromDxf.js");

var currentDocument = EAction.getDocument();
if (isNull(currentDocument)) {
    throw new Error("BasiDraft UpdateFromDxf smoke: no current old DXF document");
}

var oldInfo = new QFileInfo(currentDocument.getFileName());
var newFileName = oldInfo.absolutePath() + QDir.separator +
    "basidraft_revision_new_r12.dxf";

var result = BasiDraftUpdateFromDxf.compare(
    currentDocument,
    newFileName
);

if (!result.ok) {
    throw new Error("BasiDraft UpdateFromDxf smoke failed: " + result.error);
}
if (result.oldLogical.views.length !== 3 || result.newLogical.views.length !== 3) {
    throw new Error("Expected 3 old and 3 new logical views");
}
if (result.changedViews.length !== 2) {
    throw new Error("Expected exactly 2 changed views, got " + result.changedViews.length);
}
if (result.unchangedViews.length !== 1 || result.unchangedViews[0] !== 2) {
    throw new Error("Expected right logical view to remain unchanged");
}
if (result.ambiguousViews.length !== 0 ||
    result.unmatchedOldViews.length !== 0 ||
    result.unmatchedNewViews.length !== 0) {
    throw new Error("UpdateFromDxf produced ambiguous or unmatched views");
}

var front = result.changedViews[0];
var section = result.changedViews[1];
if (front.oldViewIndex !== 0 || front.newViewIndex !== 0 ||
    front.removedPrimitiveCount !== 3 || front.addedPrimitiveCount !== 3) {
    throw new Error("Wrong front-view localized revision");
}
if (!front.motion.detected || front.motion.ambiguous ||
    Math.abs(front.motion.dx) > 1.0e-6 ||
    Math.abs(front.motion.dy-2.772) > 1.0e-6) {
    throw new Error("Wrong front shelf motion");
}

if (section.oldViewIndex !== 1 || section.newViewIndex !== 1 ||
    section.removedPrimitiveCount !== 4 || section.addedPrimitiveCount !== 4) {
    throw new Error("Wrong section-view localized revision");
}
if (!section.motion.detected || section.motion.ambiguous ||
    Math.abs(section.motion.dx) > 1.0e-6 ||
    Math.abs(section.motion.dy-2.772) > 1.0e-6) {
    throw new Error("Wrong section shelf motion");
}

print(
    "BasiDraft UpdateFromDxf runtime passed: hidden import, 3 matched views, " +
    "2 changed, shelf dy=2.772, 1 unchanged"
);
