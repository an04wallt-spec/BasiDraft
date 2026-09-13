function init(basePath) {
    var action = new RGuiAction(
        qsTranslate("BasiDraftUpdateFromDxfAction", "Обновить из DXF") + "…",
        RMainWindowQt.getMainWindow()
    );
    action.setRequiresDocument(true);
    action.setScriptFile(basePath + "/BasiDraftUpdateFromDxfAction.js");
    action.setDefaultCommands(["updatedxf", "refreshdxf"]);
    action.setStatusTip(qsTranslate(
        "BasiDraftUpdateFromDxfAction",
        "Сравнить текущую геометрию с новым DXF и безопасно обновить чертёж"
    ));
    action.setNoState();
    action.setGroupSortOrder(1000);
    action.setSortOrder(550);
    action.setWidgetNames(["FileMenu", "FileToolsPanel"]);
}
