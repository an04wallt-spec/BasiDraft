#include "RevisionPipeline.h"

#include <algorithm>
#include <map>
#include <set>
#include <utility>

namespace basidraft::geometry {

RevisionSetResult compareViewSets(
    const std::vector<ViewSnapshot>& oldViews,
    const std::vector<ViewSnapshot>& newViews,
    const MatchOptions& options) {

    RevisionSetResult result;
    result.oldViews.resize(oldViews.size());

    if (newViews.empty()) {
        for (std::size_t i = 0; i < oldViews.size(); ++i) {
            result.oldViews[i].oldViewIndex = i;
        }
        return result;
    }

    // First pass: each old view independently proposes its best new candidate.
    std::map<std::size_t, std::vector<std::size_t>> proposalsByNewView;
    for (std::size_t oldIndex = 0; oldIndex < oldViews.size(); ++oldIndex) {
        const MatchDecision decision = findBestViewMatch(
            oldViews[oldIndex],
            newViews,
            options
        );

        ViewRevisionResult& revision = result.oldViews[oldIndex];
        revision.oldViewIndex = oldIndex;
        revision.newViewIndex = decision.candidateIndex;
        revision.bestScore = decision.bestScore;
        revision.runnerUpScore = decision.runnerUpScore;
        revision.ambiguous = decision.ambiguous;

        if (decision.matched) {
            proposalsByNewView[decision.candidateIndex].push_back(oldIndex);
        }
    }

    std::set<std::size_t> assignedNewViews;

    // Second pass: enforce one-to-one ownership of each new view.
    for (auto& proposal : proposalsByNewView) {
        const std::size_t newIndex = proposal.first;
        std::vector<std::size_t>& oldIndices = proposal.second;

        if (oldIndices.size() == 1) {
            const std::size_t oldIndex = oldIndices.front();
            ViewRevisionResult& revision = result.oldViews[oldIndex];
            revision.matched = true;
            revision.diff = diffViewSnapshots(
                oldViews[oldIndex],
                newViews[newIndex],
                options
            );
            assignedNewViews.insert(newIndex);
            continue;
        }

        std::sort(
            oldIndices.begin(),
            oldIndices.end(),
            [&result](std::size_t a, std::size_t b) {
                const double scoreA = result.oldViews[a].bestScore;
                const double scoreB = result.oldViews[b].bestScore;
                if (scoreA != scoreB) {
                    return scoreA > scoreB;
                }
                return a < b;
            }
        );

        const std::size_t bestOld = oldIndices[0];
        const double bestScore = result.oldViews[bestOld].bestScore;
        const double secondScore = result.oldViews[oldIndices[1]].bestScore;

        if ((bestScore - secondScore) >= options.minimumWinnerGap) {
            ViewRevisionResult& winner = result.oldViews[bestOld];
            winner.matched = true;
            winner.ambiguous = false;
            winner.diff = diffViewSnapshots(
                oldViews[bestOld],
                newViews[newIndex],
                options
            );
            assignedNewViews.insert(newIndex);

            for (std::size_t i = 1; i < oldIndices.size(); ++i) {
                ViewRevisionResult& loser = result.oldViews[oldIndices[i]];
                loser.matched = false;
                loser.ambiguous = true;
            }
        }
        else {
            // No clear owner: nobody gets the candidate automatically.
            for (std::size_t oldIndex : oldIndices) {
                ViewRevisionResult& revision = result.oldViews[oldIndex];
                revision.matched = false;
                revision.ambiguous = true;
            }
        }
    }

    for (std::size_t newIndex = 0; newIndex < newViews.size(); ++newIndex) {
        if (assignedNewViews.find(newIndex) == assignedNewViews.end()) {
            result.unmatchedNewViews.push_back(newIndex);
        }
    }

    return result;
}

} // namespace basidraft::geometry
