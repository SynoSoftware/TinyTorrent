project('tinytorrent-win-listview', 'c',
  version : '0.1.0',
  default_options : ['c_std=c17', 'warning_level=0'])

if host_machine.system() == 'windows'
  add_project_arguments(
    '/DUNICODE',
    '/D_UNICODE',
    '/DWIN32_LEAN_AND_MEAN',
    '/D_WIN32_WINNT=0x0A00',
    '/DWINVER=0x0A00',
    language : 'c'
  )
endif

tt_c_args = ['/utf-8']
tt_link_args = ['Comctl32.lib', 'Dwmapi.lib']

if get_option('buildtype') != 'debug'
  tt_c_args += ['/GL', '/Gy', '/Gw']
  tt_link_args += ['/LTCG', '/OPT:REF', '/OPT:ICF']
endif

executable('tt-listview',
  'src/main.c',
  c_args : tt_c_args,
  link_args : tt_link_args,
  win_subsystem : 'windows')
