project('tinytorrent-daemon', ['cpp', 'c'], version : '0.1.0',
  default_options : ['cpp_std=c++20'])

if host_machine.system() == 'windows'
  add_project_arguments(
    '/D_WIN32_WINNT=0x0A00',
    '/DWINVER=0x0A00',
    language: ['cpp', 'c']
  )
endif


tt_enable_logging = get_option('tt_enable_logging')
tt_enable_tests = get_option('tt_enable_tests')
build_type = get_option('buildtype')
is_minsize = build_type == 'minsize'

tt_version = meson.project_version()
tt_defines = [
  'TT_BUILD_VERSION="' + tt_version + '"',
]
if is_minsize
  tt_defines += 'TT_BUILD_MINIMAL=1'
else
  tt_defines += 'TT_BUILD_DEBUG=1'
endif

if tt_enable_logging
  tt_defines += 'TT_ENABLE_LOGGING=1'
endif

tt_cpp_args = ['/EHsc', '/DMG_ENABLE_PACKED_FS=1']
tt_c_args = ['/DMG_ENABLE_PACKED_FS=1']
tt_link_args = ['Ws2_32.lib']
if host_machine.system() == 'windows'
  tt_link_args += 'Advapi32.lib'
  tt_link_args += 'Winhttp.lib'
endif
if is_minsize
  tt_cpp_args += ['/Os', '/GL', '/MT']
  tt_c_args += ['/Os', '/GL', '/MT']
  tt_link_args += ['/LTCG', '/MAP:tt-engine.map', '/MAPINFO:EXPORTS']
endif

if build_type == 'debug'
  add_project_arguments(
    '/fsanitize=address',
    '/Zi',
    '/Oy-',
    language: 'cpp'
  )
  add_project_link_arguments(
    '/INCREMENTAL:NO',
    '/DEBUG',
    language: 'cpp'
  )
endif

tt_define_args = []
foreach def : tt_defines
  tt_define_args += '/D' + def
endforeach

tt_cpp_args += tt_define_args
tt_c_args += tt_define_args

tt_includes = include_directories('src', 'src/vendor')

fs = import('fs')
tt_has_packed_fs_bin = fs.exists('src/vendor/tt_packed_fs.bin')
if tt_has_packed_fs_bin
  tt_cpp_args += '-DTT_PACKED_FS_HAS_INC=1'
endif

tt_packed_fs_res = []
if host_machine.system() == 'windows' and tt_has_packed_fs_bin
  rc_prog = find_program('rc', required: true)
  tt_packed_fs_res = [
    custom_target(
      'tt_packed_fs_res',
      input: 'src/vendor/tt_packed_fs.rc',
      output: 'tt_packed_fs.res',
      command: [rc_prog, '/nologo', '/fo', '@OUTPUT@', '@INPUT@'],
      depend_files: ['src/vendor/tt_packed_fs.bin']
    )
  ]
endif


tt_deps = [
  dependency(  'LibtorrentRasterbar',  method: 'cmake',  modules: ['LibtorrentRasterbar::torrent-rasterbar'],  cmake_args: ['-DCMAKE_POLICY_DEFAULT_CMP0091=NEW']),
  dependency('yyjson', method: 'cmake', modules: ['yyjson::yyjson']),
  dependency('unofficial-sqlite3', method: 'cmake', modules: ['unofficial::sqlite3::sqlite3']),
]

tt_common_dep = declare_dependency(
  include_directories: tt_includes,
  dependencies: tt_deps,
  link_args: tt_link_args,
)

tt_base_sources = [
  'src/main.cpp',
  'src/entry_console.cpp',
  'src/engine/Core.cpp',
  'src/engine/AutomationAgent.cpp',
  'src/engine/AlertRouter.cpp',
  'src/engine/AsyncTaskService.cpp',   
  'src/engine/BlocklistService.cpp',
  'src/engine/BlocklistManager.cpp',  
  'src/engine/ConfigurationService.cpp',
  'src/engine/HistoryAgent.cpp',
  'src/engine/SchedulerService.cpp',
  'src/engine/PersistenceManager.cpp',
  'src/engine/SessionService.cpp',
  'src/engine/StateService.cpp',
  'src/engine/ResumeDataService.cpp',
  'src/engine/SnapshotBuilder.cpp',
  'src/engine/SettingsManager.cpp',
  'src/engine/TorrentManager.cpp',
  'src/rpc/Server.cpp',
  'src/rpc/Dispatcher.cpp',
  'src/rpc/Serializer.cpp',
  'src/rpc/FsHooks.cpp',
  'src/utils/FS.cpp',
  'src/utils/StateStore.cpp',
  'src/utils/Shutdown.cpp',
  'src/vendor/mongoose.c',
  'src/vendor/tt_packed_fs_data.cpp',
]

if fs.exists('src/vendor/tt_packed_fs.c')
  tt_base_sources += 'src/vendor/tt_packed_fs.c'
endif

tt_sources = tt_base_sources + tt_packed_fs_res


executable('tt-engine', tt_sources,
  dependencies: [tt_common_dep],
  cpp_args: tt_cpp_args,
  c_args: tt_c_args)

if host_machine.system() == 'windows'
  tt_gui_sources = []
  foreach src : tt_base_sources
    if src != 'src/entry_console.cpp'
      tt_gui_sources += src
    endif
  endforeach
  tt_gui_sources += ['src/tray/entry_winmain.cpp']
  tt_gui_sources += tt_packed_fs_res

  executable('TinyTorrent', tt_gui_sources,
    dependencies: [tt_common_dep],
    cpp_args: tt_cpp_args,
    c_args: tt_c_args,
    win_subsystem: 'windows')
endif

if tt_enable_tests
  subdir('tests')
endif
