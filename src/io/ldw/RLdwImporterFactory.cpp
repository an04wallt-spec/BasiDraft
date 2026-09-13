#include "RLdwImporterFactory.h"

#include <QFileInfo>

QStringList RLdwImporterFactory::getFilterStrings() {
    return QStringList() << QString::fromUtf8("BAZIS LDW (*.ldw)");
}

int RLdwImporterFactory::canImport(const QString& fileName, const QString& nameFilter) {
    const QFileInfo fileInfo(fileName);
    if (fileInfo.suffix().compare("ldw", Qt::CaseInsensitive) == 0) {
        return 100;
    }

    if (nameFilter.contains("*.ldw", Qt::CaseInsensitive) ||
        nameFilter.contains("BAZIS LDW", Qt::CaseInsensitive)) {
        return 100;
    }

    return -1;
}
