#include "LocalRevisionMotion.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <map>
#include <tuple>
#include <utility>
#include <vector>

namespace basidraft::geometry {
namespace {

std::int64_t quantize(double value, double tolerance) {
    return static_cast<std::int64_t>(std::llround(value / tolerance));
}

struct TranslationKey {
    std::int64_t dx = 0;
    std::int64_t dy = 0;

    bool operator<(const TranslationKey& other) const {
        return std::tie(dx, dy) < std::tie(other.dx, other.dy);
    }
};

struct TranslationStats {
    std::size_t count = 0;
    double sumDx = 0.0;
    double sumDy = 0.0;
};

bool nearlyEqual(double a, double b, double tolerance) {
    return std::abs(a - b) <= tolerance;
}

bool sameTranslatedLine(
    const Line2d& oldLine,
    const Line2d& newLine,
    double tolerance,
    double& dx,
    double& dy) {

    const double oldDx = oldLine.x2 - oldLine.x1;
    const double oldDy = oldLine.y2 - oldLine.y1;
    const double newDx = newLine.x2 - newLine.x1;
    const double newDy = newLine.y2 - newLine.y1;

    // Same orientation.
    if (nearlyEqual(oldDx, newDx, tolerance) &&
        nearlyEqual(oldDy, newDy, tolerance)) {
        const double tx1 = newLine.x1 - oldLine.x1;
        const double ty1 = newLine.y1 - oldLine.y1;
        const double tx2 = newLine.x2 - oldLine.x2;
        const double ty2 = newLine.y2 - oldLine.y2;
        if (nearlyEqual(tx1, tx2, tolerance) &&
            nearlyEqual(ty1, ty2, tolerance)) {
            dx = (tx1 + tx2) * 0.5;
            dy = (ty1 + ty2) * 0.5;
            return true;
        }
    }

    // Reversed line direction.
    if (nearlyEqual(oldDx, -newDx, tolerance) &&
        nearlyEqual(oldDy, -newDy, tolerance)) {
        const double tx1 = newLine.x2 - oldLine.x1;
        const double ty1 = newLine.y2 - oldLine.y1;
        const double tx2 = newLine.x1 - oldLine.x2;
        const double ty2 = newLine.y1 - oldLine.y2;
        if (nearlyEqual(tx1, tx2, tolerance) &&
            nearlyEqual(ty1, ty2, tolerance)) {
            dx = (tx1 + tx2) * 0.5;
            dy = (ty1 + ty2) * 0.5;
            return true;
        }
    }

    return false;
}

} // namespace

LocalTranslation detectLocalLineTranslation(
    const SnapshotDiff& diff,
    const LocalMotionOptions& options) {

    LocalTranslation result;
    result.consideredRemovedLines = diff.removed.lines.size();

    if (options.coordinateTolerance <= 0.0 ||
        diff.removed.lines.empty() ||
        diff.added.lines.empty()) {
        return result;
    }

    std::map<TranslationKey, TranslationStats> translations;

    for (const Line2d& oldLine : diff.removed.lines) {
        for (const Line2d& newLine : diff.added.lines) {
            double dx = 0.0;
            double dy = 0.0;
            if (!sameTranslatedLine(
                    oldLine,
                    newLine,
                    options.coordinateTolerance,
                    dx,
                    dy)) {
                continue;
            }

            TranslationKey key;
            key.dx = quantize(dx, options.coordinateTolerance);
            key.dy = quantize(dy, options.coordinateTolerance);

            TranslationStats& stats = translations[key];
            ++stats.count;
            stats.sumDx += dx;
            stats.sumDy += dy;
        }
    }

    if (translations.empty()) {
        return result;
    }

    std::vector<std::pair<TranslationKey, TranslationStats>> ranked(
        translations.begin(),
        translations.end()
    );

    std::sort(
        ranked.begin(),
        ranked.end(),
        [](const auto& a, const auto& b) {
            if (a.second.count != b.second.count) {
                return a.second.count > b.second.count;
            }
            return a.first < b.first;
        }
    );

    const TranslationStats& best = ranked[0].second;
    const std::size_t runnerUpCount = ranked.size() > 1
        ? ranked[1].second.count
        : 0;

    result.supportCount = best.count;
    result.supportFraction = result.consideredRemovedLines == 0
        ? 0.0
        : static_cast<double>(best.count) /
          static_cast<double>(result.consideredRemovedLines);

    if (best.count < options.minimumSupportCount ||
        result.supportFraction < options.minimumSupportFraction) {
        return result;
    }

    const double winnerGapFraction = result.consideredRemovedLines == 0
        ? 0.0
        : static_cast<double>(best.count - runnerUpCount) /
          static_cast<double>(result.consideredRemovedLines);

    if (runnerUpCount > 0 &&
        winnerGapFraction < options.minimumWinnerGapFraction) {
        result.ambiguous = true;
        return result;
    }

    result.dx = best.sumDx / static_cast<double>(best.count);
    result.dy = best.sumDy / static_cast<double>(best.count);
    result.detected = true;
    return result;
}

} // namespace basidraft::geometry
