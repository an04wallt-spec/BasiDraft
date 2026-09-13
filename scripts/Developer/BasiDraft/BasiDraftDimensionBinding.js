include("scripts/Developer/BasiDraft/BasiDraftRuntimeRevision.js");

/**
 * Stores and updates BasiDraft semantic bindings on native QCAD dimensions.
 *
 * The binding is deliberately geometry-based. It does not store DXF block names
 * because BAZIS renumbers anonymous blocks between exports.
 */
function BasiDraftDimensionBinding() {
}

BasiDraftDimensionBinding.Title = "BasiDraft";
BasiDraftDimensionBinding.Key = "DimensionBinding";
BasiDraftDimensionBinding.StatusKey = "DimensionBindingStatus";
BasiDraftDimensionBinding.Version = 1;

BasiDraftDimensionBinding.makeLineBinding = function(oldViewIndex, endpointIndex, line) {
    return {
        version:BasiDraftDimensionBinding.Version,
        kind:"line",
        oldViewIndex:oldViewIndex,
        endpointIndex:endpointIndex,
        line:{x1:line.x1, y1:line.y1, x2:line.x2, y2:line.y2}
    };
};

BasiDraftDimensionBinding.attach = function(entity, binding) {
    if (isNull(entity) || isNull(binding)) {
        return false;
    }
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
        if (binding.version !== BasiDraftDimensionBinding.Version ||
            binding.kind !== "line" ||
            (binding.endpointIndex !== 1 && binding.endpointIndex !== 2) ||
            isNull(binding.line)) {
            return undefined;
        }
        return binding;
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

/**
 * Produces a non-destructive plan for one dimension.
 *
 * Statuses:
 *   Current     - bound geometry is unchanged.
 *   Updated     - the bound line moved unambiguously.
 *   NeedsReview - the old line changed but no unique translated successor exists.
 *   Lost        - the bound view no longer has a safe match.
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

    // A view that remained unchanged requires no dimension mutation.
    if (updateResult.unchangedViews.indexOf(binding.oldViewIndex) !== -1) {
        return {bound:true, status:"Current", dx:0, dy:0, binding:binding};
    }

    var changed = BasiDraftDimensionBinding.findChangedView(
        updateResult,
        binding.oldViewIndex
    );
    if (isNull(changed)) {
        return {bound:true, status:"Lost", dx:0, dy:0, binding:binding};
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

    // The view changed somewhere else: this anchor is still valid.
    if (isNull(removedLine)) {
        return {bound:true, status:"Current", dx:0, dy:0, binding:binding};
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

    // Multiple candidates are allowed only if they represent the same motion.
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

BasiDraftDimensionBinding.applyPlan = function(documentInterface, entity, plan) {
    if (isNull(documentInterface) || isNull(entity) || isNull(plan) || !plan.bound) {
        return false;
    }

    if (plan.status !== "Updated") {
        if (plan.status === "NeedsReview" || plan.status === "Lost") {
            var statusClone = entity.cloneToDimRotatedEntity();
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
        return false;
    }

    var clone = entity.cloneToDimRotatedEntity();
    var binding = plan.binding;
    var p;
    if (binding.endpointIndex === 1) {
        p = clone.getExtensionPoint1();
        clone.setExtensionPoint1(new RVector(p.x + plan.dx, p.y + plan.dy, p.z));
    }
    else {
        p = clone.getExtensionPoint2();
        clone.setExtensionPoint2(new RVector(p.x + plan.dx, p.y + plan.dy, p.z));
    }

    // Advance the stored anchor so subsequent DXF revisions compare against the
    // geometry that is now current in the document.
    binding.line.x1 += plan.dx;
    binding.line.y1 += plan.dy;
    binding.line.x2 += plan.dx;
    binding.line.y2 += plan.dy;
    binding.oldViewIndex = plan.newViewIndex;
    clone.setCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.Key,
        JSON.stringify(binding)
    );
    clone.setCustomProperty(
        BasiDraftDimensionBinding.Title,
        BasiDraftDimensionBinding.StatusKey,
        "Current"
    );

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
