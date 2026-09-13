#pragma once

#include <cstddef>
#include <vector>

namespace basidraft::geometry {

struct Line2d {
    double x1 = 0.0;
    double y1 = 0.0;
    double x2 = 0.0;
    double y2 = 0.0;
};

struct Arc2d {
    double cx = 0.0;
    double cy = 0.0;
    double radius = 0.0;
    double startAngleDeg = 0.0;
    double endAngleDeg = 0.0;
};

struct Circle2d {
    double cx = 0.0;
    double cy = 0.0;
    double radius = 0.0;
};

struct ViewSnapshot {
    // Optional external label for diagnostics only (for example an anonymous
    // DXF block name). It is deliberately excluded from matching because BAZIS
    // renumbers anonymous DXF blocks between exports.
    std::size_t sourceIndex = 0;
    std::vector<Line2d> lines;
    std::vector<Arc2d> arcs;
    std::vector<Circle2d> circles;
};

struct MatchOptions {
    // Coordinate tolerance is expressed in drawing units. It is used to absorb
    // small regeneration noise in otherwise unchanged BAZIS geometry.
    double coordinateTolerance = 1.0e-4;

    // Normalize each candidate by its geometry bounding-box minimum before
    // comparison so moving a view on the sheet does not break identity.
    bool ignoreTranslation = true;

    // Match decision policy. These values are configurable on purpose: BasiDraft
    // must not silently guess when two candidates are similarly plausible.
    double minimumSimilarity = 0.70;
    double minimumWinnerGap = 0.05;
};

struct SnapshotSimilarity {
    std::size_t leftPrimitiveCount = 0;
    std::size_t rightPrimitiveCount = 0;
    std::size_t commonPrimitiveCount = 0;
    double score = 0.0; // common / max(left, right)
};

struct MatchDecision {
    bool matched = false;
    bool ambiguous = false;
    std::size_t candidateIndex = 0;
    double bestScore = 0.0;
    double runnerUpScore = 0.0;
};

SnapshotSimilarity compareViewSnapshots(
    const ViewSnapshot& left,
    const ViewSnapshot& right,
    const MatchOptions& options = {}
);

MatchDecision findBestViewMatch(
    const ViewSnapshot& source,
    const std::vector<ViewSnapshot>& candidates,
    const MatchOptions& options = {}
);

} // namespace basidraft::geometry
