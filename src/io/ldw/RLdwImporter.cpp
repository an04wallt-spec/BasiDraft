#include "RLdwImporter.h"

#include <QDebug>
#include <QFileInfo>

#include <exception>
#include <variant>

#include "RDocument.h"
#include "RLineEntity.h"
#include "RCircleEntity.h"
#include "RVector.h"
#include "geometry/GeometryFingerprint.h"
#include "ldw/LdwReader.h"

namespace {

void tagImportedEntity(const QSharedPointer<REntity>& entity,
                       const basidraft::ldw::Entity& sourceEntity,
                       const basidraft::geometry::GeometryFingerprint& sourceFingerprint,
                       const QString& sourceFileName) {
    entity->setCustomProperty("BasiDraft", "SourceFormat", "LDW");
    entity->setCustomProperty("BasiDraft", "SourceFile", sourceFileName);
    entity->setCustomProperty(
        "BasiDraft",
        "SourceGeometryHash",
        QString::number(static_cast<qulonglong>(sourceFingerprint.exactHash))
    );
    entity->setCustomProperty(
        "BasiDraft",
        "SourceOffset",
        QString::number(static_cast<qulonglong>(sourceEntity.fileOffset))
    );
    entity->setCustomProperty(
        "BasiDraft",
        "LdwType",
        QString::number(static_cast<unsigned int>(sourceEntity.ldwType))
    );
}

} // namespace

RLdwImporter::RLdwImporter(RDocument& document,
                           RMessageHandler* messageHandler,
                           RProgressHandler* progressHandler)
    : RFileImporter(document, messageHandler, progressHandler) {
}

bool RLdwImporter::importFile(const QString& fileName,
                              const QString& nameFilter,
                              const QVariantMap& params) {
    Q_UNUSED(nameFilter)
    Q_UNUSED(params)

    QFileInfo fileInfo(fileName);
    if (!fileInfo.exists() || !fileInfo.isFile() || fileInfo.size() <= 0) {
        qWarning() << "RLdwImporter: invalid LDW file:" << fileName;
        return false;
    }

    basidraft::ldw::Document source;
    try {
#ifdef Q_OS_WIN
        source = basidraft::ldw::Reader().readFile(
            std::filesystem::path(fileName.toStdWString())
        );
#else
        source = basidraft::ldw::Reader().readFile(
            std::filesystem::path(fileName.toStdString())
        );
#endif
    }
    catch (const std::exception& error) {
        qWarning() << "RLdwImporter: cannot parse" << fileName << ":" << error.what();
        return false;
    }

    // Exactness is more important than a partial drawing. Until every encountered
    // entity can be placed reliably, refuse the whole import instead of silently
    // dropping unsupported geometry or annotations.
    bool fullySupported = source.warnings.empty();
    for (const basidraft::ldw::Entity& sourceEntity : source.entities) {
        if (std::holds_alternative<basidraft::ldw::TextEntity>(sourceEntity.data)) {
            qWarning() << "RLdwImporter: text entity is recognized, but its placement is not decoded yet; offset"
                       << static_cast<qulonglong>(sourceEntity.fileOffset);
            fullySupported = false;
        }
        else if (std::holds_alternative<basidraft::ldw::UnknownEntity>(sourceEntity.data)) {
            qWarning() << "RLdwImporter: unsupported LDW entity type"
                       << sourceEntity.ldwType
                       << "at offset"
                       << static_cast<qulonglong>(sourceEntity.fileOffset);
            fullySupported = false;
        }
    }

    for (const std::string& warning : source.warnings) {
        qWarning().noquote() << QString::fromStdString(warning);
    }

    if (!fullySupported) {
        qWarning() << "RLdwImporter: import cancelled because the drawing cannot yet be reproduced exactly";
        return false;
    }

    const auto sourceFingerprint = basidraft::geometry::fingerprint(source);
    const QString canonicalSource = fileInfo.canonicalFilePath().isEmpty()
        ? fileInfo.absoluteFilePath()
        : fileInfo.canonicalFilePath();

    setCurrentBlockId(document->getModelSpaceBlockId());
    RImporter::startImport();

    for (const basidraft::ldw::Entity& sourceEntity : source.entities) {
        if (const auto* line = std::get_if<basidraft::ldw::LineEntity>(&sourceEntity.data)) {
            QSharedPointer<RLineEntity> entity(
                new RLineEntity(
                    document,
                    RLineData(
                        RVector(line->start.x, line->start.y),
                        RVector(line->end.x, line->end.y)
                    )
                )
            );
            entity->setBlockId(getCurrentBlockId());
            entity->setLayerId(document->getLayer0Id());
            tagImportedEntity(entity, sourceEntity, sourceFingerprint, canonicalSource);
            importObjectP(entity);
            continue;
        }

        if (const auto* circle = std::get_if<basidraft::ldw::CircleEntity>(&sourceEntity.data)) {
            QSharedPointer<RCircleEntity> entity(
                new RCircleEntity(
                    document,
                    RCircleData(
                        RVector(circle->center.x, circle->center.y),
                        circle->radius
                    )
                )
            );
            entity->setBlockId(getCurrentBlockId());
            entity->setLayerId(document->getLayer0Id());
            tagImportedEntity(entity, sourceEntity, sourceFingerprint, canonicalSource);
            importObjectP(entity);
        }
    }

    document->setFileVersion("BAZIS LDW (*.ldw)");
    RImporter::endImport();
    return true;
}
