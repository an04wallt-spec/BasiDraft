#pragma once

#include <cstddef>

#include "ViewMatcher.h"

namespace basidraft::geometry {

struct LocalMotionOptions {
    double coordinateTolerance = 1.0e-4;
    std::size_t minimumSupportCount = 2;
    double minimumSupportFraction = 0.60;
    double minimumWinnerGapFraction = 0.15;
};

struct LocalTranslation {
    bool detected = false;
    bool ambiguous = false;
    double dx = 0.0;
    double dy = 0.0;
    std::size_t supportCount = 0;
    std::size_t consideredRemovedLines = 0;
    double supportFraction = 0.0;
};

// Detects a dominant rigid translation among changed line primitives. This is
// intentionally local: unchanged view geometry is excluded by SnapshotDiff.
// A moved furniture shelf typically produces several removed lines and the same
// lines translated to their new position. If no single translation dominates,
// BasiDraft must not update dependent dimensions automatically.
LocalTranslation detectLocalLineTranslation(
    const SnapshotDiff& diff,
    const LocalMotionOptions& options = {}
);

} // namespace basidraft::geometry
