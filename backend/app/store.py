from __future__ import annotations

from typing import Dict

from .models import SimulationState, Stakeholder
from .database import get_database

async def get(simulation_id: str) -> SimulationState | None:
    db = get_database()
    return await db.get_simulation(simulation_id)

async def put(state: SimulationState) -> SimulationState:
    db = get_database()
    existing = await db.get_simulation(state.simulation_id)
    if existing:
        return await db.update_simulation(state)
    else:
        return await db.create_simulation(state)

async def list_simulations() -> list[SimulationState]:
    db = get_database()
    return await db.list_simulations(limit=1000)

async def delete_simulation(simulation_id: str) -> bool:
    db = get_database()
    return await db.delete_simulation(simulation_id)

async def get_stakeholder(stakeholder_id: str) -> Stakeholder | None:
    db = get_database()
    return await db.get_stakeholder(stakeholder_id)

async def get_all_stakeholders() -> list[Stakeholder]:
    db = get_database()
    return await db.get_all_stakeholders()

async def add_stakeholder(stakeholder: Stakeholder) -> Stakeholder:
    db = get_database()
    return await db.create_stakeholder(stakeholder)

async def update_stakeholder(stakeholder_id: str, stakeholder: Stakeholder) -> Stakeholder | None:
    db = get_database()
    existing = await db.get_stakeholder(stakeholder_id)
    if not existing:
        return None
    return await db.update_stakeholder(stakeholder)

async def delete_stakeholder(stakeholder_id: str) -> bool:
    db = get_database()
    return await db.delete_stakeholder(stakeholder_id)

