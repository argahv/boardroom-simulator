import importlib.util
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Self

logger = logging.getLogger(__name__)

# Bootstrap siblings bypassing broken __init__.py chain
_THIS_DIR = Path(__file__).resolve().parent

def _load_sibling(name):
    mod_name = f"_be_{name}"
    if mod_name not in sys.modules:
        p = _THIS_DIR / f"{name}.py"
        s = importlib.util.spec_from_file_location(mod_name, p)
        m = importlib.util.module_from_spec(s)
        sys.modules[mod_name] = m
        s.loader.exec_module(m)
    return sys.modules[mod_name]

SocialPhysics = _load_sibling("social_physics").SocialPhysics
InternalState = _load_sibling("internal_state").InternalState
RelationshipGraph = _load_sibling("relationship_graph").RelationshipGraph

# PersonalityProfile — safe import, app/__init__.py is empty
from app.models import PersonalityProfile

ScenarioProfile = _load_sibling("scenario_profile").ScenarioProfile
SCENARIO_PROFILES = _load_sibling("scenario_profile").SCENARIO_PROFILES
ARCHETYPE_DELTA_MULTIPLIERS = _load_sibling("archetypes").ARCHETYPE_DELTA_MULTIPLIERS


@dataclass
class BehaviorResult:
    state_snapshot: dict
    triggers: list[str]
    internal_state: dict
    relationship_matrix: dict
    suggested_action: str | None = None


class BehaviorEngine:
    def __init__(self, agent_ids: list[str], scenario_type: str = "debate", personas: list[PersonalityProfile] | None = None) -> None:
        self._social_physics: dict[str, object] = {}
        self._internal_states: dict[str, object] = {}
        self._graph = RelationshipGraph()
        self._turn_count: int = 0
        self._plan_manager = None
        self._scenario = SCENARIO_PROFILES.get(scenario_type, SCENARIO_PROFILES["debate"])
        self._personas: dict[str, PersonalityProfile] = {}
        self._agent_archetypes: dict[str, str] = {}
        persona_iter = iter(personas) if personas else iter([])
        for aid in agent_ids:
            p = next(persona_iter, None)
            self.register_agent(aid, personality=p)

    def register_agent(self, agent_id: str, personality: PersonalityProfile | None = None, archetype: str | None = None) -> Self:
        sp = SocialPhysics(**self._scenario.social)
        ist = InternalState(agent_id, personality or PersonalityProfile())
        ist.cognitive_state.emotion = dict(self._scenario.emotion)
        self._social_physics[agent_id] = sp
        self._internal_states[agent_id] = ist
        if personality:
            self._personas[agent_id] = personality
        if archetype:
            self._agent_archetypes[agent_id] = archetype
        return self

    def process_turn(self, turn: dict) -> BehaviorResult:
        self._turn_count += 1
        speaker_id = turn.get("speaker_id", "")
        action_type = turn.get("action_type", "")
        target_id = turn.get("target_id", "")

        logger.debug("Turn %d processed: speaker=%s action=%s", self._turn_count, speaker_id, action_type, extra={"turn": self._turn_count, "speaker": speaker_id, "action_type": action_type, "event": "turn_processed"})

        if speaker_id in self._social_physics:
            context = dict(turn)
            context["personality"] = self._personas.get(speaker_id)
            context["archetype"] = self._agent_archetypes.get(speaker_id)
            self._social_physics[speaker_id] = self._social_physics[speaker_id].update(action_type, speaker_id, target_id, context)
        if speaker_id in self._internal_states:
            self._internal_states[speaker_id].apply_event({"action_type": action_type, "directed_at": target_id})
        if target_id and target_id != speaker_id and target_id in self._internal_states:
            self._internal_states[target_id].apply_event({"action_type": action_type, "directed_at": target_id})
        self._graph.apply_turn(turn)

        sp = self._social_physics.get(speaker_id)
        sp_snap = sp.snapshot() if sp else {}
        ist = self._internal_states.get(speaker_id)
        return BehaviorResult(state_snapshot=sp_snap, triggers=sp_snap.get("triggers", []),
            internal_state=ist.snapshot() if ist else {}, relationship_matrix=self._graph.to_matrix(),
            suggested_action=self._suggest_action(speaker_id))

    def tick(self) -> Self:
        for aid in self._social_physics:
            self._social_physics[aid] = self._social_physics[aid].decay()
        for st in self._internal_states.values():
            st.emotional_decay()
        self._graph.decay_all()
        return self

    def get_state_for_llm(self, agent_id: str) -> dict:
        sp = self._social_physics.get(agent_id)
        if sp is None:
            return {"social_physics": {}, "cognitive_state": {}, "trust_scores": {}, "allies": [], "rivals": [], "turn_count": 0}
        ist = self._internal_states.get(agent_id)
        return {"social_physics": sp.snapshot(), "cognitive_state": ist.snapshot() if ist else {},
            "trust_scores": {o: self._graph.get(agent_id, o).trust for o in self._social_physics if o != agent_id},
            "allies": self._graph.get_allies(agent_id), "rivals": self._graph.get_rivals(agent_id),
            "turn_count": self._turn_count}

    def get_public_state(self) -> dict:
        return {"turn_count": self._turn_count, "relationship_matrix": self._graph.to_matrix(),
            "social_physics": {aid: sp.snapshot() for aid, sp in self._social_physics.items()},
            "agent_states": {aid: st.snapshot() for aid, st in self._internal_states.items()},
            "agent_plans": {
                aid: [{
                    "goal_text": p.goal_text,
                    "status": p.status,
                    "confidence": p.confidence,
                    "subgoal_count": len(p.subgoals),
                    "completed_subgoals": sum(1 for sg in p.subgoals if sg.status == "completed"),
                } for p in self._plan_manager.get_active_plans(aid)]
                for aid in self._social_physics
            } if self._plan_manager else {}}

    def _suggest_action(self, agent_id: str) -> str | None:
        if agent_id not in self._social_physics: return None
        sp = self._social_physics[agent_id]
        if sp.tension > 0.7: return "deescalate"
        if sp.trust < 0.25: return "repair_trust"
        if sp.dominance > 0.8: return "share_floor"
        if sp.trust > 0.75: return "deepen_alliance"
        return None


def make_engine(agent_ids: list[str], scenario_type: str = "debate", personas: list | None = None) -> BehaviorEngine:
    return BehaviorEngine(agent_ids, scenario_type=scenario_type, personas=personas)
