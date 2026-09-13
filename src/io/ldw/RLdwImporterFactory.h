#pragma once

#include "RFileImporterFactory.h"
#include "RFileImporterRegistry.h"
#include "RLdwImporter.h"
#include "ldw_global.h"

class BASIDRAFTLDW_EXPORT RLdwImporterFactory : public RFileImporterFactory {
public:
    static void registerFileImporter() {
        RFileImporterRegistry::registerFileImporter(new RLdwImporterFactory());
    }

    QStringList getFilterStrings() override;
    int canImport(const QString& fileName, const QString& nameFilter = "") override;

    RFileImporter* instantiate(RDocument& document,
                               RMessageHandler* messageHandler = nullptr,
                               RProgressHandler* progressHandler = nullptr) override {
        return new RLdwImporter(document, messageHandler, progressHandler);
    }
};
