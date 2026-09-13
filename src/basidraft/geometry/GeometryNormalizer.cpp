#include "GeometryNormalizer.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <map>
#include <tuple>
#include <utility>
#include <vector>

namespace basidraft::geometry {
namespace {

constexpr double kPi = 3.141592653589793238462643383279502884;

struct PointKey {
    std::int64_t x = 0;
    std::int64_t y = 0;

    bool operator<(const PointKey& other) const {
        return std::tie(x, y) < std::tie(other.x, other.y);
    }
};

struct LineKey {
    PointKey a;
    PointKey b;

    bool operator<(const LineKey& other) const {
        return std::tie(a, b) < std::tie(other.a, other.b);
    }
};

struct CollinearKey {
    std::int64_t angle = 0;
    std::int64_t offset = 0;

    bool operator<(const CollinearKey& other) const {
        return std::tie(angle, offset) < std::tie(other.angle, other.offset);
    }
};

struct Interval {
    double start = 0.0;
    double end = 0.0;
};

struct CollinearGroup {
    double dx = 1.0;
    double dy = 0.0;
    double nx = 0.0;
    double ny = 1.0;
    double offset = 0.0;
    std::vector<Interval> intervals;
};

std::int64_t quantize(double value, double tolerance) {
    return static_cast<std::int64_t>(std::llround(value / tolerance));
}

double lineLength(const Line2d& line) {
    return std::hypot(line.x2 - line.x1, line.y2 - line.y1);
}

PointKey pointKey(double x, double y, double tolerance) {
    return {quantize(x, tolerance), quantize(y, tolerance)};
}

LineKey lineKey(const Line2d& line, double tolerance) {
    PointKey a = pointKey(line.x1, line.y1, tolerance);
    PointKey b = pointKey(line.x2, line.y2, tolerance);
    if (b < a) {
        std::swap(a, b);
    }
    return {a, b};
}

Line2d canonicalLine(const Line2d& line) {
    const std::pair<double, double> a{line.x1, line.y1};
    const std::pair<double, double> b{line.x2, line.y2};
    if (b < a) {
        return {line.x2, line.y2, line.x1, line.y1};
    }
    return line;
}

} // namespace

NormalizationResult normalizeLines(
    const std::vector<Line2d>& input,
    const NormalizationOptions& options) {

    NormalizationResult result;
    result.stats.inputLineCount = input.size();

    if (options.coordinateTolerance <= 0.0 ||
        options.angularTolerance <= 0.0 ||
        options.mergeGapTolerance < 0.0) {
        result.lines = input;
        result.stats.outputLineCount = result.lines.size();
        return result;
    }

    std::vector<Line2d> working;
    std::vector<Line2d> passthroughDegenerate;
    working.reserve(input.size());

    // Stage 1: remove only geometrically degenerate segments. Short but real
    // hardware / detail lines are deliberately retained.
    for (const Line2d& line : input) {
        if (lineLength(line) <= options.coordinateTolerance) {
            ++result.stats.degenerateLineCount;
            if (options.dropDegenerateLines) {
                continue;
            }
            passthroughDegenerate.push_back(line);
            continue;
        }
        working.push_back(canonicalLine(line));
    }

    // Stage 2: exact-with-tolerance duplicate removal. Direction is ignored, so
    // A->B and B->A represent the same analysis segment.
    if (options.removeDuplicateLines) {
        std::map<LineKey, Line2d> unique;
        for (const Line2d& line : working) {
            const LineKey key = lineKey(line, options.coordinateTolerance);
            const auto inserted = unique.emplace(key, line).second;
            if (!inserted) {
                ++result.stats.duplicateLineCount;
            }
        }

        working.clear();
        working.reserve(unique.size());
        for (const auto& item : unique) {
            working.push_back(item.second);
        }
    }

    if (!options.mergeCollinearLines) {
        result.lines = std::move(working);
        result.lines.insert(
            result.lines.end(),
            passthroughDegenerate.begin(),
            passthroughDegenerate.end()
        );
        result.stats.outputLineCount = result.lines.size();
        return result;
    }

    // Stage 3: conservatively merge segments that lie on the same quantized
    // infinite line and overlap (or have only a configured micro-gap). This is
    // presentation geometry only; raw DXF entities remain untouched.
    std::map<CollinearKey, CollinearGroup> groups;

    for (const Line2d& line : working) {
        double dx = line.x2 - line.x1;
        double dy = line.y2 - line.y1;
        const double length = std::hypot(dx, dy);

        dx /= length;
        dy /= length;

        if (dx < 0.0 || (std::abs(dx) <= options.angularTolerance && dy < 0.0)) {
            dx = -dx;
            dy = -dy;
        }

        double angle = std::atan2(dy, dx);
        if (angle < 0.0) {
            angle += kPi;
        }

        const double nx = -dy;
        const double ny = dx;
        const double offset = nx * line.x1 + ny * line.y1;
        const CollinearKey key{
            quantize(angle, options.angularTolerance),
            quantize(offset, options.coordinateTolerance)
        };

        CollinearGroup& group = groups[key];
        if (group.intervals.empty()) {
            group.dx = dx;
            group.dy = dy;
            group.nx = nx;
            group.ny = ny;
            group.offset = offset;
        }

        double t1 = dx * line.x1 + dy * line.y1;
        double t2 = dx * line.x2 + dy * line.y2;
        if (t2 < t1) {
            std::swap(t1, t2);
        }
        group.intervals.push_back({t1, t2});
    }

    result.lines.clear();
    result.lines.reserve(working.size() + passthroughDegenerate.size());

    for (auto& item : groups) {
        CollinearGroup& group = item.second;
        if (group.intervals.empty()) {
            continue;
        }

        std::sort(
            group.intervals.begin(),
            group.intervals.end(),
            [](const Interval& a, const Interval& b) {
                if (a.start != b.start) {
                    return a.start < b.start;
                }
                return a.end < b.end;
            }
        );

        std::vector<Interval> merged;
        merged.reserve(group.intervals.size());
        merged.push_back(group.intervals.front());

        for (std::size_t i = 1; i < group.intervals.size(); ++i) {
            Interval& current = merged.back();
            const Interval& next = group.intervals[i];
            if (next.start <= current.end + options.mergeGapTolerance) {
                current.end = std::max(current.end, next.end);
            }
            else {
                merged.push_back(next);
            }
        }

        if (group.intervals.size() > merged.size()) {
            result.stats.collinearMergeCount +=
                group.intervals.size() - merged.size();
        }

        for (const Interval& interval : merged) {
            // p = direction * t + normal * offset
            const double x1 = group.dx * interval.start + group.nx * group.offset;
            const double y1 = group.dy * interval.start + group.ny * group.offset;
            const double x2 = group.dx * interval.end + group.nx * group.offset;
            const double y2 = group.dy * interval.end + group.ny * group.offset;
            result.lines.push_back({x1, y1, x2, y2});
        }
    }

    result.lines.insert(
        result.lines.end(),
        passthroughDegenerate.begin(),
        passthroughDegenerate.end()
    );

    result.stats.outputLineCount = result.lines.size();
    return result;
}

} // namespace basidraft::geometry
