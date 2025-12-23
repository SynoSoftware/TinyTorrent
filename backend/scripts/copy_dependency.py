import argparse
import os
import shutil
from pathlib import Path

def collect_dlls(roots):
    seen = set()
    files = []
    for root in roots:
        if not root:
            continue
        root_path = Path(root)
        if not root_path.is_dir():
            continue
        for path in root_path.rglob("*.dll"):
            if path.is_file():
                files.append(path)
    return files


def main():
    parser = argparse.ArgumentParser(
        description="Copy all DLL dependencies from provided roots to dest."
    )
    parser.add_argument("dest_dir")
    parser.add_argument("stamp_file")
    parser.add_argument("roots", nargs="+")
    args = parser.parse_args()

    dest = Path(args.dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest.resolve()

    dlls = collect_dlls(args.roots)
    for dll in dlls:
        try:
            dll_resolved = dll.resolve()
        except OSError:
            dll_resolved = dll
        if dest_resolved in dll_resolved.parents:
            continue
        target = dest / dll.name
        shutil.copy2(dll, target)

    Path(args.stamp_file).write_text("copied\n")


if __name__ == "__main__":
    main()
