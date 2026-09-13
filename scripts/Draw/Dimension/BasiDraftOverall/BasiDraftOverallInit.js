function init(basePath) {
    var action = new RGuiAction(qsTranslate("BasiDraftOverall", "BasiDraft: габаритные размеры"),
        RMainWindowQt.getMainWindow());
    action.setRequiresDocument(true);
    action.setScriptFile(basePath + "/BasiDraftOverall.js");
    action.setStatusTip(qsTranslate("BasiDraftOverall", "Автоматически поставить габаритные размеры выделенного вида"));
    action.setDefaultCommands(["bdoverall", "bdgab"]);
    action.setGroupSortOrder(12100);
    action.setSortOrder(950);
    action.setWidgetNames(["DimensionMenu", "DimensionToolBar", "DimensionToolsPanel", "DimensionMatrixPanel"]);
}
