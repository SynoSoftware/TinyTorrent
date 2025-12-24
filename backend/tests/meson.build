tt_test_common_sources = [
  '../src/rpc/Dispatcher.cpp',
  '../src/rpc/UiPreferences.cpp',
  '../src/rpc/Serializer.cpp',
  '../src/rpc/FsHooks.cpp',
  '../src/engine/Core.cpp',
  '../src/engine/AlertRouter.cpp',
  '../src/engine/AutomationAgent.cpp',
  '../src/engine/BlocklistService.cpp',
  '../src/engine/ResumeDataService.cpp',
  '../src/engine/BlocklistManager.cpp',  
  '../src/engine/ConfigurationService.cpp',
  '../src/engine/AsyncTaskService.cpp',
  '../src/engine/SnapshotBuilder.cpp',
  '../src/engine/SettingsManager.cpp',
  '../src/engine/HistoryAgent.cpp',
  '../src/engine/PersistenceManager.cpp',
  '../src/engine/SessionService.cpp',
  '../src/engine/StateService.cpp',
  '../src/engine/TorrentManager.cpp',
  '../src/utils/FS.cpp',
  '../src/utils/Log.cpp',
  '../src/utils/OutboundRoute.cpp',
  '../src/utils/StateStore.cpp',
  '../src/utils/Shutdown.cpp',
  '../src/vendor/libtorrent/partfile_extension.cpp',
  '../src/vendor/mongoose.c',
  '../src/vendor/tt_packed_fs_data.cpp',
  '../src/vendor/tt_packed_fs.c',
  '../src/engine/SchedulerService.cpp',

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

rpc_filesystem_test_exe = executable('rpc-filesystem-test',
  tt_test_common_sources + ['main_test.cpp', 'RpcFilesystemTest.cpp', '../src/rpc/Server.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)

serializer_test_exe = executable('serializer-test',
  tt_test_common_sources + ['main_test.cpp', 'SerializerTest.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)

memory_leak_test_exe = executable('memory-leak-test',
  tt_test_common_sources + ['main_test.cpp', 'MemoryLeakTest.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)

configuration_test_exe = executable('configuration-test',
  tt_test_common_sources + ['main_test.cpp', 'ConfigurationTest.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)

test('rpc-filesystem-test', rpc_filesystem_test_exe)
test('serializer-test', serializer_test_exe)
test('memory-leak-test', memory_leak_test_exe)
test('configuration-test', configuration_test_exe)

ui_serving_test_exe = executable('ui-serving-test',
  tt_test_common_sources + ['main_test.cpp', 'UiServingTest.cpp'],
  dependencies: [tt_common_dep, doctest_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args,
)

test(
  'ui-serving-test',
  ui_serving_test_exe,
  timeout: 10
)
