include("scripts/Developer/BasiDraft/BasiDraftLogicalViews.js");

var document = EAction.getDocument();
if (isNull(document)) {
    throw new Error("BasiDraft revision save: no old DXF document opened");
}

var logical = BasiDraftLogicalViews.analyzeLogicalViews(document);
if (logical.views.length !== 3) {
    throw new Error("BasiDraft revision save: expected 3 old logical views, got " + logical.views.length);
}

var snapshots = [];
for (var i=0; i<logical.views.length; ++i) {
    if (logical.views[i].snapshot.unsupportedPrimitiveCount !== 0) {
        throw new Error("BasiDraft revision save: unsupported primitive in old view " + i);
    }
    snapshots.push(logical.views[i].snapshot);
}

var state = {
    schema:1,
    viewCount:snapshots.length,
    snapshots:snapshots
};

RSettings.setValue(
    "BasiDraft/RevisionSmoke/OldState",
    JSON.stringify(state),
    true
);

print("BasiDraft revision save passed: stored 3 old logical view snapshots");
