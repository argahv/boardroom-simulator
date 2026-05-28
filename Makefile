.PHONY: help install backend frontend worker-sim worker-postmortem workers dev db-generate

BACKEND_DIR := backend
FRONTEND_DIR := frontend
PYTHON := python3
VENV := $(BACKEND_DIR)/.venv
PIP := $(VENV)/bin/pip
UVICORN := PYTHONPATH=$(BACKEND_DIR) $(VENV)/bin/uvicorn
RQ_SIM := PYTHONPATH=$(BACKEND_DIR) $(VENV)/bin/python -m app.workers.simulation_worker
RQ_POST := PYTHONPATH=$(BACKEND_DIR) $(VENV)/bin/python -m app.workers.postmortem_worker

help:
	@echo ""
	@echo "  make install          Install all backend + frontend dependencies"
	@echo "  make backend          Run FastAPI backend (port 8000)"
	@echo "  make frontend         Run Next.js frontend (port 3000)"
	@echo "  make worker-sim       Run simulation RQ worker"
	@echo "  make worker-postmortem  Run postmortem RQ worker"
	@echo "  make workers          Run both workers in parallel"
	@echo "  make db-generate      Regenerate Prisma client and apply patches"
	@echo "  make dev              Run backend + frontend + both workers"
	@echo ""

install:
	@echo "→ Installing backend dependencies..."
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --quiet -r $(BACKEND_DIR)/requirements.txt
	@echo "→ Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && npm install --silent
	@echo "✓ Done"

db-generate:  # Regenerate Prisma client and apply patches
	cd backend && npm run generate

backend:
	@echo "→ Starting backend on :8000"
	$(UVICORN) app.main:app --reload --port 8000

frontend:
	@echo "→ Starting frontend on :3000"
	cd $(FRONTEND_DIR) && npm run dev

worker-sim:
	@echo "→ Starting simulation worker"
	$(RQ_SIM)

worker-postmortem:
	@echo "→ Starting postmortem worker"
	$(RQ_POST)

workers:
	@echo "→ Starting both workers (Ctrl-C to stop all)"
	$(RQ_SIM) & $(RQ_POST) & wait

dev:
	@echo "→ Starting full stack (backend + frontend + workers)"
	@echo "   Press Ctrl-C to stop all processes"
	$(UVICORN) app.main:app --reload --port 8000 & \
	cd $(FRONTEND_DIR) && npm run dev & \
	$(RQ_SIM) & \
	$(RQ_POST) & \
	wait
