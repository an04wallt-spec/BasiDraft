#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <variant>
#include <vector>

namespace basidraft::ldw {

struct Point2d {
    double x = 0.0;
    double y = 0.0;
};

struct LineEntity {
    Point2d start;
    Point2d end;
};

struct CircleEntity {
    Point2d center;
    double radius = 0.0;
};

struct TextEntity {
    std::string textUtf8;
    std::string fontUtf8;
    std::vector<std::uint8_t> fixedPayload;
};

struct UnknownEntity {
    std::uint16_t type = 0;
    std::uint32_t declaredSize = 0;
    std::vector<std::uint8_t> remainingBytes;
};

using EntityData = std::variant<LineEntity, CircleEntity, TextEntity, UnknownEntity>;

struct Entity {
    std::uint16_t ldwType = 0;
    std::uint32_t declaredSize = 0;
    std::size_t fileOffset = 0;
    EntityData data;
};

struct Document {
    std::size_t entityStreamOffset = 0;
    std::vector<Entity> entities;
    std::vector<std::string> warnings;
};

class Reader {
public:
    static constexpr std::uint16_t kLineType = 1;
    static constexpr std::uint16_t kCircleType = 2;
    static constexpr std::uint16_t kTextType = 25;

    Document readFile(const std::filesystem::path& path) const;
    Document parse(const std::vector<std::uint8_t>& bytes) const;

private:
    static std::size_t findEntityStream(const std::vector<std::uint8_t>& bytes);
    static std::uint16_t readU16(const std::vector<std::uint8_t>& bytes, std::size_t offset);
    static std::uint32_t readU32(const std::vector<std::uint8_t>& bytes, std::size_t offset);
    static double readF64(const std::vector<std::uint8_t>& bytes, std::size_t offset);
};

} // namespace basidraft::ldw
