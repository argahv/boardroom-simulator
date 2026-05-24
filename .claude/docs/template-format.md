# Template Library Format — Research

## Current implementation

Templates live in `frontend/lib/templates.ts` as a TypeScript array of `SimulationTemplate` objects.
Each template is a `SimulationV2Config` wrapped with metadata (id, name, description, category, difficulty, etc.).

```typescript
type SimulationTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  estimated_duration: string;
  stakeholder_count: number;
  voltage: number;
  config: SimulationV2Config;  // Full config passed directly to the API
};
```

## Recommended storage strategies

### Option A: Client-side bundled JSON (current approach)
**Pros**: Zero infrastructure. Immediate. Works offline. Type-safe.
**Cons**: Templates baked into frontend bundle. Requires deploy to add/edit.
**Best for**: 5-20 curated templates that change infrequently.

### Option B: Markdown files with frontmatter
Store each template as a `.md` file with YAML frontmatter for metadata and a `config.json` block:

```markdown
---
id: series-b-fundraise
name: "Series B Fundraise"
category: Fundraising
difficulty: medium
voltage: 62
stakeholder_count: 5
estimated_duration: "5 min"
---

## Description
Founder pitches to a skeptical VC board. Tension over valuation...

## Config
```json
{ "subject": { "name": "Series B Fundraise", ... }, ... }
```
```

**Pros**: Human-readable. Git-friendly. Non-devs can edit. Could be loaded dynamically.
**Cons**: Need a parser. JSON-in-markdown is awkward to validate.
**Best for**: Community contributions, open-source distribution.

### Option C: JSON files in a `templates/` directory
Each template is a `.json` file with the full `SimulationTemplate` shape.

```
templates/
├── index.json              # catalog: id → filename mapping
├── series-b-fundraise.json
├── merger-negotiation.json
└── partnership-renewal.json
```

**Pros**: Clean. Language-agnostic. Easy to generate programmatically. Could be loaded from an API endpoint.
**Cons**: Still needs deploy. Less human-friendly than markdown.
**Best for**: Medium-scale template collections (20-100).

### Option D: API-backed template store
Backend serves templates from a database table. Frontend fetches via `GET /templates`.

```
GET /templates          → list of template metadata
GET /templates/{id}     → full SimulationTemplate with config
POST /templates         → (admin) create
PUT /templates/{id}     → (admin) update
```

**Pros**: Dynamic. Can be managed via UI. Versioning possible. Usage analytics.
**Cons**: Requires backend CRUD. More infrastructure. Templates unavailable during API downtime.
**Best for**: 100+ templates, user-generated templates, A/B testing templates.

## Recommendation

**Phase 1 (now)**: Keep client-side TypeScript (Option A). It works, zero infra, fast iteration.

**Phase 2 (next 3 months)**: Move to JSON files in a `templates/` directory (Option C) loaded at build time. This decouples templates from code while keeping them version-controlled.

**Phase 3 (future)**: Add API-backed template store (Option D) when user-generated templates or an admin UI is needed.

## Template structure rules

Each template must follow the `SimulationV2Config` shape that the backend expects:

```typescript
SimulationV2Config = {
  subject: Subject;                    // name, description, attributes, evidence
  stakeholders: StakeholderV2[];       // 3-6 personas with backstory, stance, personality
  action_space: ActionSpace;           // custom actions (optional)
  speaker_rules: SpeakerRules;         // how turns are ordered
  end_condition: EndCondition;         // turn limit, vote, or judge
  system_prompt_template: string;      // optional prompt override
  voltage: number;                     // 0-100 tension
  player_mode: boolean;                // human-interactive mode
  env_flags: EnvFlags;                 // hidden_motives, time_pressure, etc.
  model_temperature: string;           // "stable" or "volatile"
}
```

Validation rules:
- `stakeholders` must have 3-6 entries
- Each stakeholder must have `name`, `role`, `backstory`
- `voltage` must be 0-100
- `end_condition.max_normal_turns` should be 8-20
- Template `id` must be kebab-case unique

## Template creation checklist

- [ ] Subject name is specific and evocative
- [ ] Description sets the scene
- [ ] 3-6 stakeholders with distinct stances
- [ ] Each stakeholder has backstory (2-3 sentences)
- [ ] At least one champion and one detractor
- [ ] Evidence items are concrete (numbers, names, dates)
- [ ] Voltage matches the scenario
- [ ] Hidden motives for at least 2 stakeholders
- [ ] End condition makes sense for the scenario (timeout for debates, vote for decisions)
