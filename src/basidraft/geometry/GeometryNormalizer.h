#pragma once

#include <cstddef>
#include <vector>

#include "ViewMatcher.h"

namespace basidraft::geometry {

struct NormalizationOptions {
    // Coordinates closer than this value are treated as the same geometric
    // location for analysis purposes. Raw imported geometry is never modified.
    double coordinateTolerance = 1.0e-4;

    // Direction comparison tolerance in radians.
    double angularTolerance = 1.0e-8;

    // Strictly overlapping collinear intervals may be unioned for presentation
    // geometry. A simple shared endpoint is NOT enough: that point can be a real
    // furniture joint and later a semantic dimension anchor.
    bool mergeCollinearOverlaps = true;

    // Gap healing is intentionally opt-in. It is useful for hatch / contour
    // reconstruction, but must never silently erase a real construction gap.
    bool healCollinearMicroGaps = false;
    double microGapTolerance = 1.0e-4;

    bool removeDuplicateLines = true;
    bool dropDegenerateLines = true;
};

struct NormalizationStats {
    std::size_t inputLineCount = 0;
    std::size_t duplicateLineCount = 0;
    std::size_t degenerateLineCount = 0;
    std::size_t collinearMergeCount = 0;
    std::size_t outputLineCount = 0;
};

struct NormalizationResult {
    // Presentation / analysis geometry only. The caller keeps the original DXF
    // entities unchanged as the authoritative raw source.
    std::vector<Line2d> lines;
    NormalizationStats stats;
};

NormalizationResult normalizeLines(
    const std::vector<Line2d>& input,
    const NormalizationOptions& options = {}
);

} // namespace basidraft::geometry
