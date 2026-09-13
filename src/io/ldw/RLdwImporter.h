#pragma once

#include "RFileImporter.h"
#include "ldw_global.h"

class BASIDRAFTLDW_EXPORT RLdwImporter : public RFileImporter {
public:
    RLdwImporter(RDocument& document,
                 RMessageHandler* messageHandler = nullptr,
                 RProgressHandler* progressHandler = nullptr);
    ~RLdwImporter() override = default;

    bool importFile(const QString& fileName,
                    const QString& nameFilter,
                    const QVariantMap& params = QVariantMap()) override;
};
