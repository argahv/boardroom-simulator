-- ============================================================================
-- Migration 002: v2 Table Cleanup
-- ============================================================================
-- 
-- Drops old v2_* tables after data has been migrated to the unified schema.
-- Run this AFTER 001_core_schema.sql has migrated all data.
-- SAFE for re-runs: all ALTER/DROP use IF EXISTS.
--
-- Note: The DDL in postgres.py/sqlite.py creates tables named postmortems,
-- state_snapshots, agent_goals via CREATE TABLE IF NOT EXISTS. If the old
-- v2_* tables still exist with data, we need to drop the DDL-created empty
-- tables FIRST, then rename the v2_* tables to take their place.
-- ============================================================================

BEGIN;

-- ── Step 1: Drop DDL-created empty tables that would conflict with rename ──
-- These were created by postgres.py/sqlite.py CREATE TABLE IF NOT EXISTS on
-- startup. They're empty (all data lives in v2_* tables if those exist).
DROP TABLE IF EXISTS postmortems CASCADE;
DROP TABLE IF EXISTS state_snapshots CASCADE;
DROP TABLE IF EXISTS agent_goals CASCADE;

-- ── Step 2: Rename old v2_* tables to new names ──
ALTER TABLE IF EXISTS v2_postmortems RENAME TO postmortems;
ALTER TABLE IF EXISTS v2_state_snapshots RENAME TO state_snapshots;
ALTER TABLE IF EXISTS v2_agent_goals RENAME TO agent_goals;

-- ── Step 3: Fix/Add FK constraints for all renamed tables ──
-- All three tables should reference simulations(id) with ON DELETE CASCADE

-- 3a. postmortems: ADD FK (old v2_postmortems had no FK)
ALTER TABLE postmortems
  DROP CONSTRAINT IF EXISTS fk_postmortem_simulation;
ALTER TABLE postmortems
  ADD CONSTRAINT fk_postmortem_simulation
  FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE;

-- 3b. state_snapshots: REPLACE old FK (referenced v2_simulations(simulation_id))
ALTER TABLE state_snapshots
  DROP CONSTRAINT IF EXISTS v2_state_snapshots_simulation_id_fkey;
ALTER TABLE state_snapshots
  DROP CONSTRAINT IF EXISTS fk_state_snapshot_simulation;
ALTER TABLE state_snapshots
  ADD CONSTRAINT fk_state_snapshot_simulation
  FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE;

-- 3c. agent_goals: ADD FK (old v2_agent_goals had no FK)
ALTER TABLE agent_goals
  DROP CONSTRAINT IF EXISTS fk_agent_goal_simulation;
ALTER TABLE agent_goals
  ADD CONSTRAINT fk_agent_goal_simulation
  FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE;

-- ── Step 4: Drop the fully replaced v2 tables ──
DROP TABLE IF EXISTS v2_turns CASCADE;
DROP TABLE IF EXISTS v2_simulations CASCADE;

-- ── Step 5: Indexes ──
CREATE INDEX IF NOT EXISTS idx_snapshots_sim_turn ON state_snapshots(simulation_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_agent_goals_agent ON agent_goals(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_goals_sim  ON agent_goals(simulation_id);
CREATE INDEX IF NOT EXISTS idx_postmortems_sim   ON postmortems(simulation_id);

COMMIT;
