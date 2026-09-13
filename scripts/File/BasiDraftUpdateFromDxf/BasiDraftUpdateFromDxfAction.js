include("scripts/EAction.js");
include("scripts/Developer/BasiDraft/BasiDraftUpdateFromDxf.js");

/**
 * Product UI action for the guarded BasiDraft source revision workflow.
 */
function BasiDraftUpdateFromDxfAction(guiAction) {
    EAction.call(this, guiAction);
}

BasiDraftUpdateFromDxfAction.prototype = new EAction();

BasiDraftUpdateFromDxfAction.prototype.chooseFile = function() {
    var lastPath = RSettings.getStringValue(
        "BasiDraft/UpdateFromDxf/Path",
        RSettings.getDocumentsLocation()
    );

    var appWin = EAction.getMainWindow();
    var dialog = new QFileDialog(
        appWin,
        qsTr("Обновить геометрию из DXF"),
        lastPath,
        ""
    );
    dialog.setNameFilters([
        qsTr("DXF чертежи (*.dxf *.DXF)"),
        qsTr("Все файлы (*)")
    ]);
    dialog.selectNameFilter(qsTr("DXF чертежи (*.dxf *.DXF)"));
    dialog.fileMode = QFileDialog.ExistingFile;
    if (typeof getDontUseNativeDialog === "function") {
        dialog.setOption(QFileDialog.DontUseNativeDialog, getDontUseNativeDialog());
    }
    if (!isNull(QFileDialog.DontUseCustomDirectoryIcons)) {
        dialog.setOption(QFileDialog.DontUseCustomDirectoryIcons, true);
    }

    if (!dialog.exec()) {
        destrDialog(dialog);
        EAction.activateMainWindow();
        return undefined;
    }

    var files = dialog.selectedFiles();
    if (files.length === 0) {
        destrDialog(dialog);
        EAction.activateMainWindow();
        return undefined;
    }

    var fileName = files[0];
    RSettings.setValue(
        "BasiDraft/UpdateFromDxf/Path",
        dialog.directory().absolutePath()
    );
    destrDialog(dialog);
    EAction.activateMainWindow();
    return fileName;
};

BasiDraftUpdateFromDxfAction.prototype.beginEvent = function() {
    EAction.prototype.beginEvent.call(this);

    var di = this.getDocumentInterface();
    if (isNull(di)) {
        this.terminate();
        return;
    }

    var fileName = this.chooseFile();
    if (isNull(fileName)) {
        this.terminate();
        return;
    }

    var result = BasiDraftUpdateFromDxf.refresh(di, fileName);
    if (isNull(result) || isNull(result.refresh) || !result.refresh.applied) {
        var reason = qsTr("Обновление не выполнено.");
        if (!isNull(result) && !isNull(result.refresh) &&
            !isNull(result.refresh.error) && result.refresh.error.length > 0) {
            reason += "\n\n" + result.refresh.error;
        }

        if (!isNull(result) && !isNull(result.refresh) &&
            !isNull(result.refresh.preflight)) {
            var p = result.refresh.preflight;
            if (p.needsReview > 0 || p.lost > 0 || p.unboundOwned > 0) {
                reason += "\n\n" + qsTr(
                    "Размеры требуют проверки: неоднозначных — %1, потерянных — %2, без привязки — %3."
                ).arg(p.needsReview).arg(p.lost).arg(p.unboundOwned);
            }
        }

        EAction.handleUserWarning(reason);
        this.terminate();
        return;
    }

    var stats = result.refresh.dimensionStats;
    var updated = isNull(stats) ? 0 : stats.updated;
    var current = isNull(stats) ? 0 : stats.current;
    var message = qsTr(
        "DXF обновлён. Заменено исходных объектов: %1. Обновлено привязанных размеров: %2. Без изменений: %3."
    ).arg(result.refresh.removedSourceEntityCount).arg(updated).arg(current);
    EAction.handleUserMessage(message);

    di.regenerateScenes();
    di.repaintViews();
    this.terminate();
};
