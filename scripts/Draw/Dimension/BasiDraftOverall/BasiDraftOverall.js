include("scripts/EAction.js");
include("scripts/Developer/BasiDraft/BasiDraftLogicalViews.js");
include("scripts/Developer/BasiDraft/BasiDraftDimensionBinding.js");

/**
 * First BasiDraft automatic dimensioning action.
 *
 * The user selects the complete geometry of one logical view. The action derives
 * the selection bounding box and adds native QCAD overall width / height
 * dimensions. Every created BasiDraft dimension receives a semantic view-extent
 * binding immediately; unbound owned dimensions are never created.
 */
function BasiDraftOverall(guiAction) {
    EAction.call(this, guiAction);
}

BasiDraftOverall.prototype = new EAction();

BasiDraftOverall.createDimensionData = function(box, offset) {
    var result = [];
    if (isNull(box) || !box.isValid() || !box.isSane()) {
        return result;
    }

    var min = box.getMinimum();
    var max = box.getMaximum();
    var width = box.getWidth();
    var height = box.getHeight();

    if (width > RS.PointTolerance) {
        var horizontal = new RDimRotatedData();
        horizontal.setExtensionPoint1(new RVector(min.x, min.y));
        horizontal.setExtensionPoint2(new RVector(max.x, min.y));
        horizontal.setDefinitionPoint(new RVector((min.x + max.x) / 2.0, min.y - offset));
        horizontal.setRotation(0.0);
        horizontal.setLinearFactor(1.0);
        if (horizontal.isValid()) {
            result.push(horizontal);
        }
    }

    if (height > RS.PointTolerance) {
        var vertical = new RDimRotatedData();
        vertical.setExtensionPoint1(new RVector(min.x, min.y));
        vertical.setExtensionPoint2(new RVector(min.x, max.y));
        vertical.setDefinitionPoint(new RVector(min.x - offset, (min.y + max.y) / 2.0));
        vertical.setRotation(Math.PI / 2.0);
        vertical.setLinearFactor(1.0);
        if (vertical.isValid()) {
            result.push(vertical);
        }
    }

    return result;
};

BasiDraftOverall.boxMatchesLogicalView = function(box, viewBox, tolerance) {
    if (isNull(box) || isNull(viewBox)) {
        return false;
    }
    var min = box.getMinimum();
    var max = box.getMaximum();
    return Math.abs(min.x-viewBox.minX) <= tolerance &&
           Math.abs(min.y-viewBox.minY) <= tolerance &&
           Math.abs(max.x-viewBox.maxX) <= tolerance &&
           Math.abs(max.y-viewBox.maxY) <= tolerance;
};

/**
 * Returns one unambiguous logical view whose world-space bounds equal the
 * selected geometry bounds. Full-view selection is intentional for this first
 * automatic overall-dimension command: if identity is not certain, do not make
 * an owned dimension that cannot be safely revised later.
 */
BasiDraftOverall.findLogicalViewIndex = function(document, box) {
    var logical = BasiDraftLogicalViews.analyzeLogicalViews(document);
    var scale = Math.max(Math.abs(box.getWidth()), Math.abs(box.getHeight()), 1.0);
    var tolerance = Math.max(1.0e-4, scale*1.0e-7);
    var found = -1;

    for (var i=0; i<logical.views.length; ++i) {
        if (!BasiDraftOverall.boxMatchesLogicalView(box, logical.views[i].box, tolerance)) {
            continue;
        }
        if (found !== -1) {
            // Never choose between two coincident candidate views silently.
            return -1;
        }
        found = i;
    }
    return found;
};

BasiDraftOverall.prototype.beginEvent = function() {
    EAction.prototype.beginEvent.call(this);

    var di = this.getDocumentInterface();
    var document = this.getDocument();

    if (!document.hasSelection()) {
        EAction.handleUserMessage(qsTr("Выделите геометрию одного вида и повторите команду."));
        this.terminate();
        return;
    }

    var box = document.getSelectionBox();
    if (!box.isValid() || !box.isSane()) {
        EAction.handleUserMessage(qsTr("Не удалось определить габарит выделенного вида."));
        this.terminate();
        return;
    }

    var width = box.getWidth();
    var height = box.getHeight();
    if (width <= RS.PointTolerance && height <= RS.PointTolerance) {
        EAction.handleUserMessage(qsTr("Выделенная геометрия не имеет измеримого габарита."));
        this.terminate();
        return;
    }

    var viewIndex = BasiDraftOverall.findLogicalViewIndex(document, box);
    if (viewIndex < 0) {
        EAction.handleUserWarning(qsTr(
            "Не удалось однозначно связать выделение с одним логическим видом. " +
            "Габаритные размеры не созданы, чтобы не оставить небезопасные привязки."
        ));
        this.terminate();
        return;
    }

    var dimStyle = document.queryDimStyleDirect();
    var dimScale = 1.0;
    var dimText = 2.5;
    var dimArrow = 2.5;
    var dimExe = 1.25;

    if (!isNull(dimStyle)) {
        dimScale = dimStyle.getDouble(RS.DIMSCALE);
        dimText = dimStyle.getDouble(RS.DIMTXT);
        dimArrow = dimStyle.getDouble(RS.DIMASZ);
        dimExe = dimStyle.getDouble(RS.DIMEXE);
    }

    if (typeof(dimScale) !== "number" || isNaN(dimScale) || dimScale <= 0.0) {
        dimScale = 1.0;
    }

    var styleOffset = (dimText * 2.0 + dimArrow * 2.0 + dimExe) * dimScale;
    var geometryOffset = Math.max(width, height) * 0.025;
    var offset = Math.max(styleOffset, geometryOffset);

    if (typeof(offset) !== "number" || isNaN(offset) || offset <= RS.PointTolerance) {
        offset = Math.max(10.0, Math.max(width, height) * 0.025);
    }

    var data = BasiDraftOverall.createDimensionData(box, offset);
    if (data.length === 0) {
        EAction.handleUserMessage(qsTr("Не удалось создать габаритные размеры."));
        this.terminate();
        return;
    }

    var modes = [];
    if (width > RS.PointTolerance) {
        modes.push("width");
    }
    if (height > RS.PointTolerance) {
        modes.push("height");
    }
    if (modes.length !== data.length) {
        EAction.handleUserWarning(qsTr("Не удалось сформировать безопасные привязки габаритных размеров."));
        this.terminate();
        return;
    }

    var op = new RAddObjectsOperation();
    op.setText(qsTr("BasiDraft: габаритные размеры"));

    for (var i = 0; i < data.length; ++i) {
        var entity = new RDimRotatedEntity(document, data[i]);
        var binding = BasiDraftDimensionBinding.makeViewExtentBinding(
            viewIndex,
            modes[i]
        );
        if (!BasiDraftDimensionBinding.attach(entity, binding)) {
            EAction.handleUserWarning(qsTr("Не удалось привязать габаритный размер к виду."));
            this.terminate();
            return;
        }
        op.addObject(entity);
    }

    di.applyOperation(op);
    this.terminate();
};
