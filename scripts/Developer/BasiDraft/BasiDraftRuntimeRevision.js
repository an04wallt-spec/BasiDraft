include("scripts/Developer/BasiDraft/BasiDraftLogicalViews.js");

/**
 * Runtime revision matcher for logical views produced from opened DXF files.
 *
 * The durable implementation lives in the C++ BasiDraft core. This ECMAScript
 * adapter deliberately mirrors the same rules so the complete user workflow can
 * be exercised inside QCAD today: old DXF -> saved view snapshots -> new DXF ->
 * one-to-one matching -> localized changed geometry.
 */
function BasiDraftRuntimeRevision() {
}

BasiDraftRuntimeRevision.defaultOptions = function() {
    return {
        coordinateTolerance: 1.0e-4,
        ignoreTranslation: true,
        minimumSimilarity: 0.70,
        minimumWinnerGap: 0.05
    };
};

BasiDraftRuntimeRevision.primitiveCount = function(snapshot) {
    return snapshot.lines.length + snapshot.arcs.length + snapshot.circles.length;
};

BasiDraftRuntimeRevision.boundsOf = function(snapshot) {
    var bounds;

    function includePoint(x, y) {
        if (isNull(bounds)) {
            bounds = {minX:x, minY:y, maxX:x, maxY:y};
            return;
        }
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
    }

    for (var i=0; i<snapshot.lines.length; ++i) {
        includePoint(snapshot.lines[i].x1, snapshot.lines[i].y1);
        includePoint(snapshot.lines[i].x2, snapshot.lines[i].y2);
    }
    for (var a=0; a<snapshot.arcs.length; ++a) {
        var arc = snapshot.arcs[a];
        includePoint(arc.cx-arc.radius, arc.cy-arc.radius);
        includePoint(arc.cx+arc.radius, arc.cy+arc.radius);
    }
    for (var c=0; c<snapshot.circles.length; ++c) {
        var circle = snapshot.circles[c];
        includePoint(circle.cx-circle.radius, circle.cy-circle.radius);
        includePoint(circle.cx+circle.radius, circle.cy+circle.radius);
    }
    return bounds;
};

BasiDraftRuntimeRevision.quantize = function(value, tolerance) {
    return Math.round(value/tolerance);
};

BasiDraftRuntimeRevision.makePrimitiveRecords = function(snapshot, options) {
    var bounds = BasiDraftRuntimeRevision.boundsOf(snapshot);
    var ox = options.ignoreTranslation && !isNull(bounds) ? bounds.minX : 0.0;
    var oy = options.ignoreTranslation && !isNull(bounds) ? bounds.minY : 0.0;
    var records = [];

    function q(v) {
        return BasiDraftRuntimeRevision.quantize(v, options.coordinateTolerance);
    }

    for (var i=0; i<snapshot.lines.length; ++i) {
        var line = snapshot.lines[i];
        var ax = q(line.x1-ox);
        var ay = q(line.y1-oy);
        var bx = q(line.x2-ox);
        var by = q(line.y2-oy);
        if (bx < ax || (bx === ax && by < ay)) {
            var tx=ax; ax=bx; bx=tx;
            var ty=ay; ay=by; by=ty;
        }
        records.push({
            key:"L:"+ax+","+ay+","+bx+","+by,
            kind:"line",
            primitive:line
        });
    }

    for (var a=0; a<snapshot.arcs.length; ++a) {
        var arc = snapshot.arcs[a];
        records.push({
            key:"A:"+q(arc.cx-ox)+","+q(arc.cy-oy)+","+
                q(arc.radius)+","+q(arc.startAngleDeg)+","+q(arc.endAngleDeg),
            kind:"arc",
            primitive:arc
        });
    }

    for (var c=0; c<snapshot.circles.length; ++c) {
        var circle = snapshot.circles[c];
        records.push({
            key:"C:"+q(circle.cx-ox)+","+q(circle.cy-oy)+","+q(circle.radius),
            kind:"circle",
            primitive:circle
        });
    }

    return records;
};

BasiDraftRuntimeRevision.makeBag = function(records) {
    var bag = {};
    for (var i=0; i<records.length; ++i) {
        var key = records[i].key;
        if (isNull(bag[key])) {
            bag[key] = 0;
        }
        ++bag[key];
    }
    return bag;
};

BasiDraftRuntimeRevision.compareSnapshots = function(left, right, options) {
    if (isNull(options)) {
        options = BasiDraftRuntimeRevision.defaultOptions();
    }

    var leftRecords = BasiDraftRuntimeRevision.makePrimitiveRecords(left, options);
    var rightRecords = BasiDraftRuntimeRevision.makePrimitiveRecords(right, options);
    var leftBag = BasiDraftRuntimeRevision.makeBag(leftRecords);
    var rightBag = BasiDraftRuntimeRevision.makeBag(rightRecords);
    var common = 0;

    for (var key in leftBag) {
        if (!leftBag.hasOwnProperty(key) || isNull(rightBag[key])) {
            continue;
        }
        common += Math.min(leftBag[key], rightBag[key]);
    }

    var denominator = Math.max(leftRecords.length, rightRecords.length);
    return {
        leftPrimitiveCount:leftRecords.length,
        rightPrimitiveCount:rightRecords.length,
        commonPrimitiveCount:common,
        removedPrimitiveCount:leftRecords.length-common,
        addedPrimitiveCount:rightRecords.length-common,
        score: denominator === 0 ? 0.0 : common/denominator
    };
};

BasiDraftRuntimeRevision.diffSnapshots = function(left, right, options) {
    if (isNull(options)) {
        options = BasiDraftRuntimeRevision.defaultOptions();
    }

    var leftRecords = BasiDraftRuntimeRevision.makePrimitiveRecords(left, options);
    var rightRecords = BasiDraftRuntimeRevision.makePrimitiveRecords(right, options);
    var leftBag = BasiDraftRuntimeRevision.makeBag(leftRecords);
    var rightBag = BasiDraftRuntimeRevision.makeBag(rightRecords);

    function excess(a, b) {
        var result = {};
        for (var key in a) {
            if (!a.hasOwnProperty(key)) {
                continue;
            }
            var other = isNull(b[key]) ? 0 : b[key];
            if (a[key] > other) {
                result[key] = a[key]-other;
            }
        }
        return result;
    }

    function collect(records, counts) {
        var snapshot = {lines:[], arcs:[], circles:[], unsupportedPrimitiveCount:0};
        for (var i=0; i<records.length; ++i) {
            var record = records[i];
            if (isNull(counts[record.key]) || counts[record.key] <= 0) {
                continue;
            }
            --counts[record.key];
            if (record.kind === "line") {
                snapshot.lines.push(record.primitive);
            }
            else if (record.kind === "arc") {
                snapshot.arcs.push(record.primitive);
            }
            else if (record.kind === "circle") {
                snapshot.circles.push(record.primitive);
            }
        }
        return snapshot;
    }

    return {
        similarity:BasiDraftRuntimeRevision.compareSnapshots(left, right, options),
        removed:collect(leftRecords, excess(leftBag, rightBag)),
        added:collect(rightRecords, excess(rightBag, leftBag))
    };
};

BasiDraftRuntimeRevision.findBest = function(source, candidates, options) {
    var ranked = [];
    for (var i=0; i<candidates.length; ++i) {
        ranked.push({
            index:i,
            score:BasiDraftRuntimeRevision.compareSnapshots(
                source,
                candidates[i],
                options
            ).score
        });
    }

    ranked.sort(function(a,b) {
        if (a.score !== b.score) {
            return b.score-a.score;
        }
        return a.index-b.index;
    });

    if (ranked.length === 0) {
        return {matched:false, ambiguous:false, candidateIndex:0, bestScore:0, runnerUpScore:0};
    }

    var result = {
        matched:false,
        ambiguous:false,
        candidateIndex:ranked[0].index,
        bestScore:ranked[0].score,
        runnerUpScore:ranked.length>1 ? ranked[1].score : 0.0
    };

    if (result.bestScore < options.minimumSimilarity) {
        return result;
    }
    if (ranked.length>1 &&
        result.bestScore-result.runnerUpScore < options.minimumWinnerGap) {
        result.ambiguous = true;
        return result;
    }
    result.matched = true;
    return result;
};

BasiDraftRuntimeRevision.compareViewSets = function(oldSnapshots, newSnapshots, options) {
    if (isNull(options)) {
        options = BasiDraftRuntimeRevision.defaultOptions();
    }

    var revisions = [];
    var proposals = {};
    for (var oldIndex=0; oldIndex<oldSnapshots.length; ++oldIndex) {
        var decision = BasiDraftRuntimeRevision.findBest(
            oldSnapshots[oldIndex],
            newSnapshots,
            options
        );
        var revision = {
            oldViewIndex:oldIndex,
            matched:false,
            ambiguous:decision.ambiguous,
            newViewIndex:decision.candidateIndex,
            bestScore:decision.bestScore,
            runnerUpScore:decision.runnerUpScore,
            diff:undefined
        };
        revisions.push(revision);
        if (decision.matched) {
            var k = decision.candidateIndex.toString();
            if (isNull(proposals[k])) {
                proposals[k] = [];
            }
            proposals[k].push(oldIndex);
        }
    }

    var assigned = {};
    for (var key in proposals) {
        if (!proposals.hasOwnProperty(key)) {
            continue;
        }
        var newIndex = parseInt(key, 10);
        var oldIndices = proposals[key];
        oldIndices.sort(function(a,b) {
            var da = revisions[a].bestScore;
            var db = revisions[b].bestScore;
            if (da !== db) {
                return db-da;
            }
            return a-b;
        });

        if (oldIndices.length === 1) {
            var only = oldIndices[0];
            revisions[only].matched = true;
            revisions[only].diff = BasiDraftRuntimeRevision.diffSnapshots(
                oldSnapshots[only], newSnapshots[newIndex], options
            );
            assigned[key] = true;
            continue;
        }

        var bestOld = oldIndices[0];
        var bestScore = revisions[bestOld].bestScore;
        var secondScore = revisions[oldIndices[1]].bestScore;
        if (bestScore-secondScore >= options.minimumWinnerGap) {
            revisions[bestOld].matched = true;
            revisions[bestOld].ambiguous = false;
            revisions[bestOld].diff = BasiDraftRuntimeRevision.diffSnapshots(
                oldSnapshots[bestOld], newSnapshots[newIndex], options
            );
            assigned[key] = true;
            for (var x=1; x<oldIndices.length; ++x) {
                revisions[oldIndices[x]].matched = false;
                revisions[oldIndices[x]].ambiguous = true;
            }
        }
        else {
            for (var y=0; y<oldIndices.length; ++y) {
                revisions[oldIndices[y]].matched = false;
                revisions[oldIndices[y]].ambiguous = true;
            }
        }
    }

    var unmatchedNewViews = [];
    for (var n=0; n<newSnapshots.length; ++n) {
        if (isNull(assigned[n.toString()])) {
            unmatchedNewViews.push(n);
        }
    }

    return {oldViews:revisions, unmatchedNewViews:unmatchedNewViews};
};

BasiDraftRuntimeRevision.sameTranslatedLine = function(oldLine, newLine, tolerance) {
    function close(a,b) { return Math.abs(a-b) <= tolerance; }

    var odx=oldLine.x2-oldLine.x1;
    var ody=oldLine.y2-oldLine.y1;
    var ndx=newLine.x2-newLine.x1;
    var ndy=newLine.y2-newLine.y1;

    if (close(odx,ndx) && close(ody,ndy)) {
        var dx1=newLine.x1-oldLine.x1;
        var dy1=newLine.y1-oldLine.y1;
        var dx2=newLine.x2-oldLine.x2;
        var dy2=newLine.y2-oldLine.y2;
        if (close(dx1,dx2) && close(dy1,dy2)) {
            return {dx:(dx1+dx2)*0.5, dy:(dy1+dy2)*0.5};
        }
    }

    if (close(odx,-ndx) && close(ody,-ndy)) {
        var rdx1=newLine.x2-oldLine.x1;
        var rdy1=newLine.y2-oldLine.y1;
        var rdx2=newLine.x1-oldLine.x2;
        var rdy2=newLine.y1-oldLine.y2;
        if (close(rdx1,rdx2) && close(rdy1,rdy2)) {
            return {dx:(rdx1+rdx2)*0.5, dy:(rdy1+rdy2)*0.5};
        }
    }
    return undefined;
};

BasiDraftRuntimeRevision.detectLocalLineTranslation = function(diff, tolerance) {
    if (isNull(tolerance)) {
        tolerance = 1.0e-4;
    }

    var votes = {};
    for (var i=0; i<diff.removed.lines.length; ++i) {
        for (var j=0; j<diff.added.lines.length; ++j) {
            var motion = BasiDraftRuntimeRevision.sameTranslatedLine(
                diff.removed.lines[i], diff.added.lines[j], tolerance
            );
            if (isNull(motion)) {
                continue;
            }
            var qx=Math.round(motion.dx/tolerance);
            var qy=Math.round(motion.dy/tolerance);
            var key=qx+","+qy;
            if (isNull(votes[key])) {
                votes[key]={count:0,sumDx:0,sumDy:0};
            }
            ++votes[key].count;
            votes[key].sumDx += motion.dx;
            votes[key].sumDy += motion.dy;
        }
    }

    var ranked=[];
    for (var key in votes) {
        if (votes.hasOwnProperty(key)) {
            ranked.push(votes[key]);
        }
    }
    ranked.sort(function(a,b){return b.count-a.count;});
    if (ranked.length===0) {
        return {detected:false, ambiguous:false, dx:0, dy:0, supportCount:0};
    }

    var best=ranked[0];
    var total=diff.removed.lines.length;
    var runner=ranked.length>1 ? ranked[1].count : 0;
    if (best.count < 2 || best.count/total < 0.60) {
        return {detected:false, ambiguous:false, dx:0, dy:0, supportCount:best.count};
    }
    if (runner>0 && (best.count-runner)/total < 0.15) {
        return {detected:false, ambiguous:true, dx:0, dy:0, supportCount:best.count};
    }

    return {
        detected:true,
        ambiguous:false,
        dx:best.sumDx/best.count,
        dy:best.sumDy/best.count,
        supportCount:best.count
    };
};
