#include "dimensions/DimensionBindingUpdater.h"
#include "geometry/LocalRevisionMotion.h"
#include "geometry/ViewMatcher.h"

#include <cassert>
#include <cmath>
#include <iostream>

using basidraft::dimensions::BindingUpdateStatus;
using basidraft::dimensions::LineFeatureBinding;
using basidraft::dimensions::LinearDimensionBinding;
using basidraft::geometry::Line2d;
using basidraft::geometry::MatchOptions;
using basidraft::geometry::ViewSnapshot;

namespace {

bool nearlyEqual(double a, double b, double tolerance = 1.0e-6) {
    return std::abs(a - b) <= tolerance;
}

ViewSnapshot makeShelfView(double shelfY) {
    ViewSnapshot view;

    // Stable outer / internal geometry.
    view.lines.push_back(Line2d{0.0, 0.0, 100.0, 0.0});
    view.lines.push_back(Line2d{100.0, 0.0, 100.0, 200.0});
    view.lines.push_back(Line2d{0.0, 200.0, 100.0, 200.0});
    view.lines.push_back(Line2d{0.0, 0.0, 0.0, 200.0});
    for (int i = 1; i <= 8; ++i) {
        const double x = i * 10.0;
        view.lines.push_back(Line2d{x, 0.0, x, 200.0});
    }

    // Shelf-related local geometry: exactly three lines translated together.
    view.lines.push_back(Line2d{20.0, shelfY, 80.0, shelfY});
    view.lines.push_back(Line2d{20.0, shelfY - 1.232, 20.0, shelfY});
    view.lines.push_back(Line2d{80.0, shelfY - 1.232, 80.0, shelfY});
    return view;
}

} // namespace

int main() {
    MatchOptions matchOptions;
    matchOptions.coordinateTolerance = 1.0e-4;
    matchOptions.ignoreTranslation = true;

    const double shelfMove = 2.772;
    const ViewSnapshot oldView = makeShelfView(100.0);
    const ViewSnapshot newView = makeShelfView(100.0 + shelfMove);

    const auto diff = basidraft::geometry::diffViewSnapshots(
        oldView,
        newView,
        matchOptions
    );

    assert(diff.similarity.removedPrimitiveCount == 3);
    assert(diff.similarity.addedPrimitiveCount == 3);
    assert(diff.removed.lines.size() == 3);
    assert(diff.added.lines.size() == 3);

    const auto motion = basidraft::geometry::detectLocalLineTranslation(diff);
    assert(motion.detected);
    assert(!motion.ambiguous);
    assert(motion.supportCount == 3);
    assert(nearlyEqual(motion.dx, 0.0));
    assert(nearlyEqual(motion.dy, shelfMove));

    // A dimension from the cabinet bottom to the shelf is revision-aware: the
    // fixed outer edge stays put while the shelf feature follows the detected
    // local translation.
    LinearDimensionBinding shelfDimension;
    shelfDimension.first = LineFeatureBinding{Line2d{0.0, 0.0, 100.0, 0.0}};
    shelfDimension.second = LineFeatureBinding{Line2d{20.0, 100.0, 80.0, 100.0}};

    const auto shelfUpdate = basidraft::dimensions::updateLinearDimensionBinding(
        shelfDimension,
        diff,
        motion
    );

    assert(shelfUpdate.status == BindingUpdateStatus::Updated);
    assert(!shelfUpdate.firstFeatureMoved);
    assert(shelfUpdate.secondFeatureMoved);
    assert(nearlyEqual(shelfUpdate.binding.second.line.y1, 100.0 + shelfMove));
    assert(nearlyEqual(shelfUpdate.binding.second.line.y2, 100.0 + shelfMove));

    // Overall dimensions remain untouched when their source edges did not
    // participate in the local model revision.
    LinearDimensionBinding overallDimension;
    overallDimension.first = LineFeatureBinding{Line2d{0.0, 0.0, 0.0, 200.0}};
    overallDimension.second = LineFeatureBinding{Line2d{100.0, 0.0, 100.0, 200.0}};

    const auto overallUpdate = basidraft::dimensions::updateLinearDimensionBinding(
        overallDimension,
        diff,
        motion
    );

    assert(overallUpdate.status == BindingUpdateStatus::Unchanged);
    assert(!overallUpdate.firstFeatureMoved);
    assert(!overallUpdate.secondFeatureMoved);

    // If changed geometry cannot be explained by one reliable local motion, a
    // dependent dimension is explicitly routed to review instead of guessed.
    auto unsafeMotion = motion;
    unsafeMotion.detected = false;
    const auto reviewUpdate = basidraft::dimensions::updateLinearDimensionBinding(
        shelfDimension,
        diff,
        unsafeMotion
    );
    assert(reviewUpdate.status == BindingUpdateStatus::NeedsReview);

    std::cout << "BasiDraft dimension revision tests passed\n";
    return 0;
}
