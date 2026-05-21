# Vantage Boardroom Frontend

Next.js App Router UI for the Boardroom Simulator.

## Setup

```bash
pnpm install
pnpm dev
```

or:

```bash
npm install
npm run dev
```

The app expects the FastAPI backend at `NEXT_PUBLIC_API_URL`. If unset, it defaults to:

```bash
http://127.0.0.1:8000
```

To point at another backend:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 pnpm dev
```

## Routes

- `/` shows the Vantage shell with sidebar navigation and top tabs.
- `/simulate/new` opens the three-step simulation setup wizard.
- `/simulate/[id]` opens the war room, launch controls, transcript, telemetry widgets, and postmortem panel.
