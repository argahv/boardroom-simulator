"""Text extraction from uploaded documents (PDF, DOCX, TXT).

All heavy I/O is delegated to a thread-pool executor so callers
(who are typically running inside an async endpoint) do not block
the event loop.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger("boardroom.upload.extraction")


# ---------------------------------------------------------------------------
# Synchronous extractors  (called via ``run_in_executor``)
# ---------------------------------------------------------------------------


def extract_text_from_pdf(filepath: str) -> str:
    """Extract all text from a PDF via ``pypdf.PdfReader``.

    Returns ``""`` on password-protected or corrupted files instead of
    raising — the caller can decide whether that is fatal.
    """
    try:
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        reader = PdfReader(filepath)
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages)
    except PdfReadError:
        logger.warning("Password-protected or encrypted PDF: %s", filepath)
        return ""
    except Exception:
        logger.exception("Failed to extract text from PDF: %s", filepath)
        return ""


def extract_text_from_docx(filepath: str) -> str:
    """Extract paragraph text from a DOCX file via ``python-docx``."""
    try:
        from docx import Document

        doc = Document(filepath)
        paragraphs = [p.text for p in doc.paragraphs]
        return "\n".join(paragraphs)
    except Exception:
        logger.exception("Failed to extract text from DOCX: %s", filepath)
        return ""


def extract_text_from_txt(filepath: str) -> str:
    """Read a plain-text file.

    Tries UTF-8 first; falls back to Latin-1 on decoding errors.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as fh:
            return fh.read()
    except UnicodeDecodeError:
        logger.info("UTF-8 decode failed for %s, falling back to latin-1", filepath)
        try:
            with open(filepath, "r", encoding="latin-1") as fh:
                return fh.read()
        except Exception:
            logger.exception("Failed to read TXT (latin-1 fallback): %s", filepath)
            return ""
    except Exception:
        logger.exception("Failed to read TXT: %s", filepath)
        return ""


# ---------------------------------------------------------------------------
# Async dispatcher
# ---------------------------------------------------------------------------


async def extract_text(filepath: str, content_type: str) -> str:
    """Dispatch *filepath* to the correct extractor based on MIME type.

    Every extractor runs inside ``loop.run_in_executor`` so the async
    caller is never blocked by synchronous I/O.
    """
    loop = asyncio.get_event_loop()

    if content_type == "application/pdf":
        return await loop.run_in_executor(None, extract_text_from_pdf, filepath)
    if content_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ):
        return await loop.run_in_executor(None, extract_text_from_docx, filepath)
    if content_type == "text/plain":
        return await loop.run_in_executor(None, extract_text_from_txt, filepath)

    logger.warning("Unsupported content type for extraction: %s", content_type)
    return ""


# ---------------------------------------------------------------------------
# Token-aware truncation
# ---------------------------------------------------------------------------


def truncate_to_token_limit(text: str, max_tokens: int = 4000) -> str:
    """Truncate *text* so it stays within an approximate token budget.

    The approximation uses a simple word-count heuristic:
    ``1 token ≈ 0.75 words``.

    When truncation is needed the result is appended with ``...[truncated]``.
    """
    if max_tokens <= 0 or not text:
        return ""

    max_words = int(max_tokens * 0.75)
    words = text.split()

    if len(words) <= max_words:
        return text

    truncated = " ".join(words[:max_words])
    return f"{truncated}...[truncated]"
