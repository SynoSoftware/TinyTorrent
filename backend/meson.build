project('tinytorrent-daemon', ['cpp', 'c'],
  version : '0.1.0',
  default_options : ['cpp_std=c++20'])

python_module = import('python')
python_prog = python_module.find_installation()
if not python_prog.found()
  error('Python interpreter required to read version metadata from version.json.')
endif

version_manifest_path = join_paths(meson.project_source_root(), '..', 'version.json')
version_script = '''
import json
import sys
from datetime import date
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text())
version = data.get("version")
if not version:
    raise SystemExit("version.json missing the version key")
today = date.today()
print(version)
print(today.strftime("%Y%m%d"))
print(today.isoformat())
'''

version_output = run_command(python_prog, '-c', version_script, version_manifest_path, check: true)
version_lines = version_output.stdout().strip().splitlines()
if version_lines.length() < 3
  error('Version script returned incomplete metadata.')
endif

tt_semantic_version = version_lines[0]
tt_build_date_compact = version_lines[1]
tt_build_date_iso = version_lines[2]

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
is_minsize = build_type == 'release'

tt_vcpkg_triplet_option = get_option('tt_vcpkg_triplet')
tt_vcpkg_triplet = tt_vcpkg_triplet_option
if tt_vcpkg_triplet == 'auto'
  # Prefer environment-driven triplet selection (vcpkg/CI), otherwise fall back
  # to a sane default for local builds.
  triplet_env_script = '''
import os
print(os.environ.get("VCPKG_TARGET_TRIPLET") or os.environ.get("VCPKG_DEFAULT_TRIPLET") or "")
'''
  env_triplet = run_command(python_prog, '-c', triplet_env_script, check: true).stdout().strip()
  if env_triplet != ''
    tt_vcpkg_triplet = env_triplet
  else
    if build_type == 'debug'
      tt_vcpkg_triplet = 'x64-windows-asan'
    else
      tt_vcpkg_triplet = 'x64-windows'
    endif
  endif
endif

tt_version = tt_semantic_version
tt_display_version = tt_version
tt_v_parts = tt_version.split('.')
if tt_v_parts.length() == 3 and tt_v_parts[2] == '0'
  tt_display_version = tt_v_parts[0] + '.' + tt_v_parts[1]
endif

tt_defines = [
  'TT_BUILD_VERSION="' + tt_version + '"',
  'TT_DISPLAY_VERSION="' + tt_display_version + '"',
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

tt_engine_link_args = []
tt_tray_link_args = []
if is_minsize
  tt_cpp_args += ['/Os', '/GL', '/MT']
  tt_c_args += ['/Os', '/GL', '/MT']
  tt_link_args += ['/LTCG']
  tt_engine_link_args += ['/MAP:tt-engine.map', '/MAPINFO:EXPORTS']
  tt_tray_link_args += ['/MAP:TinyTorrent.map', '/MAPINFO:EXPORTS']
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

tt_version_components = tt_semantic_version.split('.')
tt_version_number_parts = []
foreach comp : tt_version_components
  clean = comp.split('-')[0]
  if clean == ''
    clean = '0'
  endif
  if '+' in clean
    clean = clean.split('+')[0]
  endif
  if clean == ''
    clean = '0'
  endif
  tt_version_number_parts += [clean]
endforeach
zeros_needed = 4 - tt_version_number_parts.length()
if zeros_needed > 0
  foreach idx : range(zeros_needed)
    tt_version_number_parts += ['0']
  endforeach
endif
tt_version_number_parts_normalized = []
foreach idx : range(4)
  tt_version_number_parts_normalized += [tt_version_number_parts[idx]]
endforeach

tt_file_version_segments = []
foreach comp : tt_version_components
  tt_file_version_segments += [comp]
endforeach
zeros_needed = 4 - tt_file_version_segments.length()
if zeros_needed > 0
  foreach idx : range(zeros_needed)
    tt_file_version_segments += ['0']
  endforeach
endif
tt_file_version_segments_normalized = []
foreach idx : range(4)
  tt_file_version_segments_normalized += [tt_file_version_segments[idx]]
endforeach
tt_file_version_string = '.'.join(tt_file_version_segments_normalized)

tt_version_major = tt_version_number_parts_normalized[0]
tt_version_minor = tt_version_number_parts_normalized[1]
tt_version_patch = tt_version_number_parts_normalized[2]
tt_version_build = tt_version_number_parts_normalized[3]
tt_version_short_string = tt_version_major + '.' + tt_version_minor
tt_version_fileversion_string = tt_version_short_string
tt_product_version_string = tt_version_fileversion_string + ' / ' + tt_build_date_iso


tt_version_configuration = configuration_data()
tt_version_configuration.set('TT_VERSION_MAJOR', tt_version_major)
tt_version_configuration.set('TT_VERSION_MINOR', tt_version_minor)
tt_version_configuration.set('TT_VERSION_PATCH', tt_version_patch)
tt_version_configuration.set('TT_VERSION_BUILD', tt_version_build)
tt_version_configuration.set('TT_VERSION_FILEVERSION_STRING', tt_version_fileversion_string)
tt_version_configuration.set('TT_PRODUCT_VERSION_STRING', tt_product_version_string)
tt_version_configuration.set('TT_BUILD_DATE', tt_build_date_iso)
tt_version_configuration.set('TT_BUILD_DATE_COMPACT', tt_build_date_compact)

tt_packed_fs_rc = configure_file(
  input: 'src/vendor/tinytorrent.rc.in',
  output: 'tt_packed_fs.rc',
  configuration: tt_version_configuration
)

fs = import('fs')
tt_has_packed_fs_bin = fs.exists('src/vendor/tt_packed_fs.bin')
if tt_has_packed_fs_bin
  tt_cpp_args += '-DTT_PACKED_FS_HAS_INC=1'
endif

tinytorrent_windows_resources = []
if host_machine.system() == 'windows' and tt_has_packed_fs_bin
  rc_prog = find_program('rc', required: true)
  rc_include_dirs = ['/I' + join_paths(meson.project_source_root(), 'src', 'vendor')]
  tinytorrent_windows_resources = [
      custom_target(
        'tinytorrent_windows_resources',
        input: tt_packed_fs_rc,
        output: 'tt_packed_fs.res',
        command: [rc_prog, '/nologo'] + rc_include_dirs + ['/fo', '@OUTPUT@', '@INPUT@'],
        depend_files: ['src/vendor/tt_packed_fs.bin']
      )
  ]
endif


tt_deps = [
  dependency(  'LibtorrentRasterbar',  method: 'cmake',  modules: ['LibtorrentRasterbar::torrent-rasterbar'],  cmake_args: ['-DCMAKE_POLICY_DEFAULT_CMP0091=NEW']),
  dependency('yyjson', method: 'cmake', modules: ['yyjson::yyjson'],
             static: true),
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
  'src/rpc/UiPreferences.cpp',
  'src/rpc/Dispatcher.cpp',
  'src/rpc/Serializer.cpp',
  'src/rpc/FsHooks.cpp',
  'src/application/installer/SystemInstallService.cpp',
  'src/services/SystemInstallService.cpp',
  'src/utils/FS.cpp',
  'src/utils/Log.cpp',
  'src/utils/OutboundRoute.cpp',
  'src/utils/StateStore.cpp',
  'src/utils/Shutdown.cpp',
  'src/vendor/libtorrent/partfile_extension.cpp',
  'src/vendor/mongoose.c',
  'src/vendor/tt_packed_fs_data.cpp',
]

if fs.exists('src/vendor/tt_packed_fs.c')
  tt_base_sources += 'src/vendor/tt_packed_fs.c'
endif

tt_sources = tt_base_sources + tinytorrent_windows_resources


tt_engine_exe = executable('tinytorrent-daemon', tt_sources,
  dependencies: [tt_common_dep],
  link_args: tt_engine_link_args,
  cpp_args: tt_cpp_args,
  c_args: tt_c_args)


set_variable('tt_engine_exe', tt_engine_exe)


if host_machine.system() == 'windows'
  tt_gui_sources = []
  foreach src : tt_base_sources
    if src != 'src/entry_console.cpp'
      tt_gui_sources += src
    endif
  endforeach
  tt_gui_sources += [
    'src/tray/entry_winmain.cpp',
    'src/tray/ole/DropTarget.cpp',
    'src/tray/input/WebViewInput.cpp',
    'src/tray/rpc/RpcClient.cpp',
  ]
  tt_gui_sources += tinytorrent_windows_resources

  tt_webview_dep = dependency(
    'unofficial-webview2',
    method: 'cmake',
    modules: ['unofficial::webview2::webview2'],
    static: true
  )

  executable('TinyTorrent', tt_gui_sources,
    dependencies: [tt_common_dep, tt_webview_dep],
    link_args: tt_tray_link_args,
    cpp_args: tt_cpp_args,
    c_args: tt_c_args,
    win_subsystem: 'windows')
endif

if host_machine.system() == 'windows'
  copy_dependency_script = files('scripts/copy_dependency.py')
  build_type_dir = 'debug'
  if build_type != 'debug'
    build_type_dir = 'release'
  endif
  dll_dest = join_paths(meson.current_build_dir(), build_type_dir)
  vcpkg_bin = join_paths(meson.project_source_root(), 'vcpkg_installed',
                         tt_vcpkg_triplet, 'bin')
  vcpkg_debug_bin = join_paths(meson.project_source_root(), 'vcpkg_installed',
                               tt_vcpkg_triplet, 'debug', 'bin')
  build_debug = join_paths(meson.project_source_root(), 'build', build_type_dir)
  buildstate_debug = join_paths(meson.project_source_root(), 'buildstate',
                                build_type_dir)

  copy_dlls = custom_target(
    'copy-vcpkg-dlls',
    input: copy_dependency_script,
    output: 'dlls.stamp',
    command: [
      python_prog,
      '@INPUT0@',
      dll_dest,
      '@OUTPUT0@',
      vcpkg_bin,
      vcpkg_debug_bin,
      build_debug,
      buildstate_debug
    ],
    build_by_default: true,
    build_always: true
  )
endif

if tt_enable_tests
  subdir('tests')
endif
