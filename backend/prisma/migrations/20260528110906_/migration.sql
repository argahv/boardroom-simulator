-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "document_uploads" (
    "id" TEXT NOT NULL,
    "simulation_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_documents" (
    "id" TEXT NOT NULL,
    "persona_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL DEFAULT '',
    "filepath" TEXT NOT NULL DEFAULT '',
    "content_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "embedding_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_evolution" (
    "id" TEXT NOT NULL,
    "persona_id" TEXT NOT NULL,
    "simulation_id" TEXT NOT NULL DEFAULT '',
    "proposed_deltas" JSONB NOT NULL DEFAULT '{}',
    "before_snapshot" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "applied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_evolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_research" (
    "id" TEXT NOT NULL,
    "persona_id" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "results" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "focus" TEXT NOT NULL DEFAULT '',
    "backstory" TEXT NOT NULL DEFAULT '',
    "personality" JSONB NOT NULL DEFAULT '{}',
    "hidden_agenda" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "default_background" TEXT NOT NULL,
    "default_primary_goal" TEXT NOT NULL,
    "default_voltage" INTEGER NOT NULL DEFAULT 50,
    "default_model_temperature" TEXT NOT NULL DEFAULT 'stable',
    "suggested_persona_ids" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_memories" (
    "id" BIGSERIAL NOT NULL,
    "participant_id" UUID NOT NULL,
    "simulation_id" UUID NOT NULL,
    "memory_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "turn_id" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "embedding" vector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simulation_id" UUID NOT NULL,
    "persona_id" UUID,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "stance" TEXT NOT NULL DEFAULT 'neutral',
    "personality" JSONB NOT NULL DEFAULT '{}',
    "backstory" TEXT NOT NULL DEFAULT '',
    "hidden_agenda" TEXT NOT NULL DEFAULT '',
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "first_turn_index" INTEGER,
    "last_turn_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID,
    "subject_name" TEXT NOT NULL DEFAULT '',
    "subject_description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "voltage" INTEGER NOT NULL DEFAULT 50,
    "model_temperature" TEXT NOT NULL DEFAULT 'volatile',
    "speaker_mode" TEXT NOT NULL DEFAULT 'alternating',
    "end_condition" JSONB NOT NULL DEFAULT '{"type": "timeout", "max_turns": 20}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "total_turns" INTEGER NOT NULL DEFAULT 0,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "simulation_id" TEXT,
    "active_speaker_id" TEXT,
    "state_json" JSONB,
    "runtime_status" TEXT NOT NULL DEFAULT 'idle',
    "state_version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "incentive_tuning" INTEGER NOT NULL DEFAULT 50,
    "hidden_agenda" TEXT NOT NULL DEFAULT '',
    "tag" TEXT,
    "tool_profile" TEXT NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "backstory" TEXT NOT NULL DEFAULT '',
    "stance" TEXT NOT NULL DEFAULT 'neutral',
    "personality" JSONB NOT NULL DEFAULT '{}',
    "tools" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "estimated_duration" TEXT NOT NULL DEFAULT '',
    "stakeholder_count" INTEGER NOT NULL DEFAULT 0,
    "voltage" INTEGER NOT NULL DEFAULT 50,
    "config" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turns" (
    "id" BIGSERIAL NOT NULL,
    "simulation_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "participant_turn_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "action_type" TEXT NOT NULL DEFAULT 'statement',
    "stance" TEXT,
    "emotional_state" JSONB NOT NULL DEFAULT '{}',
    "internal_reasoning" TEXT NOT NULL DEFAULT '',
    "directed_to_participant_id" UUID,
    "turn_data" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_goals" (
    "id" TEXT NOT NULL,
    "simulation_id" UUID NOT NULL,
    "agent_id" TEXT NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "goal_text" TEXT NOT NULL,
    "priority" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "agent_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postmortems" (
    "simulation_id" UUID NOT NULL,
    "postmortem_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postmortems_pkey" PRIMARY KEY ("simulation_id")
);

-- CreateTable
CREATE TABLE "state_snapshots" (
    "id" TEXT NOT NULL,
    "simulation_id" UUID NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_doc_uploads_sim" ON "document_uploads"("simulation_id");

-- CreateIndex
CREATE INDEX "idx_persona_docs_pid" ON "persona_documents"("persona_id");

-- CreateIndex
CREATE INDEX "idx_persona_evo_pid" ON "persona_evolution"("persona_id");

-- CreateIndex
CREATE INDEX "idx_persona_evo_status" ON "persona_evolution"("status");

-- CreateIndex
CREATE INDEX "idx_persona_research_pid" ON "persona_research"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "personas_slug_key" ON "personas"("slug");

-- CreateIndex
CREATE INDEX "idx_personas_name" ON "personas"("name");

-- CreateIndex
CREATE INDEX "idx_personas_slug" ON "personas"("slug");

-- CreateIndex
CREATE INDEX "idx_semantic_memories_participant" ON "semantic_memories"("participant_id");

-- CreateIndex
CREATE INDEX "idx_semantic_memories_simulation" ON "semantic_memories"("simulation_id");

-- CreateIndex
CREATE INDEX "idx_semantic_memories_type" ON "semantic_memories"("participant_id", "memory_type");

-- CreateIndex
CREATE INDEX "idx_participants_persona" ON "simulation_participants"("persona_id");

-- CreateIndex
CREATE INDEX "idx_participants_simulation" ON "simulation_participants"("simulation_id");

-- CreateIndex
CREATE UNIQUE INDEX "simulations_simulation_id_key" ON "simulations"("simulation_id");

-- CreateIndex
CREATE INDEX "idx_simulations_created" ON "simulations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_simulations_created_at" ON "simulations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_simulations_status" ON "simulations"("status");

-- CreateIndex
CREATE INDEX "idx_stakeholders_tag" ON "stakeholders"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "templates_slug_key" ON "templates"("slug");

-- CreateIndex
CREATE INDEX "idx_templates_category" ON "templates"("category");

-- CreateIndex
CREATE INDEX "idx_templates_slug" ON "templates"("slug");

-- CreateIndex
CREATE INDEX "idx_turns_created_at" ON "turns"("created_at");

-- CreateIndex
CREATE INDEX "idx_turns_participant" ON "turns"("participant_id");

-- CreateIndex
CREATE INDEX "idx_turns_participant_turn_idx" ON "turns"("participant_id", "turn_index");

-- CreateIndex
CREATE INDEX "idx_turns_sim_index" ON "turns"("simulation_id", "turn_index");

-- CreateIndex
CREATE INDEX "idx_turns_sim_participant" ON "turns"("simulation_id", "participant_id");

-- CreateIndex
CREATE INDEX "idx_agent_goals_agent" ON "agent_goals"("agent_id");

-- CreateIndex
CREATE INDEX "idx_agent_goals_sim" ON "agent_goals"("simulation_id");

-- CreateIndex
CREATE INDEX "idx_snapshots_sim_turn" ON "state_snapshots"("simulation_id", "turn_index");

-- AddForeignKey
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_documents" ADD CONSTRAINT "persona_documents_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "stakeholders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "persona_evolution" ADD CONSTRAINT "persona_evolution_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "stakeholders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "persona_research" ADD CONSTRAINT "persona_research_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "stakeholders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "simulation_participants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "turns"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "simulation_participants" ADD CONSTRAINT "simulation_participants_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_participants" ADD CONSTRAINT "simulation_participants_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "turns" ADD CONSTRAINT "turns_directed_to_participant_id_fkey" FOREIGN KEY ("directed_to_participant_id") REFERENCES "simulation_participants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "turns" ADD CONSTRAINT "turns_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "simulation_participants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_goals" ADD CONSTRAINT "agent_goals_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortems" ADD CONSTRAINT "postmortems_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_snapshots" ADD CONSTRAINT "state_snapshots_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
