from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.models import SimulationState, Stakeholder


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
