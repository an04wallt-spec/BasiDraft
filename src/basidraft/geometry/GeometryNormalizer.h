#pragma once

#include <cstddef>
#include <vector>

#include "ViewMatcher.h"

namespace basidraft::geometry {

struct NormalizationOptions {
    // Coordinates closer than this value are treated as the same geometric
    // location for analysis purposes. Raw imported geometry is never modified.
    double coordinateTolerance = 1.0e-4;

    // Collinear intervals separated by no more than this gap can be joined in
    // presentation geometry. Keep this conservative: a real construction gap
    // must not disappear silently.
    double mergeGapTolerance = 1.0e-4;

    // Direction comparison tolerance in radians.
    double angularTolerance = 1.0e-8;

    bool removeDuplicateLines = true;
    bool mergeCollinearLines = true;
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
