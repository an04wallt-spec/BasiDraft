#pragma once

#include <cstddef>
#include <cstdint>

#include "ldw/LdwReader.h"

namespace basidraft::geometry {

struct Bounds2d {
    bool valid = false;
    double minX = 0.0;
    double minY = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;

    double width() const { return valid ? maxX - minX : 0.0; }
    double height() const { return valid ? maxY - minY : 0.0; }
};

struct GeometryFingerprint {
    Bounds2d bounds;
    std::size_t lineCount = 0;
    std::size_t circleCount = 0;
    std::size_t textCount = 0;
    std::size_t unknownCount = 0;

    // Exact source identity: includes absolute geometry coordinates and the
    // currently decoded text payload. Useful to detect byte-level / geometry
    // changes in an imported view.
    std::uint64_t exactHash = 0;

    // Shape identity: geometry only (currently lines + circles), translated so
    // the lower-left geometry bound is at (0, 0). This intentionally survives
    // moving the same view around a sheet while preserving its geometry.
    std::uint64_t shapeHash = 0;
};

GeometryFingerprint fingerprint(const ldw::Document& document);

} // namespace basidraft::geometry
