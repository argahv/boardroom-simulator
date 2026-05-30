#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
BACKEND_ENV_EXAMPLE="$ROOT_DIR/backend/.env.example"
FRONTEND_ENV="$ROOT_DIR/frontend/.env.local"
FRONTEND_ENV_EXAMPLE="$ROOT_DIR/frontend/.env.example"

echo "╔════════════════════════════════════════════╗"
echo "║  Boardroom Simulator — Setup              ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# ── Step 1: Docker services ──────────────────────────────────────────────
echo "━━━ Step 1/5: Starting Docker services ───"

cd "$ROOT_DIR"

# Pull images first (silently) so up doesn't get stuck pulling
echo "  → Pulling images..."
docker compose pull postgres neo4j redis --quiet 2>/dev/null || true

# Start each infra service individually to avoid build-output noise
echo "  → Starting PostgreSQL..."
docker compose up -d --wait postgres 2>/dev/null || {
  docker compose up -d postgres 2>/dev/null || true
}

echo "  → Starting Neo4j..."
docker compose up -d neo4j 2>/dev/null || {
  # If neo4j:5 image is missing, try with -community suffix
  docker compose pull neo4j --quiet 2>/dev/null && docker compose up -d neo4j 2>/dev/null || {
    echo "  ⚠ Neo4j start skipped — run 'docker compose up -d neo4j' manually"
  }
}

echo "  → Starting Redis..."
docker compose up -d --wait redis 2>/dev/null || {
  docker compose up -d redis 2>/dev/null || true
}

echo "  ✓ All services started or attempted"
echo ""

# ── Step 2: Wait for PostgreSQL ──────────────────────────────────────────
echo "━━━ Step 2/5: Waiting for PostgreSQL ───"
PG_READY=false
for i in $(seq 1 30); do
  if pg_isready -h localhost -U boardroom -d boardroom >/dev/null 2>&1; then
    echo "  ✓ PostgreSQL ready (attempt $i)"
    PG_READY=true
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ⚠ PostgreSQL not ready after 30s — run 'docker compose logs postgres' to debug."
  fi
  sleep 1
done
echo ""

# ── Step 3: Backend .env ─────────────────────────────────────────────────
echo "━━━ Step 3/5: Backend environment ───"
if [ ! -f "$BACKEND_ENV" ]; then
  cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV"
  echo "  → Created backend/.env from .env.example"
else
  echo "  → backend/.env exists — merging new keys..."
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    key_name="${key%%=*}"
    [ -z "${val:-}" ] && continue
    if grep -q "^${key_name}=" "$BACKEND_ENV" 2>/dev/null; then
      echo "    • $key_name — already set, keeping existing value"
    else
      echo "$key_name=$val" >> "$BACKEND_ENV"
      echo "    • $key_name — added from template"
    fi
  done < "$BACKEND_ENV_EXAMPLE"
fi
echo ""

# ── Step 4: Frontend .env.local ──────────────────────────────────────────
echo "━━━ Step 4/5: Frontend environment ───"
if [ ! -f "$FRONTEND_ENV" ]; then
  if [ -f "$FRONTEND_ENV_EXAMPLE" ]; then
    cp "$FRONTEND_ENV_EXAMPLE" "$FRONTEND_ENV"
    echo "  → Created frontend/.env.local from .env.example"
  else
    echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > "$FRONTEND_ENV"
    echo "  → Created frontend/.env.local with defaults"
  fi
else
  echo "  → frontend/.env.local exists — merging new keys..."
  if [ -f "$FRONTEND_ENV_EXAMPLE" ]; then
    while IFS='=' read -r key val; do
      [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
      key_name="${key%%=*}"
      [ -z "${val:-}" ] && continue
      if grep -q "^${key_name}=" "$FRONTEND_ENV" 2>/dev/null; then
        echo "    • $key_name — already set, keeping existing value"
      else
        echo "$key_name=$val" >> "$FRONTEND_ENV"
        echo "    • $key_name — added from template"
      fi
    done < "$FRONTEND_ENV_EXAMPLE"
  fi
fi
echo ""

# ── Step 5: Prisma DB push (only if PG is ready) ─────────────────────────
echo "━━━ Step 5/5: Database setup ───"
if [ "$PG_READY" = true ]; then
  cd "$ROOT_DIR/backend"
  DATABASE_URL=postgresql://boardroom:boardroom@localhost:5432/boardroom npx prisma db push --skip-generate 2>/dev/null && \
    echo "  ✓ Database schema applied" || \
    echo "  ⚠ Schema push failed — run 'make db-generate' after PG is up"
  cd "$ROOT_DIR"
else
  echo "  ⚠ Skipped (postgres not ready)"
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────
echo "╔════════════════════════════════════════════╗"
echo "║  Setup Complete                           ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "  Docker services:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
echo ""
echo "  Environment files:"
echo "    - backend/.env"
echo "    - frontend/.env.local"
echo ""
echo "  ── Remaining manual steps ──"
echo ""
echo "  1. Install dependencies:           make install"
echo "  2. Generate Prisma client:         make db-generate"
echo "  3. Add your OpenRouter API key to  backend/.env:"
echo "       OPENROUTER_API_KEY=sk-or-..."
echo ""
echo "  4. Optionally add Tavily API key:  backend/.env"
echo "       TAVILY_API_KEY=..."
echo ""
echo "  5. Start the backend:              make backend"
echo "  6. Start the frontend:             make frontend"
echo "  7. Start workers (optional):       make workers"
echo ""
echo "  Or run everything at once:         make dev"
echo ""
