#include "DimensionBindingUpdater.h"

#include <cmath>

namespace basidraft::dimensions {
namespace {

bool nearlyEqual(double a, double b, double tolerance) {
    return std::abs(a - b) <= tolerance;
}

bool sameLineGeometry(const Line2d& a, const Line2d& b, double tolerance) {
    const bool direct =
        nearlyEqual(a.x1, b.x1, tolerance) &&
        nearlyEqual(a.y1, b.y1, tolerance) &&
        nearlyEqual(a.x2, b.x2, tolerance) &&
        nearlyEqual(a.y2, b.y2, tolerance);

    if (direct) {
        return true;
    }

    return
        nearlyEqual(a.x1, b.x2, tolerance) &&
        nearlyEqual(a.y1, b.y2, tolerance) &&
        nearlyEqual(a.x2, b.x1, tolerance) &&
        nearlyEqual(a.y2, b.y1, tolerance);
}

bool isRemovedFeature(
    const Line2d& line,
    const SnapshotDiff& diff,
    double tolerance) {

    for (const Line2d& removed : diff.removed.lines) {
        if (sameLineGeometry(line, removed, tolerance)) {
            return true;
        }
    }
    return false;
}

Line2d translated(const Line2d& line, const LocalTranslation& motion) {
    return Line2d{
        line.x1 + motion.dx,
        line.y1 + motion.dy,
        line.x2 + motion.dx,
        line.y2 + motion.dy
    };
}

} // namespace

LinearDimensionBindingUpdate updateLinearDimensionBinding(
    const LinearDimensionBinding& binding,
    const SnapshotDiff& diff,
    const LocalTranslation& motion,
    double coordinateTolerance) {

    LinearDimensionBindingUpdate result;
    result.binding = binding;

    result.firstFeatureMoved = isRemovedFeature(
        binding.first.line,
        diff,
        coordinateTolerance
    );
    result.secondFeatureMoved = isRemovedFeature(
        binding.second.line,
        diff,
        coordinateTolerance
    );

    if (!result.firstFeatureMoved && !result.secondFeatureMoved) {
        result.status = BindingUpdateStatus::Unchanged;
        return result;
    }

    if (!motion.detected || motion.ambiguous) {
        result.status = BindingUpdateStatus::NeedsReview;
        return result;
    }

    if (result.firstFeatureMoved) {
        result.binding.first.line = translated(binding.first.line, motion);
    }
    if (result.secondFeatureMoved) {
        result.binding.second.line = translated(binding.second.line, motion);
    }

    result.status = BindingUpdateStatus::Updated;
    return result;
}

} // namespace basidraft::dimensions
