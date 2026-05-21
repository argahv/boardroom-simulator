#!/usr/bin/env python3
"""
Seed script for boardroom simulator database.
Populates database with default personas from DEFAULT_LIBRARY.

Usage:
    python -m scripts.seed_db
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_database, initialize_database
from app.personas import DEFAULT_LIBRARY


async def seed_personas():
    print("🌱 Seeding database with default personas...")
    
    db = get_database()
    await initialize_database()
    
    existing = await db.get_all_stakeholders()
    existing_ids = {s.id for s in existing}
    
    added_count = 0
    skipped_count = 0
    
    for persona in DEFAULT_LIBRARY:
        if persona.id in existing_ids:
            print(f"   ⊘ Skipping {persona.name} ({persona.role}) - already exists")
            skipped_count += 1
            continue
        
        await db.create_stakeholder(persona)
        print(f"   ✓ Added {persona.name} ({persona.role}) - tag: {persona.tag}")
        added_count += 1
    
    print(f"\n✨ Seeding complete!")
    print(f"   Added: {added_count} personas")
    print(f"   Skipped: {skipped_count} personas (already existed)")
    print(f"   Total: {len(existing) + added_count} personas in database")


async def clear_database():
    print("🗑️  Clearing database...")
    
    db = get_database()
    await initialize_database()
    
    stakeholders = await db.get_all_stakeholders()
    simulations = await db.list_simulations(limit=1000)
    
    for stakeholder in stakeholders:
        await db.delete_stakeholder(stakeholder.id)
    
    for simulation in simulations:
        await db.delete_simulation(simulation.simulation_id)
    
    print(f"   ✓ Deleted {len(stakeholders)} stakeholders")
    print(f"   ✓ Deleted {len(simulations)} simulations")
    print("\n✨ Database cleared!")


async def show_stats():
    print("📊 Database statistics...")
    
    db = get_database()
    await initialize_database()
    
    stakeholders = await db.get_all_stakeholders()
    simulations = await db.list_simulations(limit=1000)
    
    print(f"\n   Stakeholders: {len(stakeholders)}")
    
    tag_counts = {}
    for s in stakeholders:
        tag_counts[s.tag] = tag_counts.get(s.tag, 0) + 1
    
    for tag, count in sorted(tag_counts.items()):
        print(f"      {tag}: {count}")
    
    print(f"\n   Simulations: {len(simulations)}")
    
    status_counts = {}
    for sim in simulations:
        status_counts[sim.status] = status_counts.get(sim.status, 0) + 1
    
    for status, count in sorted(status_counts.items()):
        print(f"      {status}: {count}")


async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python -m scripts.seed_db seed    # Seed default personas")
        print("  python -m scripts.seed_db clear   # Clear all data")
        print("  python -m scripts.seed_db stats   # Show database statistics")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "seed":
        await seed_personas()
    elif command == "clear":
        confirm = input("⚠️  This will delete ALL data. Are you sure? (yes/no): ")
        if confirm.lower() == "yes":
            await clear_database()
        else:
            print("Cancelled.")
    elif command == "stats":
        await show_stats()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
