cmake_minimum_required(VERSION 3.16)

project(basidraft_core VERSION 0.1 LANGUAGES CXX)

add_library(basidraft_ldw STATIC
    ldw/LdwReader.cpp
    ldw/LdwReader.h
    geometry/GeometryFingerprint.cpp
    geometry/GeometryFingerprint.h
)

target_compile_features(basidraft_ldw PUBLIC cxx_std_17)

target_include_directories(basidraft_ldw PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
)

set_target_properties(basidraft_ldw PROPERTIES
    POSITION_INDEPENDENT_CODE ON
    FOLDER "BasiDraft"
)
