#include "GeometryFingerprint.h"

#include <algorithm>
#include <cstring>
#include <utility>
#include <vector>

namespace basidraft::geometry {
namespace {

constexpr std::uint64_t kFnvOffset = 1469598103934665603ULL;
constexpr std::uint64_t kFnvPrime = 1099511628211ULL;

void hashByte(std::uint64_t& hash, std::uint8_t byte) {
    hash ^= byte;
    hash *= kFnvPrime;
}

void hashU64(std::uint64_t& hash, std::uint64_t value) {
    for (int i = 0; i < 8; ++i) {
        hashByte(hash, static_cast<std::uint8_t>((value >> (i * 8)) & 0xFFU));
    }
}

void includePoint(Bounds2d& bounds, double x, double y) {
    if (!bounds.valid) {
        bounds.valid = true;
        bounds.minX = bounds.maxX = x;
        bounds.minY = bounds.maxY = y;
        return;
    }

    bounds.minX = std::min(bounds.minX, x);
    bounds.minY = std::min(bounds.minY, y);
    bounds.maxX = std::max(bounds.maxX, x);
    bounds.maxY = std::max(bounds.maxY, y);
}

struct Token {
    std::vector<std::uint8_t> bytes;

    bool operator<(const Token& other) const {
        return bytes < other.bytes;
    }
};

void appendU16(std::vector<std::uint8_t>& out, std::uint16_t value) {
    out.push_back(static_cast<std::uint8_t>(value & 0xFFU));
    out.push_back(static_cast<std::uint8_t>((value >> 8U) & 0xFFU));
}

void appendU32(std::vector<std::uint8_t>& out, std::uint32_t value) {
    for (int i = 0; i < 4; ++i) {
        out.push_back(static_cast<std::uint8_t>((value >> (i * 8)) & 0xFFU));
    }
}

void appendU64(std::vector<std::uint8_t>& out, std::uint64_t value) {
    for (int i = 0; i < 8; ++i) {
        out.push_back(static_cast<std::uint8_t>((value >> (i * 8)) & 0xFFU));
    }
}

void appendDouble(std::vector<std::uint8_t>& out, double value) {
    // Normalize signed zero so geometrically identical values hash equally.
    if (value == 0.0) {
        value = 0.0;
    }
    std::uint64_t bits = 0;
    static_assert(sizeof(bits) == sizeof(value));
    std::memcpy(&bits, &value, sizeof(value));
    appendU64(out, bits);
}

void appendString(std::vector<std::uint8_t>& out, const std::string& value) {
    appendU64(out, static_cast<std::uint64_t>(value.size()));
    out.insert(out.end(), value.begin(), value.end());
}

Token lineToken(const ldw::LineEntity& line, double originX, double originY) {
    ldw::Point2d a{line.start.x - originX, line.start.y - originY};
    ldw::Point2d b{line.end.x - originX, line.end.y - originY};
    if (b.x < a.x || (b.x == a.x && b.y < a.y)) {
        std::swap(a, b);
    }

    Token token;
    token.bytes.push_back(1);
    appendDouble(token.bytes, a.x);
    appendDouble(token.bytes, a.y);
    appendDouble(token.bytes, b.x);
    appendDouble(token.bytes, b.y);
    return token;
}

Token circleToken(const ldw::CircleEntity& circle, double originX, double originY) {
    Token token;
    token.bytes.push_back(2);
    appendDouble(token.bytes, circle.center.x - originX);
    appendDouble(token.bytes, circle.center.y - originY);
    appendDouble(token.bytes, circle.radius);
    return token;
}

Token textToken(const ldw::TextEntity& text) {
    Token token;
    token.bytes.push_back(25);
    appendString(token.bytes, text.textUtf8);
    appendString(token.bytes, text.fontUtf8);
    appendU64(token.bytes, static_cast<std::uint64_t>(text.fixedPayload.size()));
    token.bytes.insert(token.bytes.end(), text.fixedPayload.begin(), text.fixedPayload.end());
    return token;
}

Token unknownToken(const ldw::UnknownEntity& unknown) {
    Token token;
    token.bytes.push_back(0xFF);
    appendU16(token.bytes, unknown.type);
    appendU32(token.bytes, unknown.declaredSize);
    appendU64(token.bytes, static_cast<std::uint64_t>(unknown.remainingBytes.size()));
    token.bytes.insert(token.bytes.end(), unknown.remainingBytes.begin(), unknown.remainingBytes.end());
    return token;
}

std::uint64_t hashTokens(std::vector<Token> tokens) {
    std::sort(tokens.begin(), tokens.end());

    std::uint64_t hash = kFnvOffset;
    hashU64(hash, static_cast<std::uint64_t>(tokens.size()));
    for (const Token& token : tokens) {
        hashU64(hash, static_cast<std::uint64_t>(token.bytes.size()));
        for (std::uint8_t byte : token.bytes) {
            hashByte(hash, byte);
        }
    }
    return hash;
}

} // namespace

GeometryFingerprint fingerprint(const ldw::Document& document) {
    GeometryFingerprint result;

    // First pass: establish geometric bounds. Text is intentionally excluded
    // until its insertion point / alignment fields are verified from BAZIS.
    for (const ldw::Entity& entity : document.entities) {
        if (const auto* line = std::get_if<ldw::LineEntity>(&entity.data)) {
            ++result.lineCount;
            includePoint(result.bounds, line->start.x, line->start.y);
            includePoint(result.bounds, line->end.x, line->end.y);
        }
        else if (const auto* circle = std::get_if<ldw::CircleEntity>(&entity.data)) {
            ++result.circleCount;
            includePoint(result.bounds, circle->center.x - circle->radius, circle->center.y - circle->radius);
            includePoint(result.bounds, circle->center.x + circle->radius, circle->center.y + circle->radius);
        }
        else if (std::holds_alternative<ldw::TextEntity>(entity.data)) {
            ++result.textCount;
        }
        else {
            ++result.unknownCount;
        }
    }

    std::vector<Token> exactTokens;
    std::vector<Token> shapeTokens;
    exactTokens.reserve(document.entities.size());
    shapeTokens.reserve(result.lineCount + result.circleCount);

    const double originX = result.bounds.valid ? result.bounds.minX : 0.0;
    const double originY = result.bounds.valid ? result.bounds.minY : 0.0;

    for (const ldw::Entity& entity : document.entities) {
        if (const auto* line = std::get_if<ldw::LineEntity>(&entity.data)) {
            exactTokens.push_back(lineToken(*line, 0.0, 0.0));
            shapeTokens.push_back(lineToken(*line, originX, originY));
            continue;
        }

        if (const auto* circle = std::get_if<ldw::CircleEntity>(&entity.data)) {
            exactTokens.push_back(circleToken(*circle, 0.0, 0.0));
            shapeTokens.push_back(circleToken(*circle, originX, originY));
            continue;
        }

        if (const auto* text = std::get_if<ldw::TextEntity>(&entity.data)) {
            exactTokens.push_back(textToken(*text));
            // Text is excluded from shape identity until placement semantics are
            // known. Its content still participates in exact source identity.
            continue;
        }

        if (const auto* unknown = std::get_if<ldw::UnknownEntity>(&entity.data)) {
            exactTokens.push_back(unknownToken(*unknown));
        }
    }

    result.exactHash = hashTokens(std::move(exactTokens));
    result.shapeHash = shapeTokens.empty() ? 0 : hashTokens(std::move(shapeTokens));
    return result;
}

} // namespace basidraft::geometry
