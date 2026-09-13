#pragma once

#include <cstddef>
#include <vector>

#include "ViewMatcher.h"

namespace basidraft::geometry {

struct ViewRevisionResult {
    std::size_t oldViewIndex = 0;
    bool matched = false;
    bool ambiguous = false;
    std::size_t newViewIndex = 0;
    double bestScore = 0.0;
    double runnerUpScore = 0.0;
    SnapshotDiff diff;
};

struct RevisionSetResult {
    std::vector<ViewRevisionResult> oldViews;
    std::vector<std::size_t> unmatchedNewViews;
};

// Matches a complete old set of logical furniture views to a regenerated set.
// Matching is geometry based and one-to-one. Collisions are handled
// conservatively: when ownership of a new view is not clearly separated by the
// configured winner gap, the affected old views remain ambiguous instead of
// being silently assigned.
RevisionSetResult compareViewSets(
    const std::vector<ViewSnapshot>& oldViews,
    const std::vector<ViewSnapshot>& newViews,
    const MatchOptions& options = {}
);

} // namespace basidraft::geometry
