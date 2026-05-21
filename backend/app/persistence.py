import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

from app.models import SimulationState


class CheckpointManager:
    """
    Manages simulation state checkpoints for resume capability.
    
    Saves complete simulation state after each turn to enable:
    - Crash recovery
    - Session resume across restarts
    - State replay for debugging
    - Audit trails
    """
    
    def __init__(self, checkpoint_dir: str = "./checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_checkpoint_path(self, simulation_id: str) -> Path:
        return self.checkpoint_dir / f"{simulation_id}.json"
    
    def save_checkpoint(
        self,
        simulation_id: str,
        state: SimulationState,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Save simulation state to disk.
        
        Includes:
        - Complete turn history
        - Heatmap state
        - Voltage/flags
        - Turn index for resume
        - Timestamp for audit
        """
        checkpoint = {
            "simulation_id": simulation_id,
            "state": state.model_dump(),
            "metadata": metadata or {},
            "saved_at": datetime.utcnow().isoformat(),
            "turn_count": len(state.turns)
        }
        
        checkpoint_path = self._get_checkpoint_path(simulation_id)
        
        with open(checkpoint_path, 'w') as f:
            json.dump(checkpoint, f, indent=2)
    
    def load_checkpoint(self, simulation_id: str) -> Optional[SimulationState]:
        """
        Load simulation state from disk.
        
        Returns None if no checkpoint exists.
        Validates checkpoint integrity before returning.
        """
        checkpoint_path = self._get_checkpoint_path(simulation_id)
        
        if not checkpoint_path.exists():
            return None
        
        try:
            with open(checkpoint_path, 'r') as f:
                checkpoint = json.load(f)
            
            state_data = checkpoint.get('state')
            if not state_data:
                return None
            
            return SimulationState(**state_data)
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Failed to load checkpoint for {simulation_id}: {e}")
            return None
    
    def checkpoint_exists(self, simulation_id: str) -> bool:
        """Check if a checkpoint exists for this simulation."""
        return self._get_checkpoint_path(simulation_id).exists()
    
    def get_checkpoint_metadata(self, simulation_id: str) -> Optional[Dict[str, Any]]:
        """Get checkpoint metadata without loading full state."""
        checkpoint_path = self._get_checkpoint_path(simulation_id)
        
        if not checkpoint_path.exists():
            return None
        
        try:
            with open(checkpoint_path, 'r') as f:
                checkpoint = json.load(f)
            
            return {
                "simulation_id": checkpoint.get("simulation_id"),
                "turn_count": checkpoint.get("turn_count"),
                "saved_at": checkpoint.get("saved_at"),
                "metadata": checkpoint.get("metadata", {})
            }
        except (json.JSONDecodeError, ValueError):
            return None
    
    def delete_checkpoint(self, simulation_id: str) -> bool:
        """Delete checkpoint file. Returns True if deleted, False if not found."""
        checkpoint_path = self._get_checkpoint_path(simulation_id)
        
        if checkpoint_path.exists():
            os.remove(checkpoint_path)
            return True
        return False
    
    def list_checkpoints(self) -> list[Dict[str, Any]]:
        """List all available checkpoints with metadata."""
        checkpoints = []
        
        for checkpoint_file in self.checkpoint_dir.glob("*.json"):
            simulation_id = checkpoint_file.stem
            metadata = self.get_checkpoint_metadata(simulation_id)
            
            if metadata:
                checkpoints.append(metadata)
        
        return sorted(checkpoints, key=lambda x: x.get('saved_at', ''), reverse=True)


_checkpoint_manager: Optional[CheckpointManager] = None


def get_checkpoint_manager(checkpoint_dir: str = "./checkpoints") -> CheckpointManager:
    """Singleton accessor for checkpoint manager."""
    global _checkpoint_manager
    
    if _checkpoint_manager is None:
        _checkpoint_manager = CheckpointManager(checkpoint_dir=checkpoint_dir)
    
    return _checkpoint_manager
