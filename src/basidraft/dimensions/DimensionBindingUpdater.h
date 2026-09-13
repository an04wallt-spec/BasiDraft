#pragma once

#include "geometry/LocalRevisionMotion.h"

namespace basidraft::dimensions {

using basidraft::geometry::Line2d;
using basidraft::geometry::LocalTranslation;
using basidraft::geometry::SnapshotDiff;

struct LineFeatureBinding {
    // Geometry identity captured when the BasiDraft dimension is created.
    // The user-facing dimension point can later be derived from this feature;
    // this first implementation tracks line features because furniture shelves,
    // partitions and outer edges are predominantly linear.
    Line2d line;
};

struct LinearDimensionBinding {
    LineFeatureBinding first;
    LineFeatureBinding second;
};

enum class BindingUpdateStatus {
    Unchanged,
    Updated,
    NeedsReview
};

struct LinearDimensionBindingUpdate {
    BindingUpdateStatus status = BindingUpdateStatus::Unchanged;
    LinearDimensionBinding binding;
    bool firstFeatureMoved = false;
    bool secondFeatureMoved = false;
};

// Updates a dimension binding after a localized view revision. Only features
// that are explicitly present in diff.removed are considered changed. They are
// moved automatically only when one dominant local translation was detected.
LinearDimensionBindingUpdate updateLinearDimensionBinding(
    const LinearDimensionBinding& binding,
    const SnapshotDiff& diff,
    const LocalTranslation& motion,
    double coordinateTolerance = 1.0e-4
);

} // namespace basidraft::dimensions
