include("scripts/Developer/BasiDraft/BasiDraftDxfAnalysis.js");

/**
 * Runtime logical-view assembly for opened BAZIS DXF documents.
 *
 * The C++ ViewClusterer contains the same conservative policy for core tests.
 * This ECMAScript adapter applies that policy directly to QCAD entity IDs so the
 * result can immediately produce view snapshots inside the running editor.
 */
function BasiDraftLogicalViews() {
}

BasiDraftLogicalViews.defaultOptions = function() {
    return {
        proximityTolerance: 1.0e-4,
        mergeContainedIslands: true,
        containmentTolerance: 1.0e-4,
        maximumContainedAreaFraction: 0.25,
        mergeVerticallyAlignedIslands: true,
        minimumHorizontalSpanRatio: 0.80,
        maximumCenterOffsetFraction: 0.10,
        maximumVerticalGapHeightFraction: 0.75
    };
};

BasiDraftLogicalViews.mergeBoxes = function(a, b) {
    if (isNull(a)) {
        return b;
    }
    if (isNull(b)) {
        return a;
    }
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
        width: Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX),
        height: Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY)
    };
};

BasiDraftLogicalViews.boxDistance = function(a, b) {
    var dx = Math.max(Math.max(b.minX - a.maxX, a.minX - b.maxX), 0.0);
    var dy = Math.max(Math.max(b.minY - a.maxY, a.minY - b.maxY), 0.0);
    return Math.sqrt(dx*dx + dy*dy);
};

BasiDraftLogicalViews.boxArea = function(box) {
    return Math.max(0.0, box.maxX-box.minX) * Math.max(0.0, box.maxY-box.minY);
};

BasiDraftLogicalViews.boxContains = function(outer, inner, tolerance) {
    return inner.minX >= outer.minX-tolerance &&
           inner.minY >= outer.minY-tolerance &&
           inner.maxX <= outer.maxX+tolerance &&
           inner.maxY <= outer.maxY+tolerance;
};

BasiDraftLogicalViews.verticalGap = function(a, b) {
    return Math.max(Math.max(b.minY-a.maxY, a.minY-b.maxY), 0.0);
};

BasiDraftLogicalViews.mergeClusters = function(a, b) {
    var entityIds = a.entityIds.concat(b.entityIds);
    entityIds.sort(function(x, y) { return x-y; });
    return {
        entityIds: entityIds,
        box: BasiDraftLogicalViews.mergeBoxes(a.box, b.box),
        primitiveCount: a.primitiveCount + b.primitiveCount
    };
};

BasiDraftLogicalViews.shouldMergeContained = function(outer, inner, options) {
    var outerArea = BasiDraftLogicalViews.boxArea(outer.box);
    var innerArea = BasiDraftLogicalViews.boxArea(inner.box);
    if (outerArea <= 0.0 || innerArea >= outerArea) {
        return false;
    }
    if (!BasiDraftLogicalViews.boxContains(
            outer.box,
            inner.box,
            options.containmentTolerance)) {
        return false;
    }

    if (innerArea <= 0.0) {
        return true;
    }

    return innerArea / outerArea <= options.maximumContainedAreaFraction;
};

BasiDraftLogicalViews.shouldMergeVertical = function(a, b, options) {
    var widthA = a.box.maxX-a.box.minX;
    var widthB = b.box.maxX-b.box.minX;
    var heightA = a.box.maxY-a.box.minY;
    var heightB = b.box.maxY-b.box.minY;

    if (widthA <= options.proximityTolerance ||
        widthB <= options.proximityTolerance ||
        heightA <= options.proximityTolerance ||
        heightB <= options.proximityTolerance) {
        return false;
    }

    var maxWidth = Math.max(widthA, widthB);
    var minWidth = Math.min(widthA, widthB);
    if (minWidth/maxWidth < options.minimumHorizontalSpanRatio) {
        return false;
    }

    var centerA = (a.box.minX+a.box.maxX)*0.5;
    var centerB = (b.box.minX+b.box.maxX)*0.5;
    if (Math.abs(centerA-centerB) >
        maxWidth*options.maximumCenterOffsetFraction) {
        return false;
    }

    var gap = BasiDraftLogicalViews.verticalGap(a.box, b.box);
    if (gap <= options.proximityTolerance) {
        return false;
    }

    return gap <= Math.max(heightA, heightB) *
                  options.maximumVerticalGapHeightFraction;
};

BasiDraftLogicalViews.clusterGeometryItems = function(items, options) {
    if (isNull(options)) {
        options = BasiDraftLogicalViews.defaultOptions();
    }

    var valid = [];
    for (var i=0; i<items.length; ++i) {
        if (!isNull(items[i].box)) {
            valid.push(items[i]);
        }
    }

    var parent = [];
    for (var p=0; p<valid.length; ++p) {
        parent[p] = p;
    }

    function find(i) {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }

    function unite(a, b) {
        a = find(a);
        b = find(b);
        if (a !== b) {
            parent[b] = a;
        }
    }

    for (var a=0; a<valid.length; ++a) {
        for (var b=a+1; b<valid.length; ++b) {
            if (BasiDraftLogicalViews.boxDistance(valid[a].box, valid[b].box) <=
                options.proximityTolerance) {
                unite(a, b);
            }
        }
    }

    var roots = {};
    var clusters = [];
    for (var n=0; n<valid.length; ++n) {
        var root = find(n).toString();
        var cluster;
        if (isNull(roots[root])) {
            cluster = {
                entityIds: [],
                box: undefined,
                primitiveCount: 0
            };
            roots[root] = clusters.length;
            clusters.push(cluster);
        }
        else {
            cluster = clusters[roots[root]];
        }

        cluster.entityIds.push(valid[n].entityId);
        cluster.box = BasiDraftLogicalViews.mergeBoxes(cluster.box, valid[n].box);
        cluster.primitiveCount += valid[n].primitiveCount;
    }

    if (options.mergeContainedIslands) {
        var containedChanged = true;
        while (containedChanged) {
            containedChanged = false;
            for (var outer=0; outer<clusters.length && !containedChanged; ++outer) {
                for (var inner=0; inner<clusters.length; ++inner) {
                    if (outer === inner) {
                        continue;
                    }
                    if (!BasiDraftLogicalViews.shouldMergeContained(
                            clusters[outer], clusters[inner], options)) {
                        continue;
                    }
                    clusters[outer] = BasiDraftLogicalViews.mergeClusters(
                        clusters[outer], clusters[inner]
                    );
                    clusters.splice(inner, 1);
                    containedChanged = true;
                    break;
                }
            }
        }
    }

    if (options.mergeVerticallyAlignedIslands) {
        var verticalChanged = true;
        while (verticalChanged) {
            verticalChanged = false;
            for (var c=0; c<clusters.length && !verticalChanged; ++c) {
                for (var d=c+1; d<clusters.length; ++d) {
                    if (!BasiDraftLogicalViews.shouldMergeVertical(
                            clusters[c], clusters[d], options)) {
                        continue;
                    }
                    clusters[c] = BasiDraftLogicalViews.mergeClusters(
                        clusters[c], clusters[d]
                    );
                    clusters.splice(d, 1);
                    verticalChanged = true;
                    break;
                }
            }
        }
    }

    clusters.sort(function(a, b) {
        if (a.box.minX !== b.box.minX) {
            return a.box.minX-b.box.minX;
        }
        return a.box.minY-b.box.minY;
    });

    return clusters;
};

BasiDraftLogicalViews.analyzeLogicalViews = function(document, options) {
    var analysis = BasiDraftDxfAnalysis.analyzeDocument(document);
    var clusters = BasiDraftLogicalViews.clusterGeometryItems(
        analysis.geometryItems,
        options
    );

    var views = [];
    for (var i=0; i<clusters.length; ++i) {
        views.push({
            index: i,
            entityIds: clusters[i].entityIds,
            box: clusters[i].box,
            primitiveCount: clusters[i].primitiveCount,
            snapshot: BasiDraftDxfAnalysis.createSnapshotForEntityIds(
                document,
                clusters[i].entityIds
            )
        });
    }

    return {
        analysis: analysis,
        views: views
    };
};
