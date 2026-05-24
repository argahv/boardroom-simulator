-- ============================================================================
-- Migration 001: Core Schema Redesign
-- ============================================================================

BEGIN;

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ===========================================================================
-- PART 1: CREATE ALL TABLES (in dependency order)
-- ===========================================================================

-- 1.1 Personas
CREATE TABLE IF NOT EXISTS personas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT '',
    focus       TEXT NOT NULL DEFAULT '',
    backstory   TEXT NOT NULL DEFAULT '',
    personality JSONB NOT NULL DEFAULT '{}',
    hidden_agenda TEXT NOT NULL DEFAULT '',
    tags        TEXT[] NOT NULL DEFAULT '{}',
    metadata    JSONB NOT NULL DEFAULT '{}',
    embedding   vector(1536),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 Templates
CREATE TABLE IF NOT EXISTS templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    category        TEXT NOT NULL DEFAULT '',
    difficulty      TEXT NOT NULL DEFAULT 'medium',
    estimated_duration TEXT NOT NULL DEFAULT '',
    stakeholder_count INT NOT NULL DEFAULT 0,
    voltage         INT NOT NULL DEFAULT 50 CHECK (voltage >= 0 AND voltage <= 100),
    config          JSONB NOT NULL DEFAULT '{}',
    embedding       vector(1536),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 Simulations (unified)
CREATE TABLE IF NOT EXISTS simulations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         UUID REFERENCES templates(id) ON DELETE SET NULL,
    subject_name        TEXT NOT NULL DEFAULT '',
    subject_description TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'running', 'paused', 'complete', 'failed')),
    voltage             INT NOT NULL DEFAULT 50 CHECK (voltage >= 0 AND voltage <= 100),
    model_temperature   TEXT NOT NULL DEFAULT 'volatile',
    speaker_mode        TEXT NOT NULL DEFAULT 'alternating',
    end_condition       JSONB NOT NULL DEFAULT '{"type": "timeout", "max_turns": 20}',
    config              JSONB NOT NULL DEFAULT '{}',
    metadata            JSONB NOT NULL DEFAULT '{}',
    total_turns         INT NOT NULL DEFAULT 0,
    total_participants  INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.4 Simulation Participants (junction)
CREATE TABLE IF NOT EXISTS simulation_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id   UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    persona_id      UUID REFERENCES personas(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT '',
    stance          TEXT NOT NULL DEFAULT 'neutral'
        CHECK (stance IN ('champion', 'detractor', 'neutral', 'moderator', 'wildcard')),
    personality     JSONB NOT NULL DEFAULT '{}',
    backstory       TEXT NOT NULL DEFAULT '',
    hidden_agenda   TEXT NOT NULL DEFAULT '',
    turn_count      INT NOT NULL DEFAULT 0,
    first_turn_index INT,
    last_turn_index  INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.5 Turns
CREATE TABLE IF NOT EXISTS turns (
    id                      BIGSERIAL PRIMARY KEY,
    simulation_id           UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    participant_id          UUID NOT NULL REFERENCES simulation_participants(id) ON DELETE CASCADE,
    turn_index              INT NOT NULL,
    participant_turn_index  INT NOT NULL,
    content                 TEXT NOT NULL,
    action_type             TEXT NOT NULL DEFAULT 'statement',
    stance                  TEXT,
    emotional_state         JSONB NOT NULL DEFAULT '{}',
    internal_reasoning      TEXT NOT NULL DEFAULT '',
    directed_to_participant_id UUID REFERENCES simulation_participants(id) ON DELETE SET NULL,
    turn_data               JSONB NOT NULL DEFAULT '{}',
    embedding               vector(1536),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.6 Semantic Memories
CREATE TABLE IF NOT EXISTS semantic_memories (
    id              BIGSERIAL PRIMARY KEY,
    participant_id  UUID NOT NULL REFERENCES simulation_participants(id) ON DELETE CASCADE,
    simulation_id   UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    memory_type     TEXT NOT NULL CHECK (memory_type IN ('position', 'concession', 'red_line', 'alliance', 'insight')),
    content         TEXT NOT NULL,
    turn_id         BIGINT REFERENCES turns(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    confidence      FLOAT NOT NULL DEFAULT 1.0,
    embedding       vector(1536),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- PART 2: INDEXES
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_personas_slug ON personas(slug);
CREATE INDEX IF NOT EXISTS idx_personas_name ON personas(name);

CREATE INDEX IF NOT EXISTS idx_templates_slug ON templates(slug);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);

CREATE INDEX IF NOT EXISTS idx_simulations_created_at ON simulations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);
CREATE INDEX IF NOT EXISTS idx_simulations_template_id ON simulations(template_id);
CREATE INDEX IF NOT EXISTS idx_simulations_subject_name ON simulations(subject_name);

CREATE INDEX IF NOT EXISTS idx_participants_simulation ON simulation_participants(simulation_id);
CREATE INDEX IF NOT EXISTS idx_participants_persona ON simulation_participants(persona_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_unique
    ON simulation_participants(simulation_id, persona_id) WHERE persona_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_turns_sim_participant ON turns(simulation_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_turns_sim_index ON turns(simulation_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_turns_participant ON turns(participant_id);
CREATE INDEX IF NOT EXISTS idx_turns_participant_turn_idx ON turns(participant_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_turns_created_at ON turns(created_at);

CREATE INDEX IF NOT EXISTS idx_semantic_memories_participant ON semantic_memories(participant_id);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_type ON semantic_memories(participant_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_semantic_memories_simulation ON semantic_memories(simulation_id);

-- ===========================================================================
-- PART 3: BACKFILL FROM EXISTING TABLES
-- ===========================================================================

-- 3.1 Personas from stakeholders
INSERT INTO personas (slug, name, role, focus, hidden_agenda, tags, metadata)
SELECT
    lower(regexp_replace(coalesce(name,''), '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
    name,
    role,
    focus,
    hidden_agenda,
    CASE WHEN tag IS NOT NULL AND tag != '' THEN ARRAY[tag] ELSE '{}' END AS tags,
    jsonb_build_object(
        'incentive_tuning', incentive_tuning,
        'tool_profile', tool_profile,
        'source', 'stakeholders',
        'legacy_id', id
    ) AS metadata
FROM stakeholders
ON CONFLICT (slug) DO NOTHING;

-- 3.2 Templates from scenario_templates
INSERT INTO templates (slug, name, description, voltage, config)
SELECT
    id AS slug,
    name,
    description,
    default_voltage,
    jsonb_build_object(
        'background', default_background,
        'primary_goal', default_primary_goal,
        'model_temperature', default_model_temperature,
        'suggested_persona_ids', suggested_persona_ids::jsonb
    ) AS config
FROM scenario_templates
ON CONFLICT (slug) DO NOTHING;

-- 3.3 Simulations from v2_simulations
DO $$
DECLARE
    vs RECORD;
    sim_uuid UUID;
BEGIN
    FOR vs IN SELECT * FROM v2_simulations LOOP
        BEGIN
            sim_uuid := vs.simulation_id::uuid;
            INSERT INTO simulations (id, subject_name, subject_description, status, voltage, config, total_turns, created_at, updated_at)
            VALUES (
                sim_uuid,
                vs.config_json->'subject'->>'name',
                COALESCE(vs.config_json->'subject'->>'description', ''),
                vs.status,
                (COALESCE(vs.config_json->>'voltage', '50'))::int,
                vs.config_json,
                (SELECT COUNT(*) FROM v2_turns vt WHERE vt.simulation_id = vs.simulation_id),
                vs.created_at,
                vs.updated_at
            )
            ON CONFLICT (id) DO UPDATE SET
                total_turns = EXCLUDED.total_turns,
                status = EXCLUDED.status;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to migrate simulation %: %', vs.simulation_id, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3.4 Participants from v2_simulations config_json
DO $$
DECLARE
    vs RECORD;
    st JSONB;
    sim_uuid UUID;
    persona_id UUID;
BEGIN
    FOR vs IN SELECT * FROM v2_simulations LOOP
        BEGIN
            sim_uuid := vs.simulation_id::uuid;
            FOR st IN SELECT * FROM jsonb_array_elements(vs.config_json->'stakeholders') LOOP
                SELECT p.id INTO persona_id FROM personas p WHERE p.name = st->>'name' LIMIT 1;
                INSERT INTO simulation_participants (simulation_id, persona_id, name, role, stance, personality, backstory, hidden_agenda)
                VALUES (
                    sim_uuid,
                    persona_id,
                    COALESCE(st->>'name', ''),
                    COALESCE(st->>'role', ''),
                    COALESCE(st->>'stance', 'neutral'),
                    COALESCE(st->'personality', '{}'),
                    COALESCE(st->>'backstory', ''),
                    COALESCE(st->>'hidden_agenda', '')
                )
                ON CONFLICT DO NOTHING;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to migrate participants for %: %', vs.simulation_id, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3.5 Update participant stats from v2_turns
UPDATE simulation_participants sp
SET
    turn_count = COALESCE(tc.cnt, 0),
    first_turn_index = tc.min_t,
    last_turn_index = tc.max_t
FROM (
    SELECT
        sp2.id AS pid,
        COUNT(*) AS cnt,
        MIN(vt.turn_index) AS min_t,
        MAX(vt.turn_index) AS max_t
    FROM simulation_participants sp2
    JOIN v2_turns vt ON vt.turn_json->>'speaker' = sp2.name
    WHERE vt.simulation_id::uuid = sp2.simulation_id
    GROUP BY sp2.id
) tc
WHERE sp.id = tc.pid;

-- 3.6 Turns from v2_turns
DO $$
DECLARE
    vt RECORD;
    sim_uuid UUID;
    part_id UUID;
    pti INT;
BEGIN
    FOR vt IN SELECT * FROM v2_turns ORDER BY id LOOP
        BEGIN
            sim_uuid := vt.simulation_id::uuid;
            SELECT sp.id INTO part_id FROM simulation_participants sp
            WHERE sp.simulation_id = sim_uuid AND sp.name = vt.turn_json->>'speaker'
            LIMIT 1;

            IF part_id IS NOT NULL THEN
                SELECT COUNT(*) INTO pti FROM turns t
                WHERE t.participant_id = part_id;

                INSERT INTO turns (simulation_id, participant_id, turn_index, participant_turn_index,
                                   content, action_type, stance, internal_reasoning, turn_data, created_at)
                VALUES (
                    sim_uuid,
                    part_id,
                    vt.turn_index,
                    pti,
                    COALESCE(vt.turn_json->>'content', ''),
                    COALESCE(vt.turn_json->>'action_type', 'statement'),
                    vt.turn_json->>'stance',
                    COALESCE(vt.turn_json->>'internal_reasoning', vt.turn_json->>'reasoning', ''),
                    vt.turn_json,
                    vt.created_at
                )
                ON CONFLICT DO NOTHING;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to migrate turn %: %', vt.id, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3.7 Semantic Memories from turns
INSERT INTO semantic_memories (participant_id, simulation_id, memory_type, content, turn_id, created_at)
SELECT t.participant_id, t.simulation_id, 'position', t.content, t.id, t.created_at
FROM turns t
WHERE t.content ~* '\y(believe|think|position|stance|support|oppose|agree|disagree)\y'
ON CONFLICT DO NOTHING;

INSERT INTO semantic_memories (participant_id, simulation_id, memory_type, content, turn_id, created_at)
SELECT t.participant_id, t.simulation_id, 'red_line', t.content, t.id, t.created_at
FROM turns t
WHERE t.content ~* '\y(never|cannot|red line|under no circumstances|will not|won''t|refuse)\y'
ON CONFLICT DO NOTHING;

INSERT INTO semantic_memories (participant_id, simulation_id, memory_type, content, turn_id, created_at)
SELECT t.participant_id, t.simulation_id, 'concession', t.content, t.id, t.created_at
FROM turns t
WHERE t.action_type = 'compromise'
ON CONFLICT DO NOTHING;

-- 3.8 Update simulation metadata
UPDATE simulations s SET
    total_turns = (SELECT COUNT(*) FROM turns t WHERE t.simulation_id = s.id),
    total_participants = (SELECT COUNT(*) FROM simulation_participants sp WHERE sp.simulation_id = s.id);

ANALYZE;

COMMIT;
