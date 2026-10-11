-- Persona archetype (behavioural preset) on library personas
ALTER TABLE "stakeholders" ADD COLUMN IF NOT EXISTS "archetype" TEXT;

-- What an evolution proposal came from, so "After 'Series B' (lost the vote)" survives deleting the simulation
ALTER TABLE "persona_evolution" ADD COLUMN IF NOT EXISTS "simulation_subject" TEXT;
ALTER TABLE "persona_evolution" ADD COLUMN IF NOT EXISTS "outcome" TEXT;
