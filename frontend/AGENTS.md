# Frontend — Boardroom Simulator

Next.js 16 (--turbo) + React 19 + Tailwind CSS 4.3.

## STRUCTURE

```
frontend/
├── app/               # App Router pages
│   ├── layout.tsx     # Root layout (4 Google fonts)
│   ├── page.tsx       # Redirects to /simulate (the home)
│   ├── globals.css    # Tailwind v4 + custom theme
│   ├── simulate/      # Simulations list, setup, war room, postmortem
│   ├── personas/      # Persona library, editor, detail
│   ├── frameworks/    # Scenario templates ("Templates" in the nav)
│   └── analytics/     # Cross-simulation analytics
├── components/        # Shared UI (AppShell = the single top navigation)
│   └── war-room/      # War-room layouts and panels
└── lib/               # API client, utils
```

## CONVENTIONS

- Strict TS (`allowJs: false`), `target: ES2017`, `moduleResolution: bundler`
- Styling: Tailwind CSS v4 with CSS custom properties
- Fonts: Inter (sans), Cormorant Garamond (display), Newsreader (body), JetBrains Mono (code)
- Lint: `eslint .` with `next/core-web-vitals` + `next/typescript`
- No `.editorconfig`/`.prettierrc`/`biome.json` (formatting risk)

## KEY PATTERNS

| Concern | Approach |
|---------|----------|
| Routing | Next.js App Router with `[id]` dynamic routes |
| Data fetching | Direct fetch to FastAPI :8000 (no React Query) |
| UI state | React state + URL params (no global state lib) |
| Forms | Server actions for simulation creation |

## TODO

- `.editorconfig`/`.prettierrc` missing → formatting drift
- No React Query or SWR for data fetching — raw fetch calls
- No end-to-end type sharing with backend (manual sync)
