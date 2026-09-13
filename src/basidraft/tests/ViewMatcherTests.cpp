#include "geometry/ViewMatcher.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

using basidraft::geometry::Arc2d;
using basidraft::geometry::Line2d;
using basidraft::geometry::MatchOptions;
using basidraft::geometry::ViewSnapshot;

namespace {

ViewSnapshot makeShelfView(double shelfY, double xOffset = 0.0, double yOffset = 0.0) {
    ViewSnapshot view;

    // Fourteen stable primitives stand in for the unchanged geometry around the
    // shelf. This ratio reproduces the verified BAZIS test where 14 of 18
    // primitives remained identical after the shelf moved.
    for (int i = 0; i < 14; ++i) {
        const double y = yOffset + static_cast<double>(i) * 5.0;
        view.lines.push_back({
            xOffset,
            y,
            xOffset + 100.0,
            y
        });
    }

    // Shelf rectangle: four primitives move together.
    view.lines.push_back({xOffset + 20.0, yOffset + shelfY,
                          xOffset + 80.0, yOffset + shelfY});
    view.lines.push_back({xOffset + 20.0, yOffset + shelfY + 2.0,
                          xOffset + 80.0, yOffset + shelfY + 2.0});
    view.lines.push_back({xOffset + 20.0, yOffset + shelfY,
                          xOffset + 20.0, yOffset + shelfY + 2.0});
    view.lines.push_back({xOffset + 80.0, yOffset + shelfY,
                          xOffset + 80.0, yOffset + shelfY + 2.0});

    return view;
}

} // namespace

int main() {
    MatchOptions options;
    options.coordinateTolerance = 1.0e-4;
    options.ignoreTranslation = true;

    // Renaming / moving the containing DXF block must not affect identity.
    const ViewSnapshot original = makeShelfView(30.0);
    const ViewSnapshot translated = makeShelfView(30.0, 500.0, -200.0);
    const auto translatedSimilarity = basidraft::geometry::compareViewSnapshots(
        original,
        translated,
        options
    );
    assert(std::abs(translatedSimilarity.score - 1.0) < 1.0e-12);
    assert(translatedSimilarity.removedPrimitiveCount == 0);
    assert(translatedSimilarity.addedPrimitiveCount == 0);

    // Verified BAZIS behavior: unchanged geometry may be regenerated with tiny
    // numerical noise. This must not create a false revision.
    ViewSnapshot jittered = original;
    jittered.arcs.push_back({40.0, 40.0, 2.0, 0.0, 180.0});
    ViewSnapshot jittered2 = original;
    jittered2.arcs.push_back({40.0, 40.0000015, 2.0, 0.0, 180.0});
    const auto jitterSimilarity = basidraft::geometry::compareViewSnapshots(
        jittered,
        jittered2,
        options
    );
    assert(std::abs(jitterSimilarity.score - 1.0) < 1.0e-12);
    assert(jitterSimilarity.removedPrimitiveCount == 0);
    assert(jitterSimilarity.addedPrimitiveCount == 0);

    // A moved shelf is still the same logical view, but with a localized change.
    // 14 stable + 4 moved primitives => 14/18 = 0.777...
    const ViewSnapshot movedShelf = makeShelfView(32.772);
    const auto changedSimilarity = basidraft::geometry::compareViewSnapshots(
        original,
        movedShelf,
        options
    );
    assert(changedSimilarity.commonPrimitiveCount == 14);
    assert(changedSimilarity.leftPrimitiveCount == 18);
    assert(changedSimilarity.rightPrimitiveCount == 18);
    assert(changedSimilarity.removedPrimitiveCount == 4);
    assert(changedSimilarity.addedPrimitiveCount == 4);
    assert(std::abs(changedSimilarity.score - (14.0 / 18.0)) < 1.0e-12);

    // Best-match selection must choose the changed version over an unrelated view.
    ViewSnapshot unrelated;
    unrelated.lines.push_back({0.0, 0.0, 10.0, 10.0});
    unrelated.lines.push_back({10.0, 0.0, 0.0, 10.0});

    options.minimumSimilarity = 0.70;
    options.minimumWinnerGap = 0.05;
    const auto decision = basidraft::geometry::findBestViewMatch(
        original,
        {unrelated, movedShelf},
        options
    );
    assert(decision.matched);
    assert(!decision.ambiguous);
    assert(decision.candidateIndex == 1);

    // BasiDraft must explicitly flag ambiguous candidates instead of guessing.
    const auto ambiguous = basidraft::geometry::findBestViewMatch(
        original,
        {translated, original},
        options
    );
    assert(!ambiguous.matched);
    assert(ambiguous.ambiguous);

    std::cout << "BasiDraft view matcher tests passed\n";
    return 0;
}
