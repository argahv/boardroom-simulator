from typing import Optional

from .base import DatabaseBackend
from .prisma import PrismaBackend

_db_instance: Optional[DatabaseBackend] = None

__all__ = ["get_database", "initialize_database", "close_database"]


def get_database() -> DatabaseBackend:
    global _db_instance

    if _db_instance is not None:
        return _db_instance

    _db_instance = PrismaBackend()
    return _db_instance


async def initialize_database() -> None:
    db = get_database()
    await db.initialize()


async def close_database() -> None:
    global _db_instance

    if _db_instance is not None:
        await _db_instance.close()
        _db_instance = None
