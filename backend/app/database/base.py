from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..models import (
    PersonaDocument,
    PersonaEvolution,
    PersonaResearch,
    ScenarioTemplate,
    SimulationDocument,
    SimulationState,
    Stakeholder,
)


class DatabaseBackend(ABC):
    @abstractmethod
    async def initialize(self) -> None:
        pass
    
    @abstractmethod
    async def close(self) -> None:
        pass
    
    @abstractmethod
    async def create_simulation(self, state: SimulationState) -> SimulationState:
        pass
    
    @abstractmethod
    async def get_simulation(self, simulation_id: str) -> Optional[SimulationState]:
        pass
    
    @abstractmethod
    async def update_simulation(self, state: SimulationState) -> SimulationState:
        pass
    
    @abstractmethod
    async def list_simulations(
        self,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None
    ) -> List[SimulationState]:
        pass
    
    @abstractmethod
    async def delete_simulation(self, simulation_id: str) -> bool:
        pass
    
    @abstractmethod
    async def create_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        pass
    
    @abstractmethod
    async def get_stakeholder(self, stakeholder_id: str) -> Optional[Stakeholder]:
        pass
    
    @abstractmethod
    async def update_stakeholder(self, stakeholder: Stakeholder) -> Stakeholder:
        pass
    
    @abstractmethod
    async def list_stakeholders(
        self,
        limit: int = 100,
        offset: int = 0,
        tag: Optional[str] = None
    ) -> List[Stakeholder]:
        pass
    
    @abstractmethod
    async def delete_stakeholder(self, stakeholder_id: str) -> bool:
        pass
    
    @abstractmethod
    async def get_all_stakeholders(self) -> List[Stakeholder]:
        pass

    # ------------------------------------------------------------------
    # Scenario templates
    # ------------------------------------------------------------------

    @abstractmethod
    async def create_template(self, template: ScenarioTemplate) -> ScenarioTemplate:
        pass

    @abstractmethod
    async def get_template(self, template_id: str) -> Optional[ScenarioTemplate]:
        pass

    @abstractmethod
    async def list_templates(self) -> List[ScenarioTemplate]:
        pass

    @abstractmethod
    async def template_exists(self, template_id: str) -> bool:
        pass

    @abstractmethod
    async def stakeholder_exists(self, stakeholder_id: str) -> bool:
        pass

    # ------------------------------------------------------------------
    # v2 State Snapshots
    # ------------------------------------------------------------------

    @abstractmethod
    async def create_state_snapshot(
        self, simulation_id: str, turn_index: int, snapshot_json: str, version: int = 1
    ) -> str:
        pass

    @abstractmethod
    async def get_state_snapshots_by_simulation(self, simulation_id: str) -> list[dict]:
        pass

    @abstractmethod
    async def get_latest_state_snapshot(self, simulation_id: str) -> Optional[dict]:
        pass

    @abstractmethod
    async def delete_old_state_snapshots(self, simulation_id: str, max_keep: int = 50) -> None:
        pass

    # ------------------------------------------------------------------
    # Document uploads
    # ------------------------------------------------------------------

    @abstractmethod
    async def create_document(self, doc: SimulationDocument) -> None:
        pass

    @abstractmethod
    async def get_documents_by_simulation(self, simulation_id: str) -> list[SimulationDocument]:
        pass

    @abstractmethod
    async def get_document(self, document_id: str) -> Optional[SimulationDocument]:
        pass

    @abstractmethod
    async def update_document_status(
        self, document_id: str, status: str, extracted_text: str | None = None
    ) -> None:
        pass

    @abstractmethod
    async def delete_documents_by_simulation(self, simulation_id: str) -> None:
        pass

    # ------------------------------------------------------------------
    # Persona Growth System (v2)
    # ------------------------------------------------------------------

    @abstractmethod
    async def list_personas_v2(self) -> list[dict]:
        pass

    @abstractmethod
    async def get_persona_v2(self, persona_id: str) -> dict | None:
        pass

    # Persona documents

    @abstractmethod
    async def create_persona_document(self, doc: PersonaDocument) -> PersonaDocument:
        pass

    @abstractmethod
    async def get_persona_documents(self, persona_id: str) -> list[PersonaDocument]:
        pass

    @abstractmethod
    async def delete_persona_document(self, document_id: str) -> bool:
        pass

    # Persona evolution

    @abstractmethod
    async def create_persona_evolution(self, evolution: PersonaEvolution) -> PersonaEvolution:
        pass

    @abstractmethod
    async def get_pending_evolutions(self, persona_id: str) -> list[PersonaEvolution]:
        pass

    @abstractmethod
    async def approve_evolution(self, evolution_id: str) -> bool:
        pass

    @abstractmethod
    async def reject_evolution(self, evolution_id: str) -> bool:
        pass

    @abstractmethod
    async def get_evolution_history(self, persona_id: str) -> list[PersonaEvolution]:
        pass

    # Persona research

    @abstractmethod
    async def create_persona_research(self, research: PersonaResearch) -> PersonaResearch:
        pass

    @abstractmethod
    async def get_persona_research(self, persona_id: str) -> list[PersonaResearch]:
        pass

    @abstractmethod
    async def update_persona_research(self, research_id: str, results: str) -> bool:
        pass


