include("scripts/Developer/BasiDraft/BasiDraftRuntimeRevision.js");
include("scripts/Developer/BasiDraft/BasiDraftOwnership.js");

/**
 * Stores and updates BasiDraft semantic bindings on native QCAD dimensions.
 *
 * Bindings are deliberately geometry / view-feature based. DXF block names are
 * never persisted because BAZIS renumbers anonymous blocks between exports.
 *
 * Supported binding kinds:
 *   line       - one dimension endpoint follows one concrete geometry line;
 *   viewExtent - both endpoints follow a logical view bounding feature
 *                (overall width or overall height).
 */
function BasiDraftDimensionBinding() {
}

BasiDraftDimensionBinding.Title = "BasiDraft";
BasiDraftDimensionBinding.Key = "DimensionBinding";
BasiDraftDimensionBinding.StatusKey = "DimensionBindingStatus";
BasiDraftDimensionBinding.Version = 2;

BasiDraftDimensionBinding.makeLineBinding = function(oldViewIndex, endpointIndex, line) {
    return {
        version:BasiDraftDimensionBinding.Version,
        kind:"line",
        oldViewIndex:oldViewIndex,
        endpointIndex:endpointIndex,
        line:{x1:line.x1, y1:line.y1, x2:line.x2, y2:line.y2}
    };
};

BasiDraftDimensionBinding.makeViewExtentBinding = function(oldViewIndex, mode) {
    if (mode !== "width" && mode !== "height") {
        return undefined;
    }
    return {
        version:BasiDraftDimensionBinding.Version,
        kind:"viewExtent",
        oldViewIndex:oldViewIndex,
        mode:mode
    };
};

BasiDraftDimensionBinding.attach = function(entity, binding) {
    if (isNull(entity) || isNull(binding)) {
        return false;
    }
    BasiDraftOwnership.mark(entity, "Dimension");
    entity.setCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.Key,
        JSON.stringify(binding)
    );
    entity.setCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.StatusKey,
        "Current"
    );
    return true;
};

BasiDraftDimensionBinding.read = function(entity) {
    if (isNull(entity) || !entity.hasCustomProperty(
            BasiDraftDimensionBinding.Title,
            BasiDraftDimensionBinding.Key)) {
        return undefined;
    }

    var raw = entity.getCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.Key,
        ""
    );
    if (isNull(raw) || raw.toString().length === 0) {
        return undefined;
    }

    try {
        var binding = JSON.parse(raw.toString());
        // Version 1 line bindings are accepted for forward migration. New
        // bindings are always written as Version 2.
        if (binding.version !== 1 && binding.version !== BasiDraftDimensionBinding.Version) {
            return undefined;
        }
        if (typeof binding.oldViewIndex !== "number" || binding.oldViewIndex < 0) {
            return undefined;
        }

        if (binding.kind === "line") {
            if ((binding.endpointIndex !== 1 && binding.endpointIndex !== 2) ||
                isNull(binding.line)) {
                return undefined;
            }
            return binding;
        }

        if (binding.kind === "viewExtent") {
            if (binding.mode !== "width" && binding.mode !== "height") {
                return undefined;
            }
            return binding;
        }

        return undefined;
    }
    catch (e) {
        return undefined;
    }
};

BasiDraftDimensionBinding.close = function(a, b, tolerance) {
    return Math.abs(a-b) <= tolerance;
};

BasiDraftDimensionBinding.sameLine = function(a, b, tolerance) {
    if (isNull(a) || isNull(b)) {
        return false;
    }

    function point(ax, ay, bx, by) {
        return BasiDraftDimensionBinding.close(ax, bx, tolerance) &&
               BasiDraftDimensionBinding.close(ay, by, tolerance);
    }

    return (point(a.x1,a.y1,b.x1,b.y1) && point(a.x2,a.y2,b.x2,b.y2)) ||
           (point(a.x1,a.y1,b.x2,b.y2) && point(a.x2,a.y2,b.x1,b.y1));
};

BasiDraftDimensionBinding.findChangedView = function(updateResult, oldViewIndex) {
    for (var i=0; i<updateResult.changedViews.length; ++i) {
        if (updateResult.changedViews[i].oldViewIndex === oldViewIndex) {
            return updateResult.changedViews[i];
        }
    }
    return undefined;
};

BasiDraftDimensionBinding.findRevision = function(updateResult, oldViewIndex) {
    if (isNull(updateResult) || isNull(updateResult.revision) ||
        isNull(updateResult.revision.oldViews) ||
        oldViewIndex < 0 || oldViewIndex >= updateResult.revision.oldViews.length) {
        return undefined;
    }
    return updateResult.revision.oldViews[oldViewIndex];
};

BasiDraftDimensionBinding.viewExtentPoints = function(box, mode) {
    if (isNull(box)) {
        return undefined;
    }
    if (mode === "width") {
        return {
            p1:{x:box.minX, y:box.minY},
            p2:{x:box.maxX, y:box.minY}
        };
    }
    if (mode === "height") {
        return {
            p1:{x:box.minX, y:box.minY},
            p2:{x:box.minX, y:box.maxY}
        };
    }
    return undefined;
};

BasiDraftDimensionBinding.planViewExtent = function(binding, updateResult, tolerance) {
    var revision = BasiDraftDimensionBinding.findRevision(updateResult, binding.oldViewIndex);
    if (isNull(revision)) {
        return {bound:true, status:"Lost", binding:binding};
    }
    if (revision.ambiguous) {
        return {bound:true, status:"NeedsReview", binding:binding};
    }
    if (!revision.matched) {
        return {bound:true, status:"Lost", binding:binding};
    }

    if (isNull(updateResult.oldLogical) || isNull(updateResult.newLogical) ||
        binding.oldViewIndex >= updateResult.oldLogical.views.length ||
        revision.newViewIndex >= updateResult.newLogical.views.length) {
        return {bound:true, status:"Lost", binding:binding};
    }

    var oldBox = updateResult.oldLogical.views[binding.oldViewIndex].box;
    var newBox = updateResult.newLogical.views[revision.newViewIndex].box;
    var oldPoints = BasiDraftDimensionBinding.viewExtentPoints(oldBox, binding.mode);
    var newPoints = BasiDraftDimensionBinding.viewExtentPoints(newBox, binding.mode);
    if (isNull(oldPoints) || isNull(newPoints)) {
        return {bound:true, status:"NeedsReview", binding:binding};
    }

    var changed =
        !BasiDraftDimensionBinding.close(oldPoints.p1.x, newPoints.p1.x, tolerance) ||
        !BasiDraftDimensionBinding.close(oldPoints.p1.y, newPoints.p1.y, tolerance) ||
        !BasiDraftDimensionBinding.close(oldPoints.p2.x, newPoints.p2.x, tolerance) ||
        !BasiDraftDimensionBinding.close(oldPoints.p2.y, newPoints.p2.y, tolerance);

    var oldMidX = (oldPoints.p1.x + oldPoints.p2.x) * 0.5;
    var oldMidY = (oldPoints.p1.y + oldPoints.p2.y) * 0.5;
    var newMidX = (newPoints.p1.x + newPoints.p2.x) * 0.5;
    var newMidY = (newPoints.p1.y + newPoints.p2.y) * 0.5;

    if (!changed) {
        return {
            bound:true,
            status:"Current",
            binding:binding,
            newViewIndex:revision.newViewIndex,
            metadataChanged:binding.oldViewIndex !== revision.newViewIndex
        };
    }

    return {
        bound:true,
        status:"Updated",
        binding:binding,
        newViewIndex:revision.newViewIndex,
        newExtensionPoint1:newPoints.p1,
        newExtensionPoint2:newPoints.p2,
        definitionDx:newMidX-oldMidX,
        definitionDy:newMidY-oldMidY
    };
};

BasiDraftDimensionBinding.planLine = function(binding, updateResult, tolerance) {
    var revision = BasiDraftDimensionBinding.findRevision(updateResult, binding.oldViewIndex);
    if (isNull(revision)) {
        return {bound:true, status:"Lost", dx:0, dy:0, binding:binding};
    }
    if (revision.ambiguous) {
        return {bound:true, status:"NeedsReview", dx:0, dy:0, binding:binding};
    }
    if (!revision.matched) {
        return {bound:true, status:"Lost", dx:0, dy:0, binding:binding};
    }

    var changed = BasiDraftDimensionBinding.findChangedView(
        updateResult,
        binding.oldViewIndex
    );

    if (isNull(changed)) {
        // The geometry is identical in normalized coordinates. If the complete
        // view moved on the sheet, follow that translation as one safe motion.
        var oldBox = updateResult.oldLogical.views[binding.oldViewIndex].box;
        var newBox = updateResult.newLogical.views[revision.newViewIndex].box;
        var viewDx = newBox.minX-oldBox.minX;
        var viewDy = newBox.minY-oldBox.minY;
        if (!BasiDraftDimensionBinding.close(viewDx, 0.0, tolerance) ||
            !BasiDraftDimensionBinding.close(viewDy, 0.0, tolerance)) {
            return {
                bound:true,
                status:"Updated",
                dx:viewDx,
                dy:viewDy,
                binding:binding,
                newViewIndex:revision.newViewIndex
            };
        }
        return {
            bound:true,
            status:"Current",
            dx:0,
            dy:0,
            binding:binding,
            newViewIndex:revision.newViewIndex,
            metadataChanged:binding.oldViewIndex !== revision.newViewIndex
        };
    }

    var removedLine;
    for (var r=0; r<changed.diff.removed.lines.length; ++r) {
        if (BasiDraftDimensionBinding.sameLine(
                binding.line,
                changed.diff.removed.lines[r],
                tolerance)) {
            removedLine = changed.diff.removed.lines[r];
            break;
        }
    }

    if (isNull(removedLine)) {
        // The bound line itself did not change. If the view's world origin also
        // changed while some other local geometry changed, automatic translation
        // is not provably safe: force review instead of guessing.
        var oldChangedBox = updateResult.oldLogical.views[binding.oldViewIndex].box;
        var newChangedBox = updateResult.newLogical.views[changed.newViewIndex].box;
        if (!BasiDraftDimensionBinding.close(
                oldChangedBox.minX, newChangedBox.minX, tolerance) ||
            !BasiDraftDimensionBinding.close(
                oldChangedBox.minY, newChangedBox.minY, tolerance)) {
            return {bound:true, status:"NeedsReview", dx:0, dy:0, binding:binding};
        }
        return {
            bound:true,
            status:"Current",
            dx:0,
            dy:0,
            binding:binding,
            newViewIndex:changed.newViewIndex,
            metadataChanged:binding.oldViewIndex !== changed.newViewIndex
        };
    }

    var candidates = [];
    for (var a=0; a<changed.diff.added.lines.length; ++a) {
        var motion = BasiDraftRuntimeRevision.sameTranslatedLine(
            removedLine,
            changed.diff.added.lines[a],
            tolerance
        );
        if (!isNull(motion)) {
            candidates.push(motion);
        }
    }

    if (candidates.length === 0) {
        return {bound:true, status:"NeedsReview", dx:0, dy:0, binding:binding};
    }

    var dx = candidates[0].dx;
    var dy = candidates[0].dy;
    for (var c=1; c<candidates.length; ++c) {
        if (!BasiDraftDimensionBinding.close(candidates[c].dx, dx, tolerance) ||
            !BasiDraftDimensionBinding.close(candidates[c].dy, dy, tolerance)) {
            return {bound:true, status:"NeedsReview", dx:0, dy:0, binding:binding};
        }
    }

    if (!changed.motion.detected || changed.motion.ambiguous ||
        !BasiDraftDimensionBinding.close(changed.motion.dx, dx, tolerance) ||
        !BasiDraftDimensionBinding.close(changed.motion.dy, dy, tolerance)) {
        return {bound:true, status:"NeedsReview", dx:0, dy:0, binding:binding};
    }

    return {
        bound:true,
        status:"Updated",
        dx:dx,
        dy:dy,
        binding:binding,
        newViewIndex:changed.newViewIndex
    };
};

/**
 * Produces a non-destructive plan for one dimension.
 *
 * Statuses:
 *   Current     - semantic anchors are unchanged.
 *   Updated     - semantic anchors moved unambiguously.
 *   NeedsReview - geometry changed but no unique safe successor exists.
 *   Lost        - the bound logical view no longer has a safe match.
 */
BasiDraftDimensionBinding.plan = function(entity, updateResult, tolerance) {
    if (isNull(tolerance)) {
        tolerance = 1.0e-4;
    }

    var binding = BasiDraftDimensionBinding.read(entity);
    if (isNull(binding)) {
        return {bound:false, status:"Unbound", dx:0, dy:0};
    }

    if (!updateResult.ok) {
        return {bound:true, status:"NeedsReview", dx:0, dy:0, binding:binding};
    }

    if (binding.kind === "viewExtent") {
        return BasiDraftDimensionBinding.planViewExtent(binding, updateResult, tolerance);
    }
    return BasiDraftDimensionBinding.planLine(binding, updateResult, tolerance);
};

BasiDraftDimensionBinding.writeBinding = function(clone, binding, status) {
    binding.version = BasiDraftDimensionBinding.Version;
    clone.setCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.Key,
        JSON.stringify(binding)
    );
    clone.setCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.StatusKey,
        status
    );
};

BasiDraftDimensionBinding.applyPlan = function(documentInterface, entity, plan) {
    if (isNull(documentInterface) || isNull(entity) || isNull(plan) || !plan.bound) {
        return false;
    }

    if (plan.status === "NeedsReview" || plan.status === "Lost") {
        var statusClone = entity.cloneToDimRotatedEntity();
        BasiDraftOwnership.mark(statusClone, "Dimension");
        statusClone.setCustomProperty(
            BasiDraftDimensionBinding.Title,
            BasiDraftDimensionBinding.StatusKey,
            plan.status
        );
        var statusOp = new RModifyObjectOperation(statusClone);
        statusOp.setText(qsTr("BasiDraft: статус привязки размера"));
        documentInterface.applyOperation(statusOp);
        return true;
    }

    if (plan.status === "Current") {
        if (!plan.metadataChanged) {
            return false;
        }
        var currentClone = entity.cloneToDimRotatedEntity();
        BasiDraftOwnership.mark(currentClone, "Dimension");
        var currentBinding = plan.binding;
        currentBinding.oldViewIndex = plan.newViewIndex;
        BasiDraftDimensionBinding.writeBinding(currentClone, currentBinding, "Current");
        var currentOp = new RModifyObjectOperation(currentClone);
        currentOp.setText(qsTr("BasiDraft: перепривязка размера к виду"));
        documentInterface.applyOperation(currentOp);
        return true;
    }

    if (plan.status !== "Updated") {
        return false;
    }

    var clone = entity.cloneToDimRotatedEntity();
    BasiDraftOwnership.mark(clone, "Dimension");
    var binding = plan.binding;

    if (binding.kind === "line") {
        var p;
        if (binding.endpointIndex === 1) {
            p = clone.getExtensionPoint1();
            clone.setExtensionPoint1(new RVector(p.x + plan.dx, p.y + plan.dy, p.z));
        }
        else {
            p = clone.getExtensionPoint2();
            clone.setExtensionPoint2(new RVector(p.x + plan.dx, p.y + plan.dy, p.z));
        }

        binding.line.x1 += plan.dx;
        binding.line.y1 += plan.dy;
        binding.line.x2 += plan.dx;
        binding.line.y2 += plan.dy;
    }
    else if (binding.kind === "viewExtent") {
        var oldP1 = clone.getExtensionPoint1();
        var oldP2 = clone.getExtensionPoint2();
        clone.setExtensionPoint1(new RVector(
            plan.newExtensionPoint1.x,
            plan.newExtensionPoint1.y,
            oldP1.z
        ));
        clone.setExtensionPoint2(new RVector(
            plan.newExtensionPoint2.x,
            plan.newExtensionPoint2.y,
            oldP2.z
        ));
        var def = clone.getDefinitionPoint();
        clone.setDefinitionPoint(new RVector(
            def.x + plan.definitionDx,
            def.y + plan.definitionDy,
            def.z
        ));
    }
    else {
        return false;
    }

    binding.oldViewIndex = plan.newViewIndex;
    BasiDraftDimensionBinding.writeBinding(clone, binding, "Current");

    var op = new RModifyObjectOperation(clone);
    op.setText(qsTr("BasiDraft: обновление привязанного размера"));
    documentInterface.applyOperation(op);
    return true;
};

BasiDraftDimensionBinding.applyAll = function(documentInterface, updateResult, tolerance) {
    var result = {updated:0, current:0, needsReview:0, lost:0, unbound:0};
    if (isNull(documentInterface)) {
        return result;
    }

    var document = documentInterface.getDocument();
    var ids = document.queryAllEntities(false, false, RS.EntityDimRotated);
    for (var i=0; i<ids.length; ++i) {
        var entity = document.queryEntity(ids[i]);
        var plan = BasiDraftDimensionBinding.plan(entity, updateResult, tolerance);
        if (!plan.bound) {
            ++result.unbound;
            continue;
        }

        if (plan.status === "Updated") {
            if (BasiDraftDimensionBinding.applyPlan(documentInterface, entity, plan)) {
                ++result.updated;
            }
        }
        else if (plan.status === "Current") {
            ++result.current;
            if (plan.metadataChanged) {
                BasiDraftDimensionBinding.applyPlan(documentInterface, entity, plan);
            }
        }
        else if (plan.status === "NeedsReview") {
            ++result.needsReview;
            BasiDraftDimensionBinding.applyPlan(documentInterface, entity, plan);
        }
        else if (plan.status === "Lost") {
            ++result.lost;
            BasiDraftDimensionBinding.applyPlan(documentInterface, entity, plan);
        }
    }
    return result;
};
