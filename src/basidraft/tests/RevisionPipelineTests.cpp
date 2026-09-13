#include "geometry/RevisionPipeline.h"

#include <cassert>
#include <iostream>
#include <vector>

using basidraft::geometry::Line2d;
using basidraft::geometry::MatchOptions;
using basidraft::geometry::ViewSnapshot;

namespace {

ViewSnapshot makeFront(std::size_t sourceIndex, double shelfY) {
    ViewSnapshot view;
    view.sourceIndex = sourceIndex;

    // Stable cabinet geometry.
    for (int i = 0; i < 10; ++i) {
        const double x = i * 10.0;
        view.lines.push_back(Line2d{x, 0.0, x, 200.0});
    }

    // Three shelf-related primitives: moving the shelf must produce 3 removed
    // and 3 added primitives, matching the verified real front-view revision.
    view.lines.push_back(Line2d{20.0, shelfY, 80.0, shelfY});
    view.lines.push_back(Line2d{20.0, shelfY - 2.0, 20.0, shelfY});
    view.lines.push_back(Line2d{80.0, shelfY - 2.0, 80.0, shelfY});
    return view;
}

ViewSnapshot makeSection(std::size_t sourceIndex, double shelfY) {
    ViewSnapshot view;
    view.sourceIndex = sourceIndex;

    // Deliberately different stable geometry from the front view.
    for (int i = 0; i < 20; ++i) {
        const double y = i * 8.0;
        view.lines.push_back(Line2d{0.0, y, 60.0, y});
    }

    // Four shelf rectangle primitives, matching the verified second affected
    // logical view from the real clean DXF pair.
    view.lines.push_back(Line2d{5.0, shelfY, 55.0, shelfY});
    view.lines.push_back(Line2d{5.0, shelfY + 4.0, 55.0, shelfY + 4.0});
    view.lines.push_back(Line2d{5.0, shelfY, 5.0, shelfY + 4.0});
    view.lines.push_back(Line2d{55.0, shelfY, 55.0, shelfY + 4.0});
    return view;
}

ViewSnapshot makeUnchangedRight(std::size_t sourceIndex) {
    ViewSnapshot view;
    view.sourceIndex = sourceIndex;
    for (int i = 0; i < 12; ++i) {
        const double x = i * 3.0;
        view.lines.push_back(Line2d{x, 0.0, x + 15.0, 100.0});
    }
    return view;
}

} // namespace

int main() {
    MatchOptions options;
    options.coordinateTolerance = 1.0e-4;
    options.ignoreTranslation = true;
    options.minimumSimilarity = 0.70;
    options.minimumWinnerGap = 0.05;

    // End-to-end revision set corresponding to the real BAZIS clean/shelf-moved
    // pair: two logical views change locally, one stays byte-geometrically equal.
    {
        const std::vector<ViewSnapshot> oldViews = {
            makeFront(100, 90.0),
            makeSection(101, 70.0),
            makeUnchangedRight(102),
        };

        // Reorder the regenerated views to prove that array position / DXF block
        // naming is not identity.
        const std::vector<ViewSnapshot> newViews = {
            makeUnchangedRight(202),
            makeSection(201, 80.0),
            makeFront(200, 100.0),
        };

        const auto revision = basidraft::geometry::compareViewSets(
            oldViews,
            newViews,
            options
        );

        assert(revision.oldViews.size() == 3);
        assert(revision.unmatchedNewViews.empty());

        assert(revision.oldViews[0].matched);
        assert(!revision.oldViews[0].ambiguous);
        assert(revision.oldViews[0].newViewIndex == 2);
        assert(revision.oldViews[0].diff.similarity.removedPrimitiveCount == 3);
        assert(revision.oldViews[0].diff.similarity.addedPrimitiveCount == 3);
        assert(revision.oldViews[0].diff.removed.lines.size() == 3);
        assert(revision.oldViews[0].diff.added.lines.size() == 3);

        assert(revision.oldViews[1].matched);
        assert(!revision.oldViews[1].ambiguous);
        assert(revision.oldViews[1].newViewIndex == 1);
        assert(revision.oldViews[1].diff.similarity.removedPrimitiveCount == 4);
        assert(revision.oldViews[1].diff.similarity.addedPrimitiveCount == 4);
        assert(revision.oldViews[1].diff.removed.lines.size() == 4);
        assert(revision.oldViews[1].diff.added.lines.size() == 4);

        assert(revision.oldViews[2].matched);
        assert(!revision.oldViews[2].ambiguous);
        assert(revision.oldViews[2].newViewIndex == 0);
        assert(revision.oldViews[2].diff.similarity.removedPrimitiveCount == 0);
        assert(revision.oldViews[2].diff.similarity.addedPrimitiveCount == 0);
    }

    // Two indistinguishable old views competing for one new view must remain
    // ambiguous. The pipeline must never silently choose one based on index.
    {
        const ViewSnapshot sameA = makeFront(300, 90.0);
        const ViewSnapshot sameB = makeFront(301, 90.0);
        const ViewSnapshot regenerated = makeFront(400, 90.0);

        const auto revision = basidraft::geometry::compareViewSets(
            {sameA, sameB},
            {regenerated},
            options
        );

        assert(revision.oldViews.size() == 2);
        assert(!revision.oldViews[0].matched);
        assert(!revision.oldViews[1].matched);
        assert(revision.oldViews[0].ambiguous);
        assert(revision.oldViews[1].ambiguous);
        assert(revision.unmatchedNewViews.size() == 1);
        assert(revision.unmatchedNewViews[0] == 0);
    }

    std::cout << "BasiDraft revision pipeline tests passed\n";
    return 0;
}
