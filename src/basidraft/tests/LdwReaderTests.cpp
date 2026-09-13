#include "ldw/LdwReader.h"

#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <variant>
#include <vector>

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

void appendHeader(std::vector<std::uint8_t>& out) {
    const std::string magic = "*BAZIS*LDW*";
    out.push_back(0x0B);
    out.insert(out.end(), magic.begin(), magic.end());
    out.insert(out.end(), {0x10, 0x20, 0x30, 0x40});
    out.insert(out.end(), {0xD3, 0xD4, 0xCE, 0x00});
}

std::vector<std::uint8_t> makeLineFile() {
    std::vector<std::uint8_t> bytes;
    appendHeader(bytes);

    appendU16(bytes, basidraft::ldw::Reader::kLineType);
    appendU32(bytes, 56);
    bytes.resize(bytes.size() + 19, 0);
    appendF64(bytes, 20.0);
    appendF64(bytes, 30.0);
    appendF64(bytes, 120.0);
    appendF64(bytes, 80.0);
    return bytes;
}

std::vector<std::uint8_t> makeCircleFile() {
    std::vector<std::uint8_t> bytes;
    appendHeader(bytes);

    appendU16(bytes, basidraft::ldw::Reader::kCircleType);
    appendU32(bytes, 48);
    bytes.resize(bytes.size() + 15, 0);
    appendF64(bytes, 0.0);
    appendF64(bytes, 0.0);
    appendF64(bytes, 25.0);
    return bytes;
}

std::vector<std::uint8_t> makeTextFile() {
    std::vector<std::uint8_t> bytes;
    appendHeader(bytes);

    appendU16(bytes, basidraft::ldw::Reader::kTextType);
    appendU32(bytes, 96);
    bytes.resize(bytes.size() + 74, 0); // fixed payload is 80 bytes including type + size

    const std::string text = u8"ТЕСТ123.";
    appendU32(bytes, static_cast<std::uint32_t>(text.size()));
    bytes.insert(bytes.end(), text.begin(), text.end());
    bytes.push_back(0);

    const std::string font = "Bahnschrift";
    appendU32(bytes, static_cast<std::uint32_t>(font.size()));
    bytes.insert(bytes.end(), font.begin(), font.end());
    return bytes;
}

bool nearlyEqual(double a, double b) {
    return std::abs(a - b) < 1.0e-9;
}

} // namespace

int main() {
    const basidraft::ldw::Reader reader;

    {
        const auto document = reader.parse(makeLineFile());
        assert(document.entities.size() == 1);
        const auto* line = std::get_if<basidraft::ldw::LineEntity>(&document.entities[0].data);
        assert(line != nullptr);
        assert(nearlyEqual(line->start.x, 20.0));
        assert(nearlyEqual(line->start.y, 30.0));
        assert(nearlyEqual(line->end.x, 120.0));
        assert(nearlyEqual(line->end.y, 80.0));
    }

    {
        const auto document = reader.parse(makeCircleFile());
        assert(document.entities.size() == 1);
        const auto* circle = std::get_if<basidraft::ldw::CircleEntity>(&document.entities[0].data);
        assert(circle != nullptr);
        assert(nearlyEqual(circle->center.x, 0.0));
        assert(nearlyEqual(circle->center.y, 0.0));
        assert(nearlyEqual(circle->radius, 25.0));
    }

    {
        const auto document = reader.parse(makeTextFile());
        assert(document.entities.size() == 1);
        const auto* text = std::get_if<basidraft::ldw::TextEntity>(&document.entities[0].data);
        assert(text != nullptr);
        assert(text->textUtf8 == u8"ТЕСТ123.");
        assert(text->fontUtf8 == "Bahnschrift");
    }

    std::cout << "BasiDraft LDW reader tests passed\n";
    return 0;
}
