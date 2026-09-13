cmake_minimum_required(VERSION 3.16)
project(basidraftldw VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(${QT_VER} REQUIRED COMPONENTS Core Widgets Gui)
qt_standard_project_setup()

if (CMAKE_BUILD_TYPE STREQUAL "Release")
    link_directories(${CMAKE_CURRENT_SOURCE_DIR}/../../../release)
else()
    link_directories(${CMAKE_CURRENT_SOURCE_DIR}/../../../debug)
endif()

add_library(basidraftldw SHARED
    RLdwImporter.cpp RLdwImporter.h
    RLdwImporterFactory.cpp RLdwImporterFactory.h
    RLdwPlugin.cpp RLdwPlugin.h
    ldw_global.h
)

target_include_directories(basidraftldw PRIVATE
    ../../../src/core
    ../../../src/core/math
    ../../../src/entity
    ../../../src/io/ldw
    ../../../src/basidraft
)

target_compile_definitions(basidraftldw PRIVATE
    BASIDRAFTLDW_LIBRARY
    QCAD_DLL
)

set_target_properties(basidraftldw PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../../../plugins
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../../../plugins
    ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../../../plugins
    FOLDER "BasiDraft"
)

target_link_libraries(basidraftldw PRIVATE
    Qt::Core
    Qt::Gui
    Qt::Widgets
    qcadcore
    qcadentity
    basidraft_ldw
)

add_executable(basidraft_ldw_integration_test
    tests/LdwImporterIntegrationTest.cpp
)

target_include_directories(basidraft_ldw_integration_test PRIVATE
    ../../../src/core
    ../../../src/core/math
    ../../../src/entity
    ../../../src/io/ldw
    ../../../src/basidraft
)

target_compile_definitions(basidraft_ldw_integration_test PRIVATE
    QCAD_DLL
)

target_link_libraries(basidraft_ldw_integration_test PRIVATE
    Qt::Core
    qcadcore
    qcadentity
    basidraftldw
)

set_target_properties(basidraft_ldw_integration_test PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/tests
    FOLDER "BasiDraft"
)
