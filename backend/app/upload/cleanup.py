"""File cleanup utilities for simulation document uploads."""

import asyncio
import logging
import os

from app.models import SimulationDocument
from app.upload.utils import delete_file

logger = logging.getLogger("boardroom.upload.cleanup")


async def cleanup_simulation_files(
    db,
    upload_dir: str,
    simulation_id: str,
) -> int:
    """Delete all files + DB records for a simulation.

    Uses ``db.get_documents_by_simulation`` to list documents,
    removes each file from disk via ``app.upload.utils.delete_file``,
    then calls ``db.delete_documents_by_simulation`` to purge DB records.

    Returns the number of files deleted from disk.
    """
    docs = await db.get_documents_by_simulation(simulation_id)
    if not docs:
        return 0

    tasks = []
    for doc in docs:
        filepath = getattr(doc, "filepath", None) or doc.get("filepath")
        if filepath and os.path.exists(filepath):
            tasks.append(delete_file(filepath))
    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        delete_count = sum(1 for r in results if r is None)
    else:
        delete_count = 0

    await db.delete_documents_by_simulation(simulation_id)

    logger.info(
        "CLEANUP_SIM simulation_id=%s files_deleted=%d",
        simulation_id,
        delete_count,
    )
    return delete_count


async def cleanup_orphaned_pending_files(
    documents: list[SimulationDocument],
) -> int:
    """Delete files from disk for a list of documents.

    The caller is responsible for querying the pending/orphaned records
    and passing them in.  This function only removes the corresponding
    files from disk — DB record cleanup must be handled by the caller
    (there is no single-document delete on the abstract backend).

    Returns the number of files successfully removed.
    """
    if not documents:
        return 0

    tasks = []
    for doc in documents:
        filepath = getattr(doc, "filepath", None) or doc.get("filepath")
        if filepath and os.path.exists(filepath):
            tasks.append(delete_file(filepath))
    if not tasks:
        return 0

    results = await asyncio.gather(*tasks, return_exceptions=True)
    cleaned = sum(1 for r in results if r is None)
    errors = [r for r in results if isinstance(r, Exception)]

    logger.info(
        "CLEANUP_ORPHANED cleaned=%d errors=%d total=%d",
        cleaned,
        len(errors),
        len(documents),
    )
    if errors:
        logger.warning("CLEANUP_ORPHANED_ERR details=%s", errors[:5])

    return cleaned
