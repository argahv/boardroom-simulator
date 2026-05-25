"""File validation and storage utilities for simulation document uploads."""

import os
import re
import uuid
from pathlib import PurePosixPath

import aiofiles
from fastapi import UploadFile

from app import config

# ---------------------------------------------------------------------------
# MIME helpers
# ---------------------------------------------------------------------------

_EXT_TO_MIME: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}

_MIME_TO_EXT: dict[str, str] = {v: k for k, v in _EXT_TO_MIME.items()}

_MAGIC_CHECKS: dict[str, tuple[bytes, bool]] = {
    # (magic_bytes_prefix, exact_match)
    "application/pdf": (b"%PDF", False),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
        b"PK\x03\x04",
        False,
    ),
    "text/plain": (b"", True),  # heuristic — accept any text-like content
}


def get_mime_type_for_validation(filename: str) -> str:
    """Map a filename's extension to its expected MIME type.

    Returns empty string if the extension is not recognised.
    """
    _, ext = os.path.splitext(filename)
    return _EXT_TO_MIME.get(ext.lower(), "")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_file_type(
    filename: str,
    content_type: str,
    magic_bytes: bytes,
) -> bool:
    """Check that a file has an allowed extension, matching MIME, and
    valid magic bytes.

    Parameters
    ----------
    filename:
        Original upload filename (used for extension check).
    content_type:
        Content-Type header value sent by the client.
    magic_bytes:
        First few bytes of the file content read from disk.

    Returns ``True`` when all checks pass.
    """
    # 1. Extension is known
    expected_mime = get_mime_type_for_validation(filename)
    if not expected_mime:
        return False

    # 2. Content-Type matches the extension
    if content_type not in config.ALLOWED_CONTENT_TYPES:
        return False
    if content_type != expected_mime:
        return False

    # 3. Magic bytes match
    magic_spec = _MAGIC_CHECKS.get(expected_mime)
    if magic_spec is None:
        return False

    expected_prefix, exact = magic_spec
    if exact:
        return magic_bytes == expected_prefix
    return magic_bytes.startswith(expected_prefix)


def validate_file_size(size_bytes: int) -> bool:
    """Return ``True`` if *size_bytes* does not exceed the configured
    maximum upload size."""
    max_bytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    return 0 < size_bytes <= max_bytes


# ---------------------------------------------------------------------------
# Sanitisation
# ---------------------------------------------------------------------------

_FILENAME_BAD_CHARS_RE = re.compile(r"[\x00-\x1f\x7f\\/:*?\"<>|]")


def sanitize_filename(filename: str) -> str:
    """Strip path separators, control characters, and limit to 255 bytes.

    The returned name is safe for use as a single file component in any
    common filesystem.
    """
    # Remove path components so we only keep the final name.
    name = PurePosixPath(filename).name

    # Replace (or remove) control characters and common shell metacharacters.
    name = _FILENAME_BAD_CHARS_RE.sub("_", name)

    # Trim leading dots and spaces (avoid hidden files / trailing dot issues).
    name = name.lstrip(". ")

    if not name:
        name = "unnamed"

    # Enforce 255-byte limit on the UTF-8 encoded name.
    encoded = name.encode("utf-8")
    if len(encoded) > 255:
        # Truncate bytes, then decode back (surrogates may appear at boundary).
        name = encoded[:255].decode("utf-8", errors="ignore")

    return name


# ---------------------------------------------------------------------------
# Storage path generation
# ---------------------------------------------------------------------------


def generate_storage_path(
    upload_dir: str,
    simulation_id: str,
    original_filename: str,
) -> str:
    """Build a unique, collision-free storage path.

    Pattern: ``{upload_dir}/{simulation_id}/{uuid4()}-{sanitized_filename}``
    """
    safe_name = sanitize_filename(original_filename)
    unique_name = f"{uuid.uuid4().hex}-{safe_name}"
    return os.path.join(upload_dir, simulation_id, unique_name)


# ---------------------------------------------------------------------------
# File I/O
# ---------------------------------------------------------------------------


async def write_upload_file(file: UploadFile, storage_path: str) -> int:
    """Write an uploaded file to *storage_path* asynchronously.

    Returns the number of bytes written.  Intermediate directories are
    created automatically.
    """
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)

    total = 0
    async with aiofiles.open(storage_path, "wb") as f:
        while chunk := await file.read(64 * 1024):  # 64 KiB chunks
            total += len(chunk)
            await f.write(chunk)

    return total


async def delete_file(storage_path: str) -> None:
    """Remove *storage_path* if it exists.  No-op on missing file."""
    try:
        await aiofiles.os.remove(storage_path)
    except FileNotFoundError:
        pass
