tt_test_common_sources = [
  '../src/rpc/Dispatcher.cpp',
  '../src/rpc/Serializer.cpp',
  '../src/engine/Core.cpp',
  '../src/utils/FS.cpp',
  '../src/utils/StateStore.cpp',
  '../src/vendor/mongoose.c',
]

doctest_dep = dependency('doctest', method: 'cmake', modules: ['doctest::doctest'])

dispatcher_test_exe = executable('dispatcher-test', tt_test_common_sources + ['main_test.cpp', 'DispatcherTest.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args)

rpc_endpoint_test_exe = executable('rpc-endpoint-test',
  tt_test_common_sources + ['main_test.cpp', 'RpcEndpointTest.cpp', '../src/rpc/Server.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)

test('dispatcher-test', dispatcher_test_exe)
test('rpc-endpoint-test', rpc_endpoint_test_exe)
