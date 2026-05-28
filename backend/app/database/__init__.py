import logging
import os
from typing import Optional

from .base import DatabaseBackend
from .sqlite import SQLiteBackend
from .postgres import PostgresBackend
from .prisma import PrismaBackend, get_agent_memories_by_id

logger = logging.getLogger("boardroom.db")

_db_instance: Optional[DatabaseBackend] = None

__all__ = ["get_database", "initialize_database", "close_database", "get_agent_memories_by_id"]


def get_database() -> DatabaseBackend:
    global _db_instance
    
    if _db_instance is not None:
        return _db_instance
    
    db_type = os.getenv("DATABASE_TYPE", "sqlite").lower()
    
    if db_type == "prisma":
        _db_instance = PrismaBackend()
    elif db_type == "postgres" or db_type == "postgresql":
        logger.warning("DEPRECATED: PostgresBackend will be removed in a future release — use DATABASE_TYPE=prisma instead")
        _db_instance = PostgresBackend(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            user=os.getenv("POSTGRES_USER", "postgres"),
            password=os.getenv("POSTGRES_PASSWORD", "postgres"),
            database=os.getenv("POSTGRES_DATABASE", "boardroom")
        )
    else:
        logger.warning("DEPRECATED: SQLiteBackend will be removed in a future release — use DATABASE_TYPE=prisma instead")
        db_path = os.getenv("SQLITE_PATH", "./data/boardroom.db")
        _db_instance = SQLiteBackend(db_path=db_path)
    
    return _db_instance


async def initialize_database() -> None:
    db = get_database()
    await db.initialize()


async def close_database() -> None:
    global _db_instance
    
    if _db_instance is not None:
        await _db_instance.close()
        _db_instance = None
