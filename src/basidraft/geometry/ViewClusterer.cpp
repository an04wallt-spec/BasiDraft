#include "ViewClusterer.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <utility>

namespace basidraft::geometry {
namespace {

ClusterBox2d mergeBoxes(const ClusterBox2d& a, const ClusterBox2d& b) {
    if (!a.valid) {
        return b;
    }
    if (!b.valid) {
        return a;
    }

    ClusterBox2d result;
    result.valid = true;
    result.minX = std::min(a.minX, b.minX);
    result.minY = std::min(a.minY, b.minY);
    result.maxX = std::max(a.maxX, b.maxX);
    result.maxY = std::max(a.maxY, b.maxY);
    return result;
}

double boxDistance(const ClusterBox2d& a, const ClusterBox2d& b) {
    if (!a.valid || !b.valid) {
        return 1.0e100;
    }

    const double dx = std::max(
        std::max(b.minX - a.maxX, a.minX - b.maxX),
        0.0
    );
    const double dy = std::max(
        std::max(b.minY - a.maxY, a.minY - b.maxY),
        0.0
    );
    return std::hypot(dx, dy);
}

double verticalGap(const ClusterBox2d& a, const ClusterBox2d& b) {
    if (!a.valid || !b.valid) {
        return 1.0e100;
    }
    return std::max(
        std::max(b.minY - a.maxY, a.minY - b.maxY),
        0.0
    );
}

bool boxContains(
    const ClusterBox2d& outer,
    const ClusterBox2d& inner,
    double tolerance) {

    if (!outer.valid || !inner.valid) {
        return false;
    }

    return inner.minX >= outer.minX - tolerance &&
           inner.minY >= outer.minY - tolerance &&
           inner.maxX <= outer.maxX + tolerance &&
           inner.maxY <= outer.maxY + tolerance;
}

class DisjointSet {
public:
    explicit DisjointSet(std::size_t size)
        : parent(size), rank(size, 0) {
        std::iota(parent.begin(), parent.end(), 0);
    }

    std::size_t find(std::size_t value) {
        if (parent[value] != value) {
            parent[value] = find(parent[value]);
        }
        return parent[value];
    }

    void unite(std::size_t a, std::size_t b) {
        a = find(a);
        b = find(b);
        if (a == b) {
            return;
        }

        if (rank[a] < rank[b]) {
            std::swap(a, b);
        }
        parent[b] = a;
        if (rank[a] == rank[b]) {
            ++rank[a];
        }
    }

private:
    std::vector<std::size_t> parent;
    std::vector<unsigned int> rank;
};

ViewCluster mergeClusters(const ViewCluster& a, const ViewCluster& b) {
    ViewCluster result;
    result.sourceIndices.reserve(a.sourceIndices.size() + b.sourceIndices.size());
    result.sourceIndices.insert(
        result.sourceIndices.end(),
        a.sourceIndices.begin(),
        a.sourceIndices.end()
    );
    result.sourceIndices.insert(
        result.sourceIndices.end(),
        b.sourceIndices.begin(),
        b.sourceIndices.end()
    );
    std::sort(result.sourceIndices.begin(), result.sourceIndices.end());
    result.box = mergeBoxes(a.box, b.box);
    result.primitiveCount = a.primitiveCount + b.primitiveCount;
    return result;
}

bool shouldMergeContainedIsland(
    const ViewCluster& outer,
    const ViewCluster& inner,
    const ViewClusterOptions& options) {

    if (!outer.box.valid || !inner.box.valid) {
        return false;
    }

    const double outerArea = outer.box.area();
    const double innerArea = inner.box.area();
    if (outerArea <= 0.0 || innerArea >= outerArea) {
        return false;
    }

    if (!boxContains(outer.box, inner.box, options.containmentTolerance)) {
        return false;
    }

    // Degenerate line / point islands can be legitimate hardware or projection
    // fragments inside a view. With foreign annotations already quarantined,
    // full containment is strong enough evidence to keep them with that view.
    if (innerArea <= 0.0) {
        return true;
    }

    // Do not silently absorb a substantial inset detail / independent view.
    // The intended use is disconnected hardware and small geometry islands that
    // are visually embedded inside a much larger furniture view.
    return innerArea / outerArea <= options.maximumContainedAreaFraction;
}

bool shouldMergeVerticalIslands(
    const ViewCluster& a,
    const ViewCluster& b,
    const ViewClusterOptions& options) {

    if (!a.box.valid || !b.box.valid) {
        return false;
    }

    const double widthA = a.box.width();
    const double widthB = b.box.width();
    const double heightA = a.box.height();
    const double heightB = b.box.height();

    if (widthA <= options.proximityTolerance ||
        widthB <= options.proximityTolerance ||
        heightA <= options.proximityTolerance ||
        heightB <= options.proximityTolerance) {
        return false;
    }

    const double maxWidth = std::max(widthA, widthB);
    const double minWidth = std::min(widthA, widthB);
    const double spanRatio = minWidth / maxWidth;
    if (spanRatio < options.minimumHorizontalSpanRatio) {
        return false;
    }

    const double centerOffset = std::abs(a.box.centerX() - b.box.centerX());
    if (centerOffset > maxWidth * options.maximumCenterOffsetFraction) {
        return false;
    }

    const double gap = verticalGap(a.box, b.box);
    if (gap <= options.proximityTolerance) {
        // Overlapping/touching islands should have been joined in pass one.
        return false;
    }

    const double referenceHeight = std::max(heightA, heightB);
    if (gap > referenceHeight * options.maximumVerticalGapHeightFraction) {
        return false;
    }

    return true;
}

} // namespace

std::vector<ViewCluster> clusterLogicalViews(
    const std::vector<SpatialItem>& items,
    const ViewClusterOptions& options) {

    if (items.empty()) {
        return {};
    }

    DisjointSet sets(items.size());

    // Pass 1: form true spatial islands. This intentionally uses only a tiny
    // proximity tolerance and therefore cannot bridge ordinary spacing between
    // separate drawing views.
    for (std::size_t i = 0; i < items.size(); ++i) {
        if (!items[i].box.valid) {
            continue;
        }
        for (std::size_t j = i + 1; j < items.size(); ++j) {
            if (!items[j].box.valid) {
                continue;
            }
            if (boxDistance(items[i].box, items[j].box) <=
                options.proximityTolerance) {
                sets.unite(i, j);
            }
        }
    }

    std::vector<ViewCluster> clusters;
    std::vector<std::size_t> roots;
    roots.reserve(items.size());

    for (std::size_t i = 0; i < items.size(); ++i) {
        if (!items[i].box.valid) {
            continue;
        }

        const std::size_t root = sets.find(i);
        auto rootIt = std::find(roots.begin(), roots.end(), root);
        std::size_t clusterIndex = 0;
        if (rootIt == roots.end()) {
            roots.push_back(root);
            clusters.push_back(ViewCluster{});
            clusterIndex = clusters.size() - 1;
        }
        else {
            clusterIndex = static_cast<std::size_t>(
                std::distance(roots.begin(), rootIt)
            );
        }

        ViewCluster& cluster = clusters[clusterIndex];
        cluster.sourceIndices.push_back(items[i].sourceIndex);
        cluster.box = mergeBoxes(cluster.box, items[i].box);
        cluster.primitiveCount += items[i].primitiveCount;
    }

    for (ViewCluster& cluster : clusters) {
        std::sort(cluster.sourceIndices.begin(), cluster.sourceIndices.end());
    }

    // Pass 2: fold small disconnected islands into a surrounding view if the
    // already-established aggregate view bounds fully contain them. This is a
    // common furniture case: hinges / hardware can be disconnected from the
    // cabinet contour while still being visibly inside the same section view.
    if (options.mergeContainedIslands) {
        bool changed = true;
        while (changed) {
            changed = false;
            for (std::size_t outer = 0; outer < clusters.size() && !changed; ++outer) {
                for (std::size_t inner = 0; inner < clusters.size(); ++inner) {
                    if (outer == inner) {
                        continue;
                    }
                    if (!shouldMergeContainedIsland(clusters[outer], clusters[inner], options)) {
                        continue;
                    }

                    clusters[outer] = mergeClusters(clusters[outer], clusters[inner]);
                    clusters.erase(clusters.begin() + static_cast<std::ptrdiff_t>(inner));
                    changed = true;
                    break;
                }
            }
        }
    }

    // Pass 3: one logical view can contain disconnected upper/lower islands.
    // Merge only strongly aligned vertical islands. Repeat because merging two
    // pieces can make the complete span eligible for a third piece.
    if (options.mergeVerticallyAlignedIslands) {
        bool changed = true;
        while (changed) {
            changed = false;
            for (std::size_t i = 0; i < clusters.size() && !changed; ++i) {
                for (std::size_t j = i + 1; j < clusters.size(); ++j) {
                    if (!shouldMergeVerticalIslands(clusters[i], clusters[j], options)) {
                        continue;
                    }

                    clusters[i] = mergeClusters(clusters[i], clusters[j]);
                    clusters.erase(clusters.begin() + static_cast<std::ptrdiff_t>(j));
                    changed = true;
                    break;
                }
            }
        }
    }

    std::sort(
        clusters.begin(),
        clusters.end(),
        [](const ViewCluster& a, const ViewCluster& b) {
            if (a.box.minX != b.box.minX) {
                return a.box.minX < b.box.minX;
            }
            return a.box.minY < b.box.minY;
        }
    );

    return clusters;
}

} // namespace basidraft::geometry
