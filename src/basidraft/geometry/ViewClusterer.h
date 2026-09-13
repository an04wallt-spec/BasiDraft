#pragma once

#include <cstddef>
#include <vector>

namespace basidraft::geometry {

struct ClusterBox2d {
    bool valid = false;
    double minX = 0.0;
    double minY = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;

    double width() const { return valid ? maxX - minX : 0.0; }
    double height() const { return valid ? maxY - minY : 0.0; }
    double centerX() const { return valid ? (minX + maxX) * 0.5 : 0.0; }
    double centerY() const { return valid ? (minY + maxY) * 0.5 : 0.0; }
    double area() const { return valid ? width() * height() : 0.0; }
};

struct SpatialItem {
    std::size_t sourceIndex = 0;
    ClusterBox2d box;
    std::size_t primitiveCount = 0;
};

struct ViewCluster {
    std::vector<std::size_t> sourceIndices;
    ClusterBox2d box;
    std::size_t primitiveCount = 0;
};

struct ViewClusterOptions {
    // First pass: boxes that overlap / touch within this tolerance belong to the
    // same spatial island. This should stay small and must not bridge the gap
    // between neighbouring drawing views.
    double proximityTolerance = 1.0e-4;

    // Furniture views can contain disconnected hardware / detail geometry that
    // lies completely inside the already established view extents without
    // touching its contour. Such small enclosed islands may be folded into the
    // surrounding view after primary connectivity is established.
    bool mergeContainedIslands = true;
    double containmentTolerance = 1.0e-4;
    double maximumContainedAreaFraction = 0.25;

    // A BAZIS view can contain disconnected upper / lower geometry. The next
    // pass may merge vertically separated islands only when their horizontal
    // spans are strongly aligned. All thresholds are conservative and exposed.
    bool mergeVerticallyAlignedIslands = true;
    double minimumHorizontalSpanRatio = 0.80;
    double maximumCenterOffsetFraction = 0.10;
    double maximumVerticalGapHeightFraction = 0.75;
};

std::vector<ViewCluster> clusterLogicalViews(
    const std::vector<SpatialItem>& items,
    const ViewClusterOptions& options = {}
);

} // namespace basidraft::geometry
