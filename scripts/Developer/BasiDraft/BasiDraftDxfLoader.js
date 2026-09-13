include("scripts/File/NewFile/NewFile.js");

/**
 * Loads a DXF into an isolated in-memory QCAD document without creating an MDI
 * window. This is the foundation of BasiDraft's "Update from DXF" workflow:
 * the regenerated BAZIS drawing can be inspected and compared safely before the
 * current project document is changed.
 */
function BasiDraftDxfLoader() {
}

BasiDraftDxfLoader.load = function(fileName, nameFilter) {
    var result = {
        ok:false,
        errorCode:RDocumentInterface.IoErrorGeneralImportError,
        storage:undefined,
        spatialIndex:undefined,
        document:undefined,
        documentInterface:undefined
    };

    if (isNull(fileName) || fileName.length === 0) {
        return result;
    }

    if (isNull(nameFilter)) {
        nameFilter = "";
    }

    var fileInfo = new QFileInfo(fileName);
    if (!fileInfo.exists() || !fileInfo.isFile() || fileInfo.size() <= 0) {
        result.errorCode = RDocumentInterface.IoErrorNotFound;
        return result;
    }

    var storage = new RMemoryStorage();
    var spatialIndex = createSpatialIndex();
    var document = new RDocument(storage, spatialIndex, true);
    var di = new RDocumentInterface(document);

    var errorCode = di.importFile(fileName, nameFilter);

    result.storage = storage;
    result.spatialIndex = spatialIndex;
    result.document = document;
    result.documentInterface = di;
    result.errorCode = errorCode;
    result.ok = errorCode === RDocumentInterface.IoErrorNoError;
    return result;
};
