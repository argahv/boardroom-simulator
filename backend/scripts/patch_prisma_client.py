"""Post-generation script: patches prisma fields.py to include Base64 class.

Run after `prisma generate` — prisma-client-py v0.15.0 generates code
referencing `fields.Base64` but doesn't ship the class, which is lost
every time the file is overwritten.
"""
import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FIELDS_PATH = os.path.abspath(
    os.path.join(
        _SCRIPT_DIR, "..", ".venv", "lib", "python3.13", "site-packages", "prisma", "fields.py"
    )
)

BASE64_CLASS = """class Base64:
    data: str
    def __init__(self, data: str) -> None:
        self.data = data
    def __str__(self) -> str:
        return self.data
"""


def main() -> int:
    if not os.path.isfile(FIELDS_PATH):
        print(f"❌ File not found: {FIELDS_PATH}")
        return 1

    with open(FIELDS_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    if "class Base64:" in content:
        print(f"✓ Base64 already present in {FIELDS_PATH}")
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
        print("❌ Could not find __all__ tuple in fields.py")
        return 1

    all_end_line = lines[all_end_idx]
    paren_pos = all_end_line.rfind(")")
    if paren_pos == -1:
        print("❌ Malformed __all__ tuple")
        return 1

    lines[all_end_idx] = (
        all_end_line[:paren_pos] + ', "Base64"' + all_end_line[paren_pos:]
    )

    insert_pos = all_end_idx + 1
    lines.insert(insert_pos, "\n")
    lines.insert(insert_pos + 1, BASE64_CLASS)

    with open(FIELDS_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)

    print(f"✓ Patched Base64 into {FIELDS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
