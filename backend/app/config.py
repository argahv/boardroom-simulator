import os

import os

from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
).rstrip("/")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")
OPENROUTER_EMBEDDING_MODEL = os.getenv(
    "OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small"
).strip()
OPENROUTER_HTTP_REFERRER = os.getenv("OPENROUTER_HTTP_REFERRER", "").strip()
OPENROUTER_APP_TITLE = os.getenv("OPENROUTER_APP_TITLE", "Boardroom Simulator").strip()

CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
]

MAX_TURNS = int(os.getenv("MAX_TURNS", "20"))

# Reliability controls
TURN_TIMEOUT_SECONDS = float(os.getenv("TURN_TIMEOUT_SECONDS", "45"))
# The "should I speak now?" score runs for every agent in every 3s bid window, so it
# needs a fast model. Empty means OPENROUTER_MODEL; on timeout the bid is deterministic.
STRATEGY_MODEL = os.getenv("STRATEGY_MODEL", "").strip()
STRATEGY_SCORE_TIMEOUT = float(os.getenv("STRATEGY_SCORE_TIMEOUT", "2.5"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "700"))
MIN_OUTPUT_TOKENS = int(os.getenv("MIN_OUTPUT_TOKENS", "180"))
SIMULATION_BUDGET_TOKENS = int(os.getenv("SIMULATION_BUDGET_TOKENS", "120000"))
ENABLE_SOFT_FALLBACK = os.getenv("ENABLE_SOFT_FALLBACK", "true").lower() in ("1", "true", "yes")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0").strip()
RQ_QUEUE_SIMULATION = os.getenv("RQ_QUEUE_SIMULATION", "simulation").strip()
RQ_QUEUE_POSTMORTEM = os.getenv("RQ_QUEUE_POSTMORTEM", "postmortem").strip()
RQ_JOB_TIMEOUT_SECONDS = int(os.getenv("RQ_JOB_TIMEOUT_SECONDS", "300"))

# Upload config
UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./data/uploads")
MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
ALLOWED_CONTENT_TYPES: list[str] = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
]

# Persona growth system
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./data/chroma")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1536"))

# ── Evaluation ────────────────────────────────
# Where finished runs are written as replayable JSON recordings ("" disables).
RECORDINGS_DIR = os.getenv("RECORDINGS_DIR", "./data/recordings").strip()
# LLM-as-judge model. Should differ from OPENROUTER_MODEL so the judge does not grade itself.
EVAL_JUDGE_MODEL = os.getenv("EVAL_JUDGE_MODEL", "openai/gpt-4.1").strip()
