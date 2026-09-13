#include "LdwReader.h"

#include <algorithm>
#include <array>
#include <cstring>
#include <fstream>
#include <iterator>
#include <stdexcept>

namespace basidraft::ldw {
namespace {

constexpr std::array<std::uint8_t, 11> kMagic = {
    '*', 'B', 'A', 'Z', 'I', 'S', '*', 'L', 'D', 'W', '*'
};
constexpr std::array<std::uint8_t, 4> kEntitySentinel = {0xD3, 0xD4, 0xCE, 0x00};

constexpr std::size_t kLineRecordSize = 57;
constexpr std::size_t kCircleRecordSize = 45;
constexpr std::size_t kTextFixedPrefixSize = 80;

void requireRange(const std::vector<std::uint8_t>& bytes, std::size_t offset, std::size_t size) {
    if (offset > bytes.size() || size > bytes.size() - offset) {
        throw std::runtime_error("LDW: unexpected end of file");
    }
}

} // namespace

Document Reader::readFile(const std::filesystem::path& path) const {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("LDW: cannot open file");
    }

    std::vector<std::uint8_t> bytes(
        (std::istreambuf_iterator<char>(input)),
        std::istreambuf_iterator<char>()
    );
    return parse(bytes);
}

Document Reader::parse(const std::vector<std::uint8_t>& bytes) const {
    if (bytes.size() < 12) {
        throw std::runtime_error("LDW: file is too small");
    }

    if (bytes[0] != 0x0B || !std::equal(kMagic.begin(), kMagic.end(), bytes.begin() + 1)) {
        throw std::runtime_error("LDW: BAZIS LDW signature not found");
    }

    Document document;
    document.entityStreamOffset = findEntityStream(bytes);
    std::size_t cursor = document.entityStreamOffset;

    while (cursor < bytes.size()) {
        requireRange(bytes, cursor, 6);
        const std::uint16_t type = readU16(bytes, cursor);
        const std::uint32_t declaredSize = readU32(bytes, cursor + 2);

        Entity entity;
        entity.ldwType = type;
        entity.declaredSize = declaredSize;
        entity.fileOffset = cursor;

        if (type == kLineType) {
            requireRange(bytes, cursor, kLineRecordSize);
            LineEntity line;
            line.start.x = readF64(bytes, cursor + 25);
            line.start.y = readF64(bytes, cursor + 33);
            line.end.x = readF64(bytes, cursor + 41);
            line.end.y = readF64(bytes, cursor + 49);
            entity.data = line;
            document.entities.push_back(std::move(entity));
            cursor += kLineRecordSize;
            continue;
        }

        if (type == kCircleType) {
            requireRange(bytes, cursor, kCircleRecordSize);
            CircleEntity circle;
            circle.center.x = readF64(bytes, cursor + 21);
            circle.center.y = readF64(bytes, cursor + 29);
            circle.radius = readF64(bytes, cursor + 37);
            entity.data = circle;
            document.entities.push_back(std::move(entity));
            cursor += kCircleRecordSize;
            continue;
        }

        if (type == kTextType) {
            requireRange(bytes, cursor, kTextFixedPrefixSize + 4);
            TextEntity text;
            text.fixedPayload.assign(
                bytes.begin() + static_cast<std::ptrdiff_t>(cursor),
                bytes.begin() + static_cast<std::ptrdiff_t>(cursor + kTextFixedPrefixSize)
            );

            const std::uint32_t textLength = readU32(bytes, cursor + kTextFixedPrefixSize);
            const std::size_t textOffset = cursor + kTextFixedPrefixSize + 4;
            requireRange(bytes, textOffset, textLength + 1 + 4);
            text.textUtf8.assign(
                reinterpret_cast<const char*>(bytes.data() + textOffset),
                textLength
            );

            const std::size_t fontLengthOffset = textOffset + textLength + 1;
            const std::uint32_t fontLength = readU32(bytes, fontLengthOffset);
            const std::size_t fontOffset = fontLengthOffset + 4;
            requireRange(bytes, fontOffset, fontLength);
            text.fontUtf8.assign(
                reinterpret_cast<const char*>(bytes.data() + fontOffset),
                fontLength
            );

            entity.data = std::move(text);
            document.entities.push_back(std::move(entity));
            cursor = fontOffset + fontLength;
            continue;
        }

        UnknownEntity unknown;
        unknown.type = type;
        unknown.declaredSize = declaredSize;
        unknown.remainingBytes.assign(
            bytes.begin() + static_cast<std::ptrdiff_t>(cursor),
            bytes.end()
        );
        entity.data = std::move(unknown);
        document.entities.push_back(std::move(entity));
        document.warnings.push_back(
            "LDW: unsupported entity type " + std::to_string(type) +
            " at offset " + std::to_string(cursor) +
            "; parsing stopped to avoid losing synchronization"
        );
        break;
    }

    return document;
}

std::size_t Reader::findEntityStream(const std::vector<std::uint8_t>& bytes) {
    if (bytes.size() < kEntitySentinel.size()) {
        throw std::runtime_error("LDW: entity stream marker not found");
    }

    for (std::size_t i = bytes.size() - kEntitySentinel.size() + 1; i-- > 0;) {
        if (std::equal(kEntitySentinel.begin(), kEntitySentinel.end(), bytes.begin() + static_cast<std::ptrdiff_t>(i))) {
            return i + kEntitySentinel.size();
        }
    }

    throw std::runtime_error("LDW: entity stream marker not found");
}

std::uint16_t Reader::readU16(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
    requireRange(bytes, offset, 2);
    return static_cast<std::uint16_t>(bytes[offset]) |
           (static_cast<std::uint16_t>(bytes[offset + 1]) << 8U);
}

std::uint32_t Reader::readU32(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
    requireRange(bytes, offset, 4);
    return static_cast<std::uint32_t>(bytes[offset]) |
           (static_cast<std::uint32_t>(bytes[offset + 1]) << 8U) |
           (static_cast<std::uint32_t>(bytes[offset + 2]) << 16U) |
           (static_cast<std::uint32_t>(bytes[offset + 3]) << 24U);
}

double Reader::readF64(const std::vector<std::uint8_t>& bytes, std::size_t offset) {
    requireRange(bytes, offset, 8);
    std::uint64_t raw = 0;
    for (std::size_t i = 0; i < 8; ++i) {
        raw |= static_cast<std::uint64_t>(bytes[offset + i]) << (8U * i);
    }
    double value = 0.0;
    static_assert(sizeof(value) == sizeof(raw));
    std::memcpy(&value, &raw, sizeof(value));
    return value;
}

} // namespace basidraft::ldw
