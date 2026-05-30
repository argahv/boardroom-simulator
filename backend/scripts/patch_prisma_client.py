"""Post-generation script: patches prisma fields to include Base64 class.

Run after `prisma generate` — ensures `from prisma.fields import Base64` works.
"""
import os
import sys
import importlib.util

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_VENV_DIR = os.path.abspath(os.path.join(_SCRIPT_DIR, "..", ".venv"))


def _resolve_python_version() -> str:
    lib_dir = os.path.join(_VENV_DIR, "lib")
    if not os.path.isdir(lib_dir):
        print(f"File not found: {lib_dir}")
        sys.exit(1)
    entries = sorted(os.listdir(lib_dir))
    py_dirs = [e for e in entries if e.startswith("python3")]
    if not py_dirs:
        print(f"No python3.x dir found in {lib_dir}: {entries}")
        sys.exit(1)
    return py_dirs[-1]


_PRISMA_DIR = os.path.abspath(
    os.path.join(_VENV_DIR, "lib", _resolve_python_version(), "site-packages", "prisma")
)
FIELDS_PATH = os.path.join(_PRISMA_DIR, "fields.py")
_SOURCE_PATH = os.path.join(_PRISMA_DIR, "_fields.py")

BASE64_CLASS = """class Base64:
    data: str
    def __init__(self, data: str) -> None:
        self.data = data
    def __str__(self) -> str:
        return self.data
"""


def _import_works() -> bool:
    """Try importing Base64 from prisma.fields directly."""
    try:
        spec = importlib.util.find_spec("prisma.fields")
        if spec is None:
            return False
        # can't easily import without triggering side effects from the venv,
        # so check the source text instead
        src = _SOURCE_PATH if os.path.isfile(_SOURCE_PATH) else FIELDS_PATH
        with open(src) as f:
            return "class Base64:" in f.read()
    except Exception:
        return False


def _patch_source(path: str) -> int:
    """Patch Base64 into the __all__ tuple and insert the class."""
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if "class Base64:" in content:
        print(f"Base64 already present in {path}")
        return 0

    lines = content.splitlines(keepends=True)

    all_line_idx = None
    all_end_idx = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("__all__"):
            all_line_idx = i
        if all_line_idx is not None and stripped.endswith(")"):
            all_end_idx = i
            break

    if all_line_idx is None or all_end_idx is None:
        print(f"Could not find __all__ tuple in {path}")
        return 1

    all_end_line = lines[all_end_idx]
    paren_pos = all_end_line.rfind(")")
    if paren_pos == -1:
        print(f"Malformed __all__ tuple in {path}")
        return 1

    lines[all_end_idx] = (
        all_end_line[:paren_pos] + ', "Base64"' + all_end_line[paren_pos:]
    )

    insert_pos = all_end_idx + 1
    lines.insert(insert_pos, "\n")
    lines.insert(insert_pos + 1, BASE64_CLASS)

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    print(f"Patched Base64 into {path}")
    return 0


def main() -> int:
    if not os.path.isfile(FIELDS_PATH):
        print(f"File not found: {FIELDS_PATH}")
        return 1

    if _import_works():
        print("Base64 already available in prisma.fields")
        return 0

    # fields.py is a re-export stub (from ._fields import *);
    # patch _fields.py first, then fields.py if needed.
    if os.path.isfile(_SOURCE_PATH):
        rc = _patch_source(_SOURCE_PATH)
        if rc != 0:
            return rc

    return _patch_source(FIELDS_PATH)


if __name__ == "__main__":
    sys.exit(main())
