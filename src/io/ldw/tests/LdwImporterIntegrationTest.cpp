#include <QCoreApplication>
#include <QString>

#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <vector>

#include "RBox.h"
#include "RDocument.h"
#include "RMemoryStorage.h"
#include "RSpatialIndexSimple.h"
#include "RLdwImporter.h"

namespace {

void appendU16(std::vector<std::uint8_t>& out, std::uint16_t value) {
    out.push_back(static_cast<std::uint8_t>(value & 0xFFU));
    out.push_back(static_cast<std::uint8_t>((value >> 8U) & 0xFFU));
}

void appendU32(std::vector<std::uint8_t>& out, std::uint32_t value) {
    for (int i = 0; i < 4; ++i) {
        out.push_back(static_cast<std::uint8_t>((value >> (8U * i)) & 0xFFU));
    }
}

void appendF64(std::vector<std::uint8_t>& out, double value) {
    std::uint64_t raw = 0;
    static_assert(sizeof(raw) == sizeof(value));
    std::memcpy(&raw, &value, sizeof(value));
    for (int i = 0; i < 8; ++i) {
        out.push_back(static_cast<std::uint8_t>((raw >> (8U * i)) & 0xFFU));
    }
}

void appendLine(std::vector<std::uint8_t>& out,
                double x1, double y1, double x2, double y2) {
    appendU16(out, 1);
    appendU32(out, 56);
    out.resize(out.size() + 19, 0);
    appendF64(out, x1);
    appendF64(out, y1);
    appendF64(out, x2);
    appendF64(out, y2);
}

std::vector<std::uint8_t> makeRectangleLdw() {
    std::vector<std::uint8_t> out;
    const char magic[] = "*BAZIS*LDW*";
    out.push_back(0x0B);
    out.insert(out.end(), magic, magic + 11);

    // The reader only depends on the verified entity-stream marker, so the
    // synthetic fixture deliberately keeps the unrelated header minimal.
    out.insert(out.end(), {0x10, 0x20, 0x30, 0x40});
    out.insert(out.end(), {0xD3, 0xD4, 0xCE, 0x00});

    appendLine(out, 20.0, 30.0, 120.0, 30.0);
    appendLine(out, 120.0, 30.0, 120.0, 80.0);
    appendLine(out, 120.0, 80.0, 20.0, 80.0);
    appendLine(out, 20.0, 80.0, 20.0, 30.0);
    return out;
}

bool nearlyEqual(double a, double b) {
    return std::abs(a - b) < 1.0e-9;
}

} // namespace

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);

    const std::filesystem::path path =
        std::filesystem::temp_directory_path() / "basidraft_ldw_integration_test.ldw";
    const auto bytes = makeRectangleLdw();

    {
        std::ofstream output(path, std::ios::binary | std::ios::trunc);
        assert(output.good());
        output.write(reinterpret_cast<const char*>(bytes.data()),
                     static_cast<std::streamsize>(bytes.size()));
        assert(output.good());
    }

    RMemoryStorage storage;
    RSpatialIndexSimple spatialIndex;
    RDocument document(storage, spatialIndex);
    RLdwImporter importer(document);

    const bool imported = importer.importFile(
        QString::fromStdString(path.string()),
        QString("BAZIS LDW (*.ldw)")
    );
    assert(imported);

    const QSet<RObject::Id> ids = document.queryAllEntities();
    assert(ids.size() == 4);

    const RBox box = document.getBoundingBox(true, true);
    assert(box.isValid());
    assert(nearlyEqual(box.getMinimum().x, 20.0));
    assert(nearlyEqual(box.getMinimum().y, 30.0));
    assert(nearlyEqual(box.getMaximum().x, 120.0));
    assert(nearlyEqual(box.getMaximum().y, 80.0));
    assert(nearlyEqual(box.getWidth(), 100.0));
    assert(nearlyEqual(box.getHeight(), 50.0));

    std::filesystem::remove(path);
    return 0;
}
