#include "ViewMatcher.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <map>
#include <tuple>
#include <utility>

namespace basidraft::geometry {
namespace {

struct Bounds {
    bool valid = false;
    double minX = 0.0;
    double minY = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;
};

void includePoint(Bounds& bounds, double x, double y) {
    if (!bounds.valid) {
        bounds.valid = true;
        bounds.minX = bounds.maxX = x;
        bounds.minY = bounds.maxY = y;
        return;
    }

    bounds.minX = std::min(bounds.minX, x);
    bounds.minY = std::min(bounds.minY, y);
    bounds.maxX = std::max(bounds.maxX, x);
    bounds.maxY = std::max(bounds.maxY, y);
}

Bounds boundsOf(const ViewSnapshot& snapshot) {
    Bounds bounds;
    for (const Line2d& line : snapshot.lines) {
        includePoint(bounds, line.x1, line.y1);
        includePoint(bounds, line.x2, line.y2);
    }
    for (const Arc2d& arc : snapshot.arcs) {
        includePoint(bounds, arc.cx - arc.radius, arc.cy - arc.radius);
        includePoint(bounds, arc.cx + arc.radius, arc.cy + arc.radius);
    }
    for (const Circle2d& circle : snapshot.circles) {
        includePoint(bounds, circle.cx - circle.radius, circle.cy - circle.radius);
        includePoint(bounds, circle.cx + circle.radius, circle.cy + circle.radius);
    }
    return bounds;
}

std::int64_t quantize(double value, double tolerance) {
    return static_cast<std::int64_t>(std::llround(value / tolerance));
}

struct PrimitiveKey {
    int kind = 0;
    std::array<std::int64_t, 6> values{};

    bool operator<(const PrimitiveKey& other) const {
        return std::tie(kind, values) < std::tie(other.kind, other.values);
    }
};

PrimitiveKey lineKey(const Line2d& line,
                     double originX,
                     double originY,
                     double tolerance) {
    std::pair<std::int64_t, std::int64_t> a{
        quantize(line.x1 - originX, tolerance),
        quantize(line.y1 - originY, tolerance)
    };
    std::pair<std::int64_t, std::int64_t> b{
        quantize(line.x2 - originX, tolerance),
        quantize(line.y2 - originY, tolerance)
    };
    if (b < a) {
        std::swap(a, b);
    }

    PrimitiveKey key;
    key.kind = 1;
    key.values = {a.first, a.second, b.first, b.second, 0, 0};
    return key;
}

PrimitiveKey arcKey(const Arc2d& arc,
                    double originX,
                    double originY,
                    double tolerance) {
    PrimitiveKey key;
    key.kind = 2;
    key.values = {
        quantize(arc.cx - originX, tolerance),
        quantize(arc.cy - originY, tolerance),
        quantize(arc.radius, tolerance),
        quantize(arc.startAngleDeg, tolerance),
        quantize(arc.endAngleDeg, tolerance),
        0
    };
    return key;
}

PrimitiveKey circleKey(const Circle2d& circle,
                       double originX,
                       double originY,
                       double tolerance) {
    PrimitiveKey key;
    key.kind = 3;
    key.values = {
        quantize(circle.cx - originX, tolerance),
        quantize(circle.cy - originY, tolerance),
        quantize(circle.radius, tolerance),
        0, 0, 0
    };
    return key;
}

using PrimitiveBag = std::map<PrimitiveKey, std::size_t>;

PrimitiveBag makeBag(const ViewSnapshot& snapshot, const MatchOptions& options) {
    const Bounds bounds = boundsOf(snapshot);
    const double originX = options.ignoreTranslation && bounds.valid ? bounds.minX : 0.0;
    const double originY = options.ignoreTranslation && bounds.valid ? bounds.minY : 0.0;

    PrimitiveBag bag;
    for (const Line2d& line : snapshot.lines) {
        ++bag[lineKey(line, originX, originY, options.coordinateTolerance)];
    }
    for (const Arc2d& arc : snapshot.arcs) {
        ++bag[arcKey(arc, originX, originY, options.coordinateTolerance)];
    }
    for (const Circle2d& circle : snapshot.circles) {
        ++bag[circleKey(circle, originX, originY, options.coordinateTolerance)];
    }
    return bag;
}

std::size_t primitiveCount(const ViewSnapshot& snapshot) {
    return snapshot.lines.size() + snapshot.arcs.size() + snapshot.circles.size();
}

PrimitiveBag subtractBags(const PrimitiveBag& left, const PrimitiveBag& right) {
    PrimitiveBag result;
    for (const auto& item : left) {
        const auto it = right.find(item.first);
        const std::size_t rightCount = it == right.end() ? 0 : it->second;
        if (item.second > rightCount) {
            result[item.first] = item.second - rightCount;
        }
    }
    return result;
}

bool takeOne(PrimitiveBag& bag, const PrimitiveKey& key) {
    auto it = bag.find(key);
    if (it == bag.end() || it->second == 0) {
        return false;
    }
    --it->second;
    return true;
}

void appendExcessPrimitives(
    const ViewSnapshot& source,
    PrimitiveBag excess,
    const MatchOptions& options,
    ViewSnapshot& target) {

    const Bounds bounds = boundsOf(source);
    const double originX = options.ignoreTranslation && bounds.valid ? bounds.minX : 0.0;
    const double originY = options.ignoreTranslation && bounds.valid ? bounds.minY : 0.0;

    for (const Line2d& line : source.lines) {
        if (takeOne(excess, lineKey(line, originX, originY, options.coordinateTolerance))) {
            target.lines.push_back(line);
        }
    }
    for (const Arc2d& arc : source.arcs) {
        if (takeOne(excess, arcKey(arc, originX, originY, options.coordinateTolerance))) {
            target.arcs.push_back(arc);
        }
    }
    for (const Circle2d& circle : source.circles) {
        if (takeOne(excess, circleKey(circle, originX, originY, options.coordinateTolerance))) {
            target.circles.push_back(circle);
        }
    }
}

} // namespace

SnapshotSimilarity compareViewSnapshots(
    const ViewSnapshot& left,
    const ViewSnapshot& right,
    const MatchOptions& options) {

    SnapshotSimilarity result;
    result.leftPrimitiveCount = primitiveCount(left);
    result.rightPrimitiveCount = primitiveCount(right);

    if (options.coordinateTolerance <= 0.0) {
        result.removedPrimitiveCount = result.leftPrimitiveCount;
        result.addedPrimitiveCount = result.rightPrimitiveCount;
        return result;
    }

    const PrimitiveBag leftBag = makeBag(left, options);
    const PrimitiveBag rightBag = makeBag(right, options);

    for (const auto& item : leftBag) {
        const auto it = rightBag.find(item.first);
        if (it != rightBag.end()) {
            result.commonPrimitiveCount += std::min(item.second, it->second);
        }
    }

    result.removedPrimitiveCount =
        result.leftPrimitiveCount - result.commonPrimitiveCount;
    result.addedPrimitiveCount =
        result.rightPrimitiveCount - result.commonPrimitiveCount;

    const std::size_t denominator = std::max(
        result.leftPrimitiveCount,
        result.rightPrimitiveCount
    );
    result.score = denominator == 0
        ? 0.0
        : static_cast<double>(result.commonPrimitiveCount) /
          static_cast<double>(denominator);

    return result;
}

SnapshotDiff diffViewSnapshots(
    const ViewSnapshot& left,
    const ViewSnapshot& right,
    const MatchOptions& options) {

    SnapshotDiff result;
    result.similarity = compareViewSnapshots(left, right, options);
    result.removed.sourceIndex = left.sourceIndex;
    result.added.sourceIndex = right.sourceIndex;

    if (options.coordinateTolerance <= 0.0) {
        result.removed = left;
        result.added = right;
        return result;
    }

    const PrimitiveBag leftBag = makeBag(left, options);
    const PrimitiveBag rightBag = makeBag(right, options);

    appendExcessPrimitives(
        left,
        subtractBags(leftBag, rightBag),
        options,
        result.removed
    );
    appendExcessPrimitives(
        right,
        subtractBags(rightBag, leftBag),
        options,
        result.added
    );

    return result;
}

MatchDecision findBestViewMatch(
    const ViewSnapshot& source,
    const std::vector<ViewSnapshot>& candidates,
    const MatchOptions& options) {

    MatchDecision result;
    if (candidates.empty()) {
        return result;
    }

    std::vector<std::pair<double, std::size_t>> ranked;
    ranked.reserve(candidates.size());

    for (std::size_t i = 0; i < candidates.size(); ++i) {
        const SnapshotSimilarity similarity = compareViewSnapshots(
            source,
            candidates[i],
            options
        );
        ranked.emplace_back(similarity.score, i);
    }

    std::sort(
        ranked.begin(),
        ranked.end(),
        [](const auto& a, const auto& b) {
            if (a.first != b.first) {
                return a.first > b.first;
            }
            return a.second < b.second;
        }
    );

    result.bestScore = ranked[0].first;
    result.candidateIndex = ranked[0].second;
    result.runnerUpScore = ranked.size() > 1 ? ranked[1].first : 0.0;

    if (result.bestScore < options.minimumSimilarity) {
        return result;
    }

    if (ranked.size() > 1 &&
        (result.bestScore - result.runnerUpScore) < options.minimumWinnerGap) {
        result.ambiguous = true;
        return result;
    }

    result.matched = true;
    return result;
}

} // namespace basidraft::geometry
