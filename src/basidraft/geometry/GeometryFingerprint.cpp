#include "GeometryFingerprint.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <string>
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

void hashDouble(std::uint64_t& hash, double value) {
    // Normalize signed zero so geometrically identical values hash equally.
    if (value == 0.0) {
        value = 0.0;
    }
    std::uint64_t bits = 0;
    static_assert(sizeof(bits) == sizeof(value));
    std::memcpy(&bits, &value, sizeof(value));
    hashU64(hash, bits);
}

void hashString(std::uint64_t& hash, const std::string& value) {
    hashU64(hash, static_cast<std::uint64_t>(value.size()));
    for (unsigned char ch : value) {
        hashByte(hash, ch);
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

void appendU64(std::vector<std::uint8_t>& out, std::uint64_t value) {
    for (int i = 0; i < 8; ++i) {
        out.push_back(static_cast<std::uint8_t>((value >> (i * 8)) & 0xFFU));
    }
}

void appendDouble(std::vector<std::uint8_t>& out, double value) {
    if (value == 0.0) {
        value = 0.0;
    }
    std::uint64_t bits = 0;
    std::memcpy(&bits, &value, sizeof(value));
    appendU64(out, bits);
}

void appendString(std::vector<std::uint8_t>& out, const std::string& value) {
    appendU64(out, static_cast<std::uint64_t>(value.size()));
    out.insert(out.end(), value.begin(), value.end());
}

Token lineToken(const ldw::LineEntity& line) {
    ldw::Point2d a = line.start;
    ldw::Point2d b = line.end;
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

Token circleToken(const ldw::CircleEntity& circle) {
    Token token;
    token.bytes.push_back(2);
    appendDouble(token.bytes, circle.center.x);
    appendDouble(token.bytes, circle.center.y);
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

} // namespace

GeometryFingerprint fingerprint(const ldw::Document& document) {
    GeometryFingerprint result;
    std::vector<Token> tokens;
    tokens.reserve(document.entities.size());

    for (const ldw::Entity& entity : document.entities) {
        if (const auto* line = std::get_if<ldw::LineEntity>(&entity.data)) {
            ++result.lineCount;
            includePoint(result.bounds, line->start.x, line->start.y);
            includePoint(result.bounds, line->end.x, line->end.y);
            tokens.push_back(lineToken(*line));
            continue;
        }

        if (const auto* circle = std::get_if<ldw::CircleEntity>(&entity.data)) {
            ++result.circleCount;
            includePoint(result.bounds, circle->center.x - circle->radius, circle->center.y - circle->radius);
            includePoint(result.bounds, circle->center.x + circle->radius, circle->center.y + circle->radius);
            tokens.push_back(circleToken(*circle));
            continue;
        }

        if (const auto* text = std::get_if<ldw::TextEntity>(&entity.data)) {
            ++result.textCount;
            // Text is intentionally excluded from bounds until its placement fields
            // are verified against controlled BAZIS fixtures.
            tokens.push_back(textToken(*text));
            continue;
        }

        ++result.unknownCount;
    }

    std::sort(tokens.begin(), tokens.end());

    std::uint64_t hash = kFnvOffset;
    hashU64(hash, static_cast<std::uint64_t>(tokens.size()));
    for (const Token& token : tokens) {
        hashU64(hash, static_cast<std::uint64_t>(token.bytes.size()));
        for (std::uint8_t byte : token.bytes) {
            hashByte(hash, byte);
        }
    }
    result.exactHash = hash;

    return result;
}

} // namespace basidraft::geometry
