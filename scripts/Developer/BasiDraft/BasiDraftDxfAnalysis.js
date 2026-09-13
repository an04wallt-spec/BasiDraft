include("scripts/EAction.js");

/**
 * QCAD-side adapter for the BasiDraft DXF analysis pipeline.
 *
 * This layer deliberately does not modify the imported document. It classifies
 * top-level DXF/QCAD entities and exposes enough raw geometry information for
 * logical-view clustering and revision snapshots.
 */
function BasiDraftDxfAnalysis() {
}

BasiDraftDxfAnalysis.isForeignAnnotationType = function(type) {
    if (type >= RS.EntityDimension && type <= RS.EntityDimOrdinate) {
        return true;
    }

    return type === RS.EntityText ||
           type === RS.EntityLeader ||
           type === RS.EntityTolerance ||
           type === RS.EntityHatch;
};

BasiDraftDxfAnalysis.isGeometryPrimitiveType = function(type) {
    return type === RS.EntityLine ||
           type === RS.EntityPolyline ||
           type === RS.EntityArc ||
           type === RS.EntityCircle ||
           type === RS.EntityEllipse ||
           type === RS.EntitySpline ||
           type === RS.EntitySolid ||
           type === RS.Entity3dFace ||
           type === RS.EntityPoint;
};

BasiDraftDxfAnalysis.isIsoPaperBox = function(box) {
    if (isNull(box) || !box.isValid() || !box.isSane()) {
        return false;
    }

    var width = Math.abs(box.getWidth());
    var height = Math.abs(box.getHeight());
    var tolerance = 1.0;
    var sizes = [
        [210.0, 297.0],
        [297.0, 420.0],
        [420.0, 594.0],
        [594.0, 841.0],
        [841.0, 1189.0]
    ];

    for (var i=0; i<sizes.length; ++i) {
        var a = sizes[i][0];
        var b = sizes[i][1];
        if ((Math.abs(width-a) <= tolerance && Math.abs(height-b) <= tolerance) ||
            (Math.abs(width-b) <= tolerance && Math.abs(height-a) <= tolerance)) {
            return true;
        }
    }

    return false;
};

/**
 * Counts BAZIS / foreign annotation recursively through INSERTs.
 *
 * UpdateFromDxf accepts geometry-only source files. Looking at model-space
 * entities alone is not sufficient because BAZIS commonly packages drawing
 * content into anonymous blocks. A TEXT / DIMENSION / HATCH hidden one or more
 * block levels deep must therefore veto a source refresh just like a top-level
 * annotation entity would.
 */
BasiDraftDxfAnalysis.countForeignAnnotations = function(document, entity, depth) {
    if (isNull(entity)) {
        return 0;
    }
    if (isNull(depth)) {
        depth = 0;
    }
    if (depth > 32) {
        // A cyclic or malformed block graph is not trusted. Treat it as one
        // foreign item so guarded source refresh cannot proceed silently.
        return 1;
    }

    var type = entity.getType();
    if (BasiDraftDxfAnalysis.isForeignAnnotationType(type)) {
        return 1;
    }

    if (type !== RS.EntityBlockRef && type !== RS.EntityBlockRefAttr) {
        return 0;
    }

    var data = entity.getData();
    var subIds = document.queryBlockEntities(data.getReferencedBlockId());
    var count = 0;
    for (var i=0; i<subIds.length; ++i) {
        var subEntity = data.queryEntity(subIds[i], true);
        count += BasiDraftDxfAnalysis.countForeignAnnotations(
            document,
            subEntity,
            depth+1
        );
    }
    return count;
};

BasiDraftDxfAnalysis.countGeometry = function(document, entity, depth) {
    if (isNull(entity)) {
        return 0;
    }

    if (isNull(depth)) {
        depth = 0;
    }

    if (depth > 32) {
        return 0;
    }

    var type = entity.getType();
    if (BasiDraftDxfAnalysis.isForeignAnnotationType(type)) {
        return 0;
    }

    if (BasiDraftDxfAnalysis.isGeometryPrimitiveType(type)) {
        return 1;
    }

    if (type === RS.EntityBlockRef || type === RS.EntityBlockRefAttr) {
        var data = entity.getData();
        var subIds = document.queryBlockEntities(data.getReferencedBlockId());
        var count = 0;
        for (var i=0; i<subIds.length; ++i) {
            var subEntity = data.queryEntity(subIds[i], true);
            count += BasiDraftDxfAnalysis.countGeometry(document, subEntity, depth+1);
        }
        return count;
    }

    return 0;
};

BasiDraftDxfAnalysis.boxToObject = function(box) {
    if (isNull(box) || !box.isValid() || !box.isSane()) {
        return undefined;
    }
    var min = box.getMinimum();
    var max = box.getMaximum();
    return {
        minX: min.x,
        minY: min.y,
        maxX: max.x,
        maxY: max.y,
        width: box.getWidth(),
        height: box.getHeight()
    };
};

BasiDraftDxfAnalysis.makeGeometryRecord = function(document, entity) {
    var data = entity.getData();
    return {
        entityId: entity.getId(),
        entityType: entity.getType(),
        primitiveCount: BasiDraftDxfAnalysis.countGeometry(document, entity, 0),
        box: BasiDraftDxfAnalysis.boxToObject(data.getBoundingBox())
    };
};

BasiDraftDxfAnalysis.createEmptySnapshot = function() {
    return {
        lines: [],
        arcs: [],
        circles: [],
        unsupportedPrimitiveCount: 0
    };
};

BasiDraftDxfAnalysis.collectSnapshotPrimitives = function(document, entity, snapshot, depth) {
    if (isNull(entity)) {
        return;
    }
    if (isNull(depth)) {
        depth = 0;
    }
    if (depth > 32) {
        ++snapshot.unsupportedPrimitiveCount;
        return;
    }

    var type = entity.getType();
    if (BasiDraftDxfAnalysis.isForeignAnnotationType(type)) {
        return;
    }

    var data = entity.getData();

    if (type === RS.EntityLine) {
        var start = data.getStartPoint();
        var end = data.getEndPoint();
        snapshot.lines.push({
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y
        });
        return;
    }

    if (type === RS.EntityArc) {
        var center = data.getCenter();
        snapshot.arcs.push({
            cx: center.x,
            cy: center.y,
            radius: data.getRadius(),
            startAngleDeg: data.getStartAngle() * 180.0 / Math.PI,
            endAngleDeg: data.getEndAngle() * 180.0 / Math.PI
        });
        return;
    }

    if (type === RS.EntityCircle) {
        var circleCenter = data.getCenter();
        snapshot.circles.push({
            cx: circleCenter.x,
            cy: circleCenter.y,
            radius: data.getRadius()
        });
        return;
    }

    if (type === RS.EntityBlockRef || type === RS.EntityBlockRefAttr) {
        var subIds = document.queryBlockEntities(data.getReferencedBlockId());
        for (var i=0; i<subIds.length; ++i) {
            // queryEntity(..., true) applies the complete block-reference
            // transform, which is essential for comparing regenerated views in
            // their actual sheet coordinates.
            var subEntity = data.queryEntity(subIds[i], true);
            BasiDraftDxfAnalysis.collectSnapshotPrimitives(
                document,
                subEntity,
                snapshot,
                depth + 1
            );
        }
        return;
    }

    if (BasiDraftDxfAnalysis.isGeometryPrimitiveType(type)) {
        ++snapshot.unsupportedPrimitiveCount;
    }
};

BasiDraftDxfAnalysis.createSnapshotForEntityIds = function(document, entityIds) {
    var snapshot = BasiDraftDxfAnalysis.createEmptySnapshot();
    for (var i=0; i<entityIds.length; ++i) {
        var entity = document.queryEntity(entityIds[i]);
        BasiDraftDxfAnalysis.collectSnapshotPrimitives(document, entity, snapshot, 0);
    }
    return snapshot;
};

BasiDraftDxfAnalysis.analyzeDocument = function(document) {
    var result = {
        totalTopLevelEntities: 0,
        foreignAnnotationCount: 0,
        topLevelBlockReferenceCount: 0,
        looseGeometryCount: 0,
        ignoredOtherCount: 0,
        frameCandidates: [],
        blockCandidates: [],
        looseGeometry: [],
        geometryItems: []
    };

    if (isNull(document)) {
        return result;
    }

    var modelSpaceId = document.getModelSpaceBlockId();
    var ids = document.queryBlockEntities(modelSpaceId);
    result.totalTopLevelEntities = ids.length;

    for (var i=0; i<ids.length; ++i) {
        var entity = document.queryEntity(ids[i]);
        if (isNull(entity)) {
            continue;
        }

        var type = entity.getType();

        if (BasiDraftDxfAnalysis.isForeignAnnotationType(type)) {
            ++result.foreignAnnotationCount;
            continue;
        }

        if (type === RS.EntityBlockRef || type === RS.EntityBlockRefAttr) {
            ++result.topLevelBlockReferenceCount;
            result.foreignAnnotationCount +=
                BasiDraftDxfAnalysis.countForeignAnnotations(document, entity, 0);

            var data = entity.getData();
            var box = data.getBoundingBox();
            var record = BasiDraftDxfAnalysis.makeGeometryRecord(document, entity);
            record.referencedBlockId = data.getReferencedBlockId();
            record.referencedBlockName = document.getBlockName(data.getReferencedBlockId());
            record.sourceKind = "block";

            if (BasiDraftDxfAnalysis.isIsoPaperBox(box)) {
                result.frameCandidates.push(record);
            }
            else {
                result.blockCandidates.push(record);
                result.geometryItems.push(record);
            }
            continue;
        }

        if (BasiDraftDxfAnalysis.isGeometryPrimitiveType(type)) {
            ++result.looseGeometryCount;
            var loose = BasiDraftDxfAnalysis.makeGeometryRecord(document, entity);
            loose.sourceKind = "loose";
            result.looseGeometry.push(loose);
            result.geometryItems.push(loose);
            continue;
        }

        ++result.ignoredOtherCount;
    }

    return result;
};
