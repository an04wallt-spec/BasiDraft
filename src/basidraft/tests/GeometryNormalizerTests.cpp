#include "geometry/GeometryNormalizer.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

using basidraft::geometry::Line2d;
using basidraft::geometry::NormalizationOptions;

namespace {

bool nearlyEqual(double a, double b, double tolerance = 1.0e-9) {
    return std::abs(a - b) <= tolerance;
}

bool sameUndirectedLine(const Line2d& line,
                        double x1, double y1,
                        double x2, double y2) {
    const bool forward =
        nearlyEqual(line.x1, x1) && nearlyEqual(line.y1, y1) &&
        nearlyEqual(line.x2, x2) && nearlyEqual(line.y2, y2);
    const bool reverse =
        nearlyEqual(line.x1, x2) && nearlyEqual(line.y1, y2) &&
        nearlyEqual(line.x2, x1) && nearlyEqual(line.y2, y1);
    return forward || reverse;
}

} // namespace

int main() {
    NormalizationOptions options;
    options.coordinateTolerance = 1.0e-4;
    options.mergeGapTolerance = 1.0e-4;
    options.angularTolerance = 1.0e-8;

    // Exact duplicates, including reversed drawing direction, are safe to remove.
    {
        const std::vector<Line2d> input = {
            {0.0, 0.0, 100.0, 0.0},
            {100.0, 0.0, 0.0, 0.0},
            {0.0, 0.0, 100.0, 0.0},
        };
        const auto result = basidraft::geometry::normalizeLines(input, options);
        assert(result.stats.inputLineCount == 3);
        assert(result.stats.duplicateLineCount == 2);
        assert(result.lines.size() == 1);
        assert(sameUndirectedLine(result.lines[0], 0.0, 0.0, 100.0, 0.0));
    }

    // Overlapping and touching collinear fragments are merged into presentation
    // geometry. This models one common BAZIS projection artifact.
    {
        const std::vector<Line2d> input = {
            {0.0, 10.0, 40.0, 10.0},
            {20.0, 10.0, 60.0, 10.0},
            {60.0, 10.0, 100.0, 10.0},
        };
        const auto result = basidraft::geometry::normalizeLines(input, options);
        assert(result.stats.collinearMergeCount == 2);
        assert(result.lines.size() == 1);
        assert(sameUndirectedLine(result.lines[0], 0.0, 10.0, 100.0, 10.0));
    }

    // A configured micro-gap may be healed, but a larger real gap must survive.
    {
        NormalizationOptions gapOptions = options;
        gapOptions.mergeGapTolerance = 0.01;
        const std::vector<Line2d> input = {
            {0.0, 0.0, 10.0, 0.0},
            {10.005, 0.0, 20.0, 0.0},
            {21.0, 0.0, 30.0, 0.0},
        };
        const auto result = basidraft::geometry::normalizeLines(input, gapOptions);
        assert(result.lines.size() == 2);
        assert(result.stats.collinearMergeCount == 1);
    }

    // Parallel construction lines must never be merged with one another.
    {
        const std::vector<Line2d> input = {
            {0.0, 0.0, 100.0, 0.0},
            {0.0, 1.0, 100.0, 1.0},
        };
        const auto result = basidraft::geometry::normalizeLines(input, options);
        assert(result.lines.size() == 2);
        assert(result.stats.collinearMergeCount == 0);
    }

    // Very short geometry is not used as a generic 'artifact' heuristic. Only a
    // truly degenerate segment at the configured coordinate tolerance is dropped.
    {
        const std::vector<Line2d> input = {
            {0.0, 0.0, 0.00001, 0.0},
            {1.0, 1.0, 1.01, 1.0},
        };
        const auto result = basidraft::geometry::normalizeLines(input, options);
        assert(result.stats.degenerateLineCount == 1);
        assert(result.lines.size() == 1);
        assert(sameUndirectedLine(result.lines[0], 1.0, 1.0, 1.01, 1.0));
    }

    // Conservative mode can report a degenerate segment without deleting it.
    {
        NormalizationOptions keepOptions = options;
        keepOptions.dropDegenerateLines = false;
        keepOptions.mergeCollinearLines = false;
        const std::vector<Line2d> input = {
            {5.0, 5.0, 5.00001, 5.0},
        };
        const auto result = basidraft::geometry::normalizeLines(input, keepOptions);
        assert(result.stats.degenerateLineCount == 1);
        assert(result.lines.size() == 1);
    }

    std::cout << "BasiDraft geometry normalizer tests passed\n";
    return 0;
}
