if(NOT TT_ENABLE_TESTS)
  return()
endif()

set(RPC_TEST_COMMON_SOURCES
  ${SRC_DIR}/rpc/Dispatcher.cpp
  ${SRC_DIR}/rpc/Serializer.cpp
  ${SRC_DIR}/engine/Core.cpp
  ${SRC_DIR}/utils/FS.cpp
  ${SRC_DIR}/vendor/mongoose.c
)

set(RPC_TEST_COMPILE_DEFINITIONS
  TT_BUILD_VERSION="${PROJECT_VERSION}"
  $<$<CONFIG:MinSizeRel>:TT_BUILD_MINIMAL=1>
  $<$<NOT:$<CONFIG:MinSizeRel>>:TT_BUILD_DEBUG=1>
  $<$<BOOL:${TT_ENABLE_LOGGING}>:TT_ENABLE_LOGGING=1>
)

add_executable(dispatcher-test
  DispatcherTest.cpp
  ${RPC_TEST_COMMON_SOURCES}
)

target_include_directories(dispatcher-test PRIVATE ${SRC_DIR})

target_compile_definitions(dispatcher-test PRIVATE ${RPC_TEST_COMPILE_DEFINITIONS})

target_compile_features(dispatcher-test PRIVATE cxx_std_20)

target_link_libraries(dispatcher-test PRIVATE
  LibtorrentRasterbar::torrent-rasterbar
  yyjson::yyjson
  unofficial::sqlite3::sqlite3
)

add_executable(rpc-endpoint-test
  RpcEndpointTest.cpp
  ${RPC_TEST_COMMON_SOURCES}
  ${SRC_DIR}/rpc/Server.cpp
)

target_include_directories(rpc-endpoint-test PRIVATE ${SRC_DIR})

target_compile_definitions(rpc-endpoint-test PRIVATE ${RPC_TEST_COMPILE_DEFINITIONS})

target_compile_features(rpc-endpoint-test PRIVATE cxx_std_20)

target_link_libraries(rpc-endpoint-test PRIVATE
  LibtorrentRasterbar::torrent-rasterbar
  yyjson::yyjson
  unofficial::sqlite3::sqlite3
)
