"""Session-scoped PG fixture for pytest.

Checks Postgres is running via docker compose, pushes Prisma schema,
sets env vars, and provides a db_setup fixture for test modules.
"""

import json
import os
import subprocess
import sys

import pytest
import pytest_asyncio


def pytest_sessionstart(session) -> None:
    """Verify PG is running, push schema, configure env for test session."""
    tests_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(tests_dir, "..")
    root_dir = os.path.join(tests_dir, "..", "..")

    # ── 1. Check Postgres container is running ──────────────────────────────
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            os.path.join(root_dir, "docker-compose.yml"),
            "ps",
            "postgres",
            "--format",
            "json",
        ],
        capture_output=True,
        text=True,
        cwd=tests_dir,
    )

    pg_running = False
    if result.returncode == 0 and result.stdout.strip():
        try:
            data = json.loads(result.stdout)
            if isinstance(data, list):
                pg_running = any(
                    c.get("State") == "running" for c in data
                )
            elif isinstance(data, dict):
                pg_running = data.get("State") == "running"
        except json.JSONDecodeError:
            pg_running = False

    if not pg_running:
        print(
            "ERROR: Postgres is not running.\n"
            "Run `docker compose up postgres -d` from project root",
            file=sys.stderr,
        )
        sys.exit(1)

    # ── 2. Push latest Prisma schema to Postgres ────────────────────────────
    subprocess.run(
        ["npx", "prisma", "db", "push", "--skip-generate"],
        cwd=backend_dir,
        check=True,
    )

    # ── 3. Set environment variables for the test session ───────────────────
    os.environ["DATABASE_TYPE"] = "prisma"
    os.environ["DATABASE_URL"] = (
        "postgresql://boardroom:boardroom@localhost:5432/boardroom"
    )


@pytest_asyncio.fixture(scope="function")
async def db_setup() -> None:
    """Initialize database before each test, tear down after.

    Test modules use this via ``@pytest.mark.usefixtures("db_setup")``.
    Function-scoped to keep Prisma client on the same event loop as tests.
    """
    from app.database import initialize_database, close_database

    await initialize_database()
    yield
    await close_database()
