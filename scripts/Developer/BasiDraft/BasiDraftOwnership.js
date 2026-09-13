/**
 * Common ownership marker for native QCAD entities created by BasiDraft.
 *
 * Imported BAZIS / DXF source geometry deliberately remains unowned. This
 * lets UpdateFromDxf replace only source geometry while preserving BasiDraft
 * dimensions, leaders, notes and other documentation entities.
 */
function BasiDraftOwnership() {
}

BasiDraftOwnership.Title = "BasiDraft";
BasiDraftOwnership.OwnedKey = "Owned";
BasiDraftOwnership.KindKey = "Kind";

BasiDraftOwnership.mark = function(entity, kind) {
    if (isNull(entity)) {
        return false;
    }
    entity.setCustomProperty(
        BasiDraftOwnership.Title,
        BasiDraftOwnership.OwnedKey,
        true
    );
    if (!isNull(kind) && kind.toString().length > 0) {
        entity.setCustomProperty(
            BasiDraftOwnership.Title,
            BasiDraftOwnership.KindKey,
            kind.toString()
        );
    }
    return true;
};

BasiDraftOwnership.isOwned = function(entity) {
    if (isNull(entity) || !entity.hasCustomProperty(
            BasiDraftOwnership.Title,
            BasiDraftOwnership.OwnedKey)) {
        return false;
    }
    return entity.getCustomBoolProperty(
        BasiDraftOwnership.Title,
        BasiDraftOwnership.OwnedKey,
        false
    );
};

BasiDraftOwnership.kind = function(entity) {
    if (isNull(entity) || !entity.hasCustomProperty(
            BasiDraftOwnership.Title,
            BasiDraftOwnership.KindKey)) {
        return "";
    }
    return entity.getCustomProperty(
        BasiDraftOwnership.Title,
        BasiDraftOwnership.KindKey,
        ""
    ).toString();
};
