cmake_minimum_required(VERSION 3.25)
project(tinytorrent-daemon VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

if(NOT CMAKE_CONFIGURATION_TYPES)
  if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "Choose the type of build." FORCE)
  endif()
endif()

option(TT_ENABLE_LOGGING "Enable verbose logging for the daemon." ON)
option(TT_ENABLE_TESTS "Build dispatcher unit tests" ON)
if(CMAKE_BUILD_TYPE STREQUAL "MinSizeRel")
  set(TT_ENABLE_TESTS OFF CACHE BOOL "Build dispatcher unit tests" FORCE)
endif()

set(SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src")

set(TT_SOURCES
  "${SRC_DIR}/main.cpp"
  "${SRC_DIR}/engine/Core.cpp"
  "${SRC_DIR}/rpc/Server.cpp"
  "${SRC_DIR}/rpc/Dispatcher.cpp"
  "${SRC_DIR}/rpc/Serializer.cpp"
  "${SRC_DIR}/utils/FS.cpp"
  "${SRC_DIR}/vendor/mongoose.c"
)

add_executable(tt-engine ${TT_SOURCES})

target_include_directories(tt-engine PRIVATE
  "${SRC_DIR}"
)

target_compile_definitions(tt-engine PRIVATE
  TT_BUILD_VERSION="${PROJECT_VERSION}"
  $<$<CONFIG:MinSizeRel>:TT_BUILD_MINIMAL=1>
  $<$<NOT:$<CONFIG:MinSizeRel>>:TT_BUILD_DEBUG=1>
  $<$<BOOL:${TT_ENABLE_LOGGING}>:TT_ENABLE_LOGGING=1>
)

if(MSVC)
  target_compile_options(tt-engine PRIVATE
    /EHsc
    $<$<CONFIG:MinSizeRel>:/Os>
    $<$<CONFIG:MinSizeRel>:/GL>
    $<$<CONFIG:MinSizeRel>:/MT>
  )
endif()

target_compile_features(tt-engine PRIVATE cxx_std_20)

 find_package(LibtorrentRasterbar CONFIG REQUIRED)
find_package(yyjson CONFIG REQUIRED)
find_package(unofficial-sqlite3 CONFIG REQUIRED)

target_link_libraries(tt-engine PRIVATE
  LibtorrentRasterbar::torrent-rasterbar
  yyjson::yyjson
  unofficial::sqlite3::sqlite3
)

target_link_options(tt-engine PRIVATE
  $<$<CONFIG:MinSizeRel>:/LTCG>
)

set_property(TARGET tt-engine PROPERTY VS_DEBUGGER_WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}")

if(TT_ENABLE_TESTS)
  add_subdirectory(tests)
endif()
