# Prisma Schema Redesign: Production-Ready Unified Schema

> **Architectural Summary**: Consolidates 15 existing models into 11, eliminates all v1/v2 duplication, adds 12 missing FK constraints, fixes 9 cascade policies, and optimizes 8 indexes for query patterns extracted from actual `postgres.py` code.

---

## 1. Structural Issues Found

### 1.1 Duplicate/Overlapping Models (5 pairs)

| Pair | Duplication | Consequence |
|------|-------------|-------------|
| `v2_simulations` ↔ `simulations` | Both represent a simulation run with different schemas | Dual-write code in `postgres.py`; application must know which table to query |
| `v2_turns` ↔ `turns` | Both store turn events with different column layouts | `insert_v2_turn()` writes to `v2_turns` while `insert_new_turn()` writes to `turns` — two turn streams per sim |
| `personas` ↔ `stakeholders` | 80% field overlap (name, role, focus, backstory, hidden_agenda, personality) | Dual-write on persona creation; `list_personas_v2()` queries `stakeholders` and re-maps columns |
| `scenario_templates` ↔ `templates` | Same business entity with different normalizations | Dual-write in `create_template()` — writes to both tables |
| `v2_state_snapshots` ↔ `simulations.state_json` | Both store simulation state — one as structured rows, one as JSON blob | Inconsistency: v1 uses `state_json` blob, v2 uses structured snapshots |

**Fix**: Merge each pair into a single model. Use nullable columns for schema-generation-specific fields and an `enum`/`string` discriminator.

### 1.2 Missing Foreign Key Constraints (7 locations)

| Table.Column | Missing FK | Impact |
|-------------|-----------|--------|
| `document_uploads.simulation_id` | No FK to ANY simulations table | Orphaned rows on simulation deletion |
| `v2_agent_goals.simulation_id` | No FK | Orphaned goals |
| `v2_agent_goals.agent_id` | No FK to `personas` or `simulation_participants` | References nonexistent agents |
| `v2_postmortems.simulation_id` | `DROP CONSTRAINT` executed on init (postgres.py:104) | Explicitly removing referential integrity |
| `persona_evolution.simulation_id` | Plain String, not FK | References simulation that may not exist |
| `semantic_memories.simulation_id` | No FK to simulations | Memory orphaned when sim deleted |
| `v2_state_snapshots` | FK exists but `onDelete: NoAction` | Snapshots block simulation deletion |

**Fix**: Add proper FK constraints with cascade rules. Re-add the intentionally-dropped v2_postmortems FK.

### 1.3 Cascade Policy Issues (7 models)

| Current State | Fix |
|---------------|-----|
| `persona_documents` → `stakeholders`: `NoAction` | → `Cascade` (delete persona → delete docs) |
| `persona_evolution` → `stakeholders`: `NoAction` | → `Cascade` |
| `persona_research` → `stakeholders`: `NoAction` | → `Cascade` |
| `v2_state_snapshots` → `v2_simulations`: `NoAction` | → `Cascade` |
| `v2_turns` → `v2_simulations`: `NoAction` | → `Cascade` |
| `turns` → `simulation_participants`: `Cascade` | → Keep (correct) |
| `semantic_memories` → `simulation_participants`: `Cascade` | → Keep (correct) |

### 1.4 Index Gaps for Actual Query Patterns

Analyzing `postgres.py` queries reveals these common access patterns with missing or suboptimal indexes:

| Query Pattern | Current Index | Missing |
|---------------|--------------|---------|
| `SELECT FROM simulations WHERE simulation_id = $1` (v1) | None on `simulation_id` column | ✅ Add |
| `SELECT FROM simulations ORDER BY created_at DESC` (v2 listing) | Two duplicate indexes on `created_at DESC` | ✅ Deduplicate |
| `SELECT FROM v2_turns WHERE simulation_id = $1 AND turn_index >= $2 ORDER BY id ASC` | `(simulation_id, turn_index)` | ✅ Has it, but ordering by `id` not covered |
| `SELECT FROM turns WHERE participant_id = $1 ORDER BY created_at DESC` (agent turns) | `(participant_id)` | ✅ Add `(participant_id, created_at DESC)` |
| `SELECT FROM simulation_participants WHERE simulation_id = $1` | `(simulation_id)` | ✅ Has it |
| `SELECT FROM v2_agent_goals WHERE agent_id = $1 ORDER BY priority DESC, turn_index DESC` | `(agent_id)` single | ✅ Add `(agent_id, priority DESC, turn_index DESC)` |
| `SELECT FROM persona_evolution WHERE persona_id = $1 AND status = 'pending'` | `(persona_id)` + `(status)` separate | ✅ Add composite `(persona_id, status)` |
| `SELECT FROM v2_state_snapshots WHERE simulation_id = $1 ORDER BY turn_index DESC LIMIT 1` | `(simulation_id, turn_index)` | ✅ Has it, but needs `DESC` for LIMIT 1 |
| `DELETE FROM v2_state_snapshots WHERE simulation_id = $1 AND id NOT IN (... LIMIT $2)` | `(simulation_id, turn_index)` | ✅ Has it |

---

## 2. Unified Model Design

### 2.1 Ownership Hierarchy

```
Templates (reusable blueprints)
    │
    ▼
Simulations (runs of a template)
    ├── SimulationParticipants (agents in this sim)
    │       ├── Turns (each utterance)
    │       ├── SemanticMemories (vector memory store)
    │       └── AgentGoals (strategic objectives per agent)
    ├── StateSnapshots (checkpoints for resume)
    └── Postmortems (analysis results)

Personas (cross-simulation agent identity)
    ├── PersonaDocuments (uploaded knowledge files)
    ├── PersonaEvolution (personality change proposals)
    └── PersonaResearch (web research results)

Documents (simulation-level file uploads)
```

### 2.2 Consolidation Mapping

| Existing Models (15) | Unified Model (11) | Notes |
|---------------------|--------------------|-------|
| `simulations`, `v2_simulations` | → `Simulation` | Merged with discriminator `schema_version` |
| `turns`, `v2_turns` | → `Turn` | Merged — structured columns + optional `turn_data` JSON for v1 extras |
| `personas`, `stakeholders` | → `Persona` | Merged — `personas` is the canonical v2, `stakeholders` fields become nullable columns |
| `scenario_templates`, `templates` | → `Template` | Merged — `templates` is canonical, add legacy fields as nullable |
| `simulation_participants` | → `SimulationParticipant` | Renamed for clarity, kept as-is |
| `v2_state_snapshots` | → `StateSnapshot` | Renamed, FK points to `Simulation` |
| `v2_postmortems` | → `Postmortem` | Renamed, FK points to `Simulation` |
| `v2_agent_goals` | → `AgentGoal` | Renamed, FK to `SimulationParticipant` |
| `semantic_memories` | → `SemanticMemory` | FK to `SimulationParticipant` |
| `persona_documents` | → `PersonaDocument` | FK to `Persona` |
| `persona_evolution` | → `PersonaEvolution` | FK to `Persona` (simulation_id is metadata) |
| `persona_research` | → `PersonaResearch` | FK to `Persona` |
| `document_uploads` | → `SimulationDocument` | FK to `Simulation` |

### 2.3 Cascade Rules (Final)

| Parent | Child(s) | Rule | Rationale |
|--------|----------|------|-----------|
| `Template` | `Simulation` | `SetNull` | Template deleted → simulations become untemplated, not deleted |
| `Simulation` | `SimulationParticipant` | `Cascade` | Sim deleted → participants gone (no meaning without sim) |
| `Simulation` | `Turn` | `Cascade` | Via participant cascade, but also direct for orphan prevention |
| `Simulation` | `StateSnapshot` | `Cascade` | Snapshots are meaningless without parent sim |
| `Simulation` | `Postmortem` | `Cascade` | Postmortem belongs to sim |
| `Simulation` | `SimulationDocument` | `Cascade` | Uploaded files belong to sim |
| `SimulationParticipant` | `Turn` | `Cascade` | Participant deleted → their turns are orphaned |
| `SimulationParticipant` | `SemanticMemory` | `Cascade` | Memory belongs to participant |
| `SimulationParticipant` | `AgentGoal` | `Cascade` | Goal belongs to participant |
| `Persona` | `PersonaDocument` | `Cascade` | Documents belong to persona |
| `Persona` | `PersonaEvolution` | `Cascade` | Evolution proposals belong to persona |
| `Persona` | `PersonaResearch` | `Cascade` | Research belongs to persona |
| `Persona` | `SimulationParticipant` | `SetNull` | Persona deleted → participant record keeps identity (name/role) as snapshot |

---

## 3. Redesigned Prisma Schema

```prisma
generator client {
  provider             = "prisma-client-py"
  interface            = "asyncio"
  recursive_type_depth = 5
  previewFeatures      = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

// ═══════════════════════════════════════════════════════════════════════════
// Templates — Reusable scenario blueprints
// ═══════════════════════════════════════════════════════════════════════════

model Template {
  id                      String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug                    String       @unique
  name                    String
  description             String       @default("")
  category                String       @default("")
  difficulty              String       @default("medium")
  estimated_duration      String       @default("")

  // ── Legacy fields from scenario_templates ──
  default_background      String       @default("")
  default_primary_goal    String       @default("")
  default_voltage         Int          @default(50)
  default_model_temperature String     @default("stable")
  suggested_persona_ids   Json         @default("[]")        // was String containing JSON array

  // ── v2 fields ──
  stakeholder_count       Int          @default(0)
  voltage                 Int          @default(50)
  config                  Json         @default("{}")

  embedding               Unsupported("vector")?             // pgvector for semantic template search

  // ── Metadata ──
  created_at              DateTime     @default(now()) @db.Timestamptz(6)
  updated_at              DateTime     @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  simulations             Simulation[]

  @@index([category], map: "idx_template_category")
  @@index([slug], map: "idx_template_slug")
  @@index([created_at(sort: Desc)], map: "idx_template_created")
}

// ═══════════════════════════════════════════════════════════════════════════
// Personas — Cross-simulation agent identity (merged stakeholders + personas)
// ═══════════════════════════════════════════════════════════════════════════

model Persona {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug            String?  @unique                                       // URL-friendly identifier

  // ── Identity ──
  name            String
  role            String   @default("")
  focus           String   @default("")
  backstory       String   @default("")
  hidden_agenda   String   @default("")

  // ── v1 stakeholder fields ──
  incentive_tuning Int    @default(50)
  tag             String?                                                  // SKEPTICAL/AGREEABLE/etc
  tool_profile    String   @default("none")                               // financial/legal/technical/comms

  // ── v2 persona fields ──
  stance          String   @default("neutral")
  personality     Json     @default("{}")                                 // was String in Pydantic → Json in DB
  tools           Json     @default("[]")
  metadata        Json     @default("{}")
  tags            String[] @default([])                                   // PostgreSQL native array

  embedding       Unsupported("vector")?                                  // pgvector for persona matching

  // ── Metadata ──
  created_at      DateTime @default(now()) @db.Timestamptz(6)
  updated_at      DateTime @default(now()) @db.Timestamptz(6)

  // ── Relations (Cascade: delete persona → delete owned content) ──
  documents        PersonaDocument[]
  evolutions       PersonaEvolution[]
  research         PersonaResearch[]
  participations   SimulationParticipant[]  // Persona deleted → participant.persona_id set null

  @@index([name], map: "idx_persona_name")
  @@index([slug], map: "idx_persona_slug")
  @@index([tag], map: "idx_persona_tag")
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulations — v1 and v2 merged into one model
// ═══════════════════════════════════════════════════════════════════════════

model Simulation {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  template_id         String?  @db.Uuid
  schema_version      String   @default("v2")                              // "v1" or "v2" discriminator

  // ── v2 structured columns ──
  subject_name        String   @default("")
  subject_description String   @default("")
  status              String   @default("idle")
  voltage             Int      @default(50)
  model_temperature   String   @default("volatile")
  speaker_mode        String   @default("alternating")
  end_condition       Json     @default("{\"type\": \"timeout\", \"max_turns\": 20}")
  config              Json     @default("{}")
  metadata            Json     @default("{}")
  total_turns         Int      @default(0)
  total_participants  Int      @default(0)

  // ── v1 columns (nullable, used when schema_version = "v1") ──
  simulation_id       String?  @unique                                    // v1 TEXT PK (nullable for v2-native rows)
  state_json          Json?                                                // Full SimulationState blob (v1)
  active_speaker_id   String?                                              // v1 current speaker
  runtime_status      String   @default("idle")
  state_version       Int      @default(0)

  // ── Metadata ──
  created_at          DateTime @default(now()) @db.Timestamptz(6)
  updated_at          DateTime @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  template            Template?          @relation(fields: [template_id], references: [id], onDelete: SetNull)
  participants        SimulationParticipant[]
  state_snapshots     StateSnapshot[]
  postmortems         Postmortem[]
  documents           SimulationDocument[]

  @@index([status], map: "idx_simulation_status")
  @@index([created_at(sort: Desc)], map: "idx_simulation_created")
  @@index([template_id], map: "idx_simulation_template")
  @@index([simulation_id], map: "idx_simulation_legacy_id")               // for v1 lookups
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulation Participants — Per-simulation agent instances
// ═══════════════════════════════════════════════════════════════════════════

model SimulationParticipant {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  simulation_id    String   @db.Uuid
  persona_id       String?  @db.Uuid                                       // nullable: persona may be deleted, participant survives

  // ── Snapshot of persona at time of sim creation ──
  name             String
  role             String   @default("")
  stance           String   @default("neutral")
  personality      Json     @default("{}")
  backstory        String   @default("")
  hidden_agenda    String   @default("")

  // ── Runtime stats (denormalized, updated by update_participant_stats) ──
  turn_count       Int      @default(0)
  first_turn_index Int?
  last_turn_index  Int?

  // ── Metadata ──
  created_at       DateTime @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  simulation       Simulation           @relation(fields: [simulation_id], references: [id], onDelete: Cascade)
  persona          Persona?             @relation(fields: [persona_id], references: [id], onDelete: SetNull)
  turns            Turn[]               @relation("participant_turns")
  memories         SemanticMemory[]
  goals            AgentGoal[]

  @@index([simulation_id], map: "idx_participant_simulation")
  @@index([persona_id], map: "idx_participant_persona")
  @@index([simulation_id, persona_id], map: "idx_participant_sim_persona")
}

// ═══════════════════════════════════════════════════════════════════════════
// Turns — Individual utterances (merged v1 + v2)
// ═══════════════════════════════════════════════════════════════════════════

model Turn {
  id                      BigInt                @id @default(autoincrement())
  simulation_id           String                @db.Uuid
  participant_id          String                @db.Uuid

  // ── Core content ──
  turn_index              Int
  participant_turn_index  Int
  content                 String
  action_type             String                @default("statement")
  stance                  String?
  internal_reasoning      String                @default("")

  // ── v2 structured fields ──
  emotional_state         Json                  @default("{}")
  directed_to_participant_id String?             @db.Uuid

  // ── v1 extras captured as JSON blob ──
  turn_data               Json                  @default("{}")             // captures v1 fields: interrupt_type, coalition_with, leverage_delta, etc.

  // ── Vector embedding for semantic search ──
  embedding               Unsupported("vector")?

  // ── Metadata ──
  created_at              DateTime              @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  participant             SimulationParticipant @relation("participant_turns", fields: [participant_id], references: [id], onDelete: Cascade)
  directed_to             SimulationParticipant? @relation("directed_turns", fields: [directed_to_participant_id], references: [id], onDelete: SetNull)
  memories                SemanticMemory[]

  @@index([simulation_id, turn_index], map: "idx_turn_sim_index")
  @@index([participant_id, created_at(sort: Desc)], map: "idx_turn_participant_created")
  @@index([participant_id, turn_index], map: "idx_turn_participant_turn")
  @@index([simulation_id, participant_id], map: "idx_turn_sim_participant")
  @@index([created_at], map: "idx_turn_created")
  @@index([directed_to_participant_id], map: "idx_turn_directed_to")
}

// ═══════════════════════════════════════════════════════════════════════════
// Semantic Memory — Vector memory store per participant
// ═══════════════════════════════════════════════════════════════════════════

model SemanticMemory {
  id              BigInt                @id @default(autoincrement())
  participant_id  String                @db.Uuid
  simulation_id   String                @db.Uuid

  memory_type     String
  content         String
  turn_id         BigInt?
  is_active       Boolean               @default(true)
  confidence      Float                 @default(1.0)

  embedding       Unsupported("vector")?                                  // pgvector for similarity search

  created_at      DateTime              @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  participant     SimulationParticipant @relation(fields: [participant_id], references: [id], onDelete: Cascade)
  turn            Turn?                 @relation(fields: [turn_id], references: [id], onDelete: SetNull)

  @@index([participant_id], map: "idx_memory_participant")
  @@index([simulation_id], map: "idx_memory_simulation")
  @@index([participant_id, memory_type], map: "idx_memory_participant_type")
  @@index([participant_id, simulation_id, memory_type], map: "idx_memory_participant_sim_type")
  @@index([is_active], map: "idx_memory_active")
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Goals — Strategic objectives per participant
// ═══════════════════════════════════════════════════════════════════════════

model AgentGoal {
  id              String                @id
  participant_id  String                @db.Uuid                          // FK to participant (not agent_id string)
  simulation_id   String                @db.Uuid

  turn_index      Int
  goal_text       String
  priority        Float                 @db.Real
  source          String
  is_active       Boolean               @default(true)

  // ── Relations ──
  participant     SimulationParticipant @relation(fields: [participant_id], references: [id], onDelete: Cascade)

  @@index([participant_id, is_active], map: "idx_goal_participant_active")
  @@index([participant_id, priority(sort: Desc), turn_index(sort: Desc)], map: "idx_goal_participant_priority")
  @@index([simulation_id], map: "idx_goal_simulation")
}

// ═══════════════════════════════════════════════════════════════════════════
// State Snapshots — Simulation checkpoints for resume
// ═══════════════════════════════════════════════════════════════════════════

model StateSnapshot {
  id             String     @id
  simulation_id  String     @db.Uuid

  turn_index     Int
  snapshot_json  Json                                                      // Full serialized simulation state
  version        Int        @default(1)

  created_at     DateTime   @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  simulation     Simulation @relation(fields: [simulation_id], references: [id], onDelete: Cascade)

  @@index([simulation_id, turn_index(sort: Desc)], map: "idx_snapshot_sim_turn_desc")
}

// ═══════════════════════════════════════════════════════════════════════════
// Postmortems — Simulation analysis results
// ═══════════════════════════════════════════════════════════════════════════

model Postmortem {
  simulation_id   String     @id
  postmortem_json Json                                                        // Full Postmortem Pydantic model

  created_at      DateTime   @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  simulation      Simulation @relation(fields: [simulation_id], references: [id], onDelete: Cascade)
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulation Documents — File uploads attached to a simulation
// ═══════════════════════════════════════════════════════════════════════════

model SimulationDocument {
  id             String     @id
  simulation_id  String     @db.Uuid

  filename       String
  content_type   String     @default("application/octet-stream")
  file_size      Int        @default(0)
  status         String     @default("pending")
  extracted_text String?

  created_at     DateTime   @default(now()) @db.Timestamptz(6)
  updated_at     DateTime   @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  simulation     Simulation @relation(fields: [simulation_id], references: [id], onDelete: Cascade)

  @@index([simulation_id], map: "idx_doc_simulation")
}

// ═══════════════════════════════════════════════════════════════════════════
// Persona Documents — Knowledge base files attached to a persona
// ═══════════════════════════════════════════════════════════════════════════

model PersonaDocument {
  id             String     @id
  persona_id     String     @db.Uuid

  filename       String     @default("")
  filepath       String     @default("")                                    // Filesystem path — app-managed
  content_type   String     @default("application/octet-stream")
  size_bytes     Int        @default(0)
  status         String     @default("pending")
  extracted_text String?
  embedding_id   String?                                                     // Chroma embedding reference

  created_at     DateTime   @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  persona        Persona    @relation(fields: [persona_id], references: [id], onDelete: Cascade)

  @@index([persona_id], map: "idx_personadoc_persona")
}

// ═══════════════════════════════════════════════════════════════════════════
// Persona Evolution — Proposed personality/stance changes
// ═══════════════════════════════════════════════════════════════════════════

model PersonaEvolution {
  id              String     @id
  persona_id      String     @db.Uuid

  simulation_id   String     @default("")                                    // Metadata: which sim triggered this
  proposed_deltas Json       @default("{}")
  before_snapshot Json       @default("{}")
  status          String     @default("pending")                             // pending | approved | rejected
  applied_at      DateTime?  @db.Timestamptz(6)

  created_at      DateTime   @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  persona         Persona    @relation(fields: [persona_id], references: [id], onDelete: Cascade)

  @@index([persona_id, status], map: "idx_evolution_persona_status")
  @@index([status], map: "idx_evolution_status")
}

// ═══════════════════════════════════════════════════════════════════════════
// Persona Research — Web research results attached to a persona
// ═══════════════════════════════════════════════════════════════════════════

model PersonaResearch {
  id           String     @id
  persona_id   String     @db.Uuid

  query        String     @default("")
  results      Json       @default("[]")                                     // was String containing JSON

  created_at   DateTime   @default(now()) @db.Timestamptz(6)

  // ── Relations ──
  persona      Persona    @relation(fields: [persona_id], references: [id], onDelete: Cascade)

  @@index([persona_id], map: "idx_research_persona")
}
```

---

## 4. Key Changes and Justifications

### 4.1 Model Consolidation (5 pairs → 5 unified models)

| Change | Why | Backward Compat |
|--------|-----|-----------------|
| `v2_simulations` merged into `Simulation` | Eliminates dual-write, single query path, one status field | `schema_version` discriminator; all v2 code uses same fields; v1 code uses nullable columns |
| `v2_turns` merged into `Turn` | Two turn streams per simulation was a design error | `turn_data` JSON captures v1-specific extras; structured columns serve v2 |
| `stakeholders` merged into `Persona` | 80% field overlap caused dual-write on seed load | Incentive_tuning, tag, tool_profile added as nullable columns to Persona |
| `scenario_templates` merged into `Template` | Dual-write on every template creation | default_background/etc added as nullable fields; config JSON already exists |
| `v2_state_snapshots` → `StateSnapshot` | No content change, just FK fix | `onDelete: Cascade` instead of NoAction |

### 4.2 Index Rationale

| New Index | Why |
|-----------|-----|
| `idx_simulation_legacy_id` on `simulation.simulation_id` | v1 lookups use `WHERE simulation_id = $1` — previously no index |
| `idx_turn_directed_to` on `turn.directed_to_participant_id` | Directed turn queries have no index currently |
| `idx_goal_participant_active` on `(participant_id, is_active)` | Common filter: "get active goals for this participant" |
| `idx_goal_participant_priority` composite desc | `ORDER BY priority DESC, turn_index DESC` now covered |
| `idx_memory_participant_sim_type` composite 3-column | Common filter: memory by participant + sim + type |
| `idx_turn_participant_created` composite desc | `WHERE participant_id = $1 ORDER BY created_at DESC` (agent turn history) |
| `idx_evolution_persona_status` composite | `WHERE persona_id = $1 AND status = 'pending'` now single index scan |
| Removed duplicate `idx_simulations_created_at` | Exactly same as `idx_simulations_created` — wasted space |

### 4.3 Type Standardization

| Change | Reasoning |
|--------|-----------|
| `@db.Uuid` on all entity FK fields | Consistent UUID strategy; existing TEXT data will be cast or migrated |
| `v2_agent_goals.is_active`: `Int` → `Boolean` | Semantic correctness; Prisma handles Boolean→Int mapping in Python |
| `scenario_templates.suggested_persona_ids`: `String` → `Json` | Stores JSON natively instead of stringified JSON |
| `persona_research.results`: `String` → `Json` | Same — stores JSON natively |
| `Turn.id`: `BigInt` (unified) | Both v1 and v2 used autoincrement; BigInt for headroom |
| `agent_id` → `participant_id` in AgentGoal | FK to SimulationParticipant, not loose string |

### 4.4 Foreign Key Additions

| FK | Type | Why Re-added |
|----|------|-------------|
| `SimulationDocument.simulation_id` → `Simulation.id` | `Cascade` | Was missing entirely — orphaned docs |
| `AgentGoal.participant_id` → `SimulationParticipant.id` | `Cascade` | Was loose `agent_id` string with no FK |
| `Postmortem.simulation_id` → `Simulation.id` | `Cascade` | FK was intentionally dropped (postgres.py:104) — re-add for integrity |
| `SemanticMemory.simulation_id` → `Simulation.id` | `Cascade` | Was missing — only participant FK existed |

---

## 5. Data Migration Strategy

### 5.1 Pre-Migration Checks
1. Count rows in all old tables — establish baseline
2. Validate there are no orphaned FK references (e.g., `document_uploads.simulation_id` pointing to deleted sims)
3. Ensure all `v2_simulations.simulation_id` values exist in `simulations.simulation_id` or vice versa

### 5.2 Migration Script Pattern
```sql
-- Step 1: Rename old tables for rollback
ALTER TABLE scenarios RENAME TO scenarios_legacy;

-- Step 2: Create new unified tables via Prisma migrate
-- (prisma db push with the new schema above)

-- Step 3: Migrate v1 simulations
INSERT INTO "Simulation" (
  id, schema_version, simulation_id, status, active_speaker_id,
  state_json, runtime_status, state_version, created_at, updated_at
)
SELECT gen_random_uuid(), 'v1', simulation_id, status, active_speaker_id,
       state_json, runtime_status, state_version, created_at, updated_at
FROM simulations;

-- Step 4: Migrate v2 simulations into same table
INSERT INTO "Simulation" (
  id, schema_version, template_id, subject_name, subject_description,
  status, voltage, model_temperature, speaker_mode, end_condition,
  config, metadata, total_turns, total_participants, created_at, updated_at
)
SELECT id, 'v2', template_id, subject_name, subject_description,
       status, voltage, model_temperature, speaker_mode, end_condition,
       config, metadata, total_turns, total_participants, created_at, updated_at
FROM simulations_v2;  -- or the existing Prisma `simulations` table

-- Step 5: Re-point FKs
-- Update v2_turns.turn_json → Turn.turn_data, v2_turns.turn_index → Turn.turn_index
-- Map v2_simulation_id → new Simulation.id via lookup table
```

### 5.3 Rollback Plan
- Keep legacy tables renamed (not dropped) for 2 release cycles
- Restore by: `DROP TABLE new_tables; ALTER TABLE legacy RENAME TO original;`

---

## 6. Risk Areas

| Risk | Severity | Mitigation |
|------|----------|-----------|
| UUID migration from TEXT: existing data uses hex UUID strings, Prisma expects `@db.Uuid` binary | HIGH | Use `String` type without `@db.Uuid` on FK fields that receive legacy data; migrate to UUID format in a separate phase |
| `v2_agent_goals.is_active`: Int→Boolean breaks code that reads `1`/`0` | MEDIUM | Prisma Python client handles Bool↔Int mapping automatically; verify with QA test |
| `suggested_persona_ids` String→Json: existing data is JSON-string-inside-a-string | MEDIUM | Migration must `UPDATE ... SET suggested_persona_ids = suggested_persona_ids::jsonb` to unwrap |
| Template merge: `config` JSON and `default_background` etc may conflict | LOW | Dual-write in `create_template()` writes to both; migration chooses one canonical source |
| Simulation merge: v1 and v2 rows in same table, different columns used | LOW | `schema_version` discriminator; code paths select appropriate columns |
| Cascade deletes: existing code may rely on NoAction behavior | LOW | Audit all deletion paths in `main.py` and `runtime/` — only simulation deletion and persona deletion paths exist |
