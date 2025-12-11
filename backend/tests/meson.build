tt_test_common_sources = [
  '../src/rpc/Dispatcher.cpp',
  '../src/rpc/Serializer.cpp',
  '../src/engine/Core.cpp',
  '../src/utils/FS.cpp',
  '../src/vendor/mongoose.c',
]

executable('dispatcher-test', tt_test_common_sources + ['DispatcherTest.cpp'],
  dependencies: [tt_common_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args)

executable('rpc-endpoint-test',
  tt_test_common_sources + ['RpcEndpointTest.cpp', '../src/rpc/Server.cpp'],
  dependencies: [tt_common_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)
