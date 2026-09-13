#include "geometry/ViewClusterer.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

using basidraft::geometry::ClusterBox2d;
using basidraft::geometry::SpatialItem;
using basidraft::geometry::ViewClusterOptions;

namespace {

ClusterBox2d box(double minX, double minY, double maxX, double maxY) {
    ClusterBox2d result;
    result.valid = true;
    result.minX = minX;
    result.minY = minY;
    result.maxX = maxX;
    result.maxY = maxY;
    return result;
}

bool nearlyEqual(double a, double b, double tolerance = 1.0e-6) {
    return std::abs(a - b) <= tolerance;
}

} // namespace

int main() {
    ViewClusterOptions options;
    options.proximityTolerance = 1.0e-4;
    options.mergeContainedIslands = true;
    options.containmentTolerance = 1.0e-4;
    options.maximumContainedAreaFraction = 0.25;
    options.minimumHorizontalSpanRatio = 0.80;
    options.maximumCenterOffsetFraction = 0.10;
    options.maximumVerticalGapHeightFraction = 0.75;

    // Geometry pattern measured from the clean production-style BAZIS DXF:
    // primary connectivity / block analysis yields four spatial islands while
    // the drawing contains three logical views. The right-hand section is split
    // into two disconnected islands with essentially the same horizontal span.
    {
        const std::vector<SpatialItem> items = {
            {0, box(18.4862, 52.8839, 229.4662, 263.8639), 850},
            {1, box(248.7162, 52.8839, 328.7192, 263.8639), 500},
            {2, box(352.8853, 39.3176, 398.7820, 111.7726), 140},
            {3, box(352.8853, 151.1084, 398.7820, 223.5633), 403},
        };

        const auto clusters = basidraft::geometry::clusterLogicalViews(items, options);
        assert(clusters.size() == 3);

        assert(clusters[0].sourceIndices.size() == 1);
        assert(clusters[0].sourceIndices[0] == 0);

        assert(clusters[1].sourceIndices.size() == 1);
        assert(clusters[1].sourceIndices[0] == 1);

        assert(clusters[2].sourceIndices.size() == 2);
        assert(clusters[2].sourceIndices[0] == 2);
        assert(clusters[2].sourceIndices[1] == 3);
        assert(clusters[2].primitiveCount == 543);
        assert(nearlyEqual(clusters[2].box.minY, 39.3176));
        assert(nearlyEqual(clusters[2].box.maxY, 223.5633));
    }

    // Real furniture sections can contain disconnected hardware that lies
    // completely inside the section extents. Four boundary segments establish
    // the outer view island; both a floating hardware box and a degenerate tiny
    // segment must join that view without any endpoint contact.
    {
        const std::vector<SpatialItem> items = {
            {100, box(350.0, 40.0, 400.0, 40.0), 1},
            {101, box(400.0, 40.0, 400.0, 220.0), 1},
            {102, box(350.0, 220.0, 400.0, 220.0), 1},
            {103, box(350.0, 40.0, 350.0, 220.0), 1},
            {104, box(368.0, 155.0, 371.0, 158.0), 90},
            {105, box(374.0413, 155.8687, 374.0426, 155.8687), 1},
        };

        const auto clusters = basidraft::geometry::clusterLogicalViews(items, options);
        assert(clusters.size() == 1);
        assert(clusters[0].sourceIndices.size() == 6);
        assert(clusters[0].primitiveCount == 95);
    }

    // A sizeable inset detail should not be silently swallowed simply because it
    // happens to sit inside a larger view box.
    {
        const std::vector<SpatialItem> items = {
            {110, box(0.0, 0.0, 100.0, 0.0), 1},
            {111, box(100.0, 0.0, 100.0, 100.0), 1},
            {112, box(0.0, 100.0, 100.0, 100.0), 1},
            {113, box(0.0, 0.0, 0.0, 100.0), 1},
            {114, box(20.0, 20.0, 80.0, 80.0), 20},
        };

        const auto clusters = basidraft::geometry::clusterLogicalViews(items, options);
        assert(clusters.size() == 2);
    }

    // Side-by-side drawing views with the same vertical span must never be
    // merged merely because they are similarly sized and close to each other.
    {
        const std::vector<SpatialItem> items = {
            {10, box(0.0, 0.0, 100.0, 200.0), 100},
            {11, box(120.0, 0.0, 220.0, 200.0), 100},
        };
        const auto clusters = basidraft::geometry::clusterLogicalViews(items, options);
        assert(clusters.size() == 2);
    }

    // Components that actually overlap / touch form one primary spatial island.
    {
        const std::vector<SpatialItem> items = {
            {20, box(0.0, 0.0, 50.0, 50.0), 10},
            {21, box(50.0, 10.0, 80.0, 40.0), 5},
        };
        const auto clusters = basidraft::geometry::clusterLogicalViews(items, options);
        assert(clusters.size() == 1);
        assert(clusters[0].sourceIndices.size() == 2);
        assert(clusters[0].primitiveCount == 15);
    }

    // Vertical alignment alone is not enough: a very narrow island below a wide
    // view is likely a separate detail / annotation group and must stay separate.
    {
        const std::vector<SpatialItem> items = {
            {30, box(0.0, 0.0, 100.0, 50.0), 10},
            {31, box(45.0, 60.0, 55.0, 100.0), 10},
        };
        const auto clusters = basidraft::geometry::clusterLogicalViews(items, options);
        assert(clusters.size() == 2);
    }

    std::cout << "BasiDraft logical view clusterer tests passed\n";
    return 0;
}
