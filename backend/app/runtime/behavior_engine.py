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
_archetypes = _load_sibling("archetypes")
ARCHETYPE_DELTA_MULTIPLIERS = _archetypes.ARCHETYPE_DELTA_MULTIPLIERS
_social = _load_sibling("social_physics")
DEFAULT_DELTAS = _social.DEFAULT_DELTAS
CoalitionDetector = _load_sibling("coalition_detection").CoalitionDetector


@dataclass
class BehaviorResult:
    state_snapshot: dict
    triggers: list[str]
    internal_state: dict
    relationship_matrix: dict
    suggested_action: str | None = None


class BehaviorEngine:
    def __init__(
        self,
        agent_ids: list[str],
        scenario_type: str = "debate",
        personas: list[PersonalityProfile] | None = None,
        archetypes: list[str | None] | None = None,
        custom_actions: dict[str, dict[str, float]] | None = None,
    ) -> None:
        self._social_physics: dict[str, object] = {}
        self._internal_states: dict[str, object] = {}
        self._graph = RelationshipGraph()
        self._coalitions = CoalitionDetector(self._graph)
        self._turn_count: int = 0
        self._plan_manager = None
        self._scenario = SCENARIO_PROFILES.get(scenario_type, SCENARIO_PROFILES["debate"])
        self._personas: dict[str, PersonalityProfile] = {}
        self._agent_archetypes: dict[str, str] = {}
        # name -> {"trust": float, "leverage": float} additive deltas for user-defined actions
        self._custom_actions: dict[str, dict[str, float]] = dict(custom_actions or {})
        persona_iter = iter(personas) if personas else iter([])
        archetype_iter = iter(archetypes) if archetypes else iter([])
        for aid in agent_ids:
            p = next(persona_iter, None)
            a = next(archetype_iter, None)
            self.register_agent(aid, personality=p, archetype=a)

    def register_agent(self, agent_id: str, personality: PersonalityProfile | None = None, archetype: str | None = None) -> Self:
        if personality is not None and archetype:
            biased = _archetypes.bias_personality(personality.model_dump(), archetype)
            personality = PersonalityProfile(**biased)
        sp = SocialPhysics(**self._scenario.social)
        ist = InternalState(agent_id, personality or PersonalityProfile())
        ist.cognitive_state.emotion = dict(self._scenario.emotion)
        arch = _archetypes.get_archetype(archetype)
        if arch is not None and arch.emotion_bias:
            ist.shift_emotions(arch.emotion_bias)
        self._social_physics[agent_id] = sp
        self._internal_states[agent_id] = ist
        if personality:
            self._personas[agent_id] = personality
        if archetype:
            self._agent_archetypes[agent_id] = archetype.lower()
        return self

    def set_plan_manager(self, plan_manager) -> Self:
        self._plan_manager = plan_manager
        return self

    @property
    def volatility(self) -> float:
        return self._scenario.volatility

    def process_turn(self, turn: dict) -> BehaviorResult:
        self._turn_count += 1
        speaker_id = turn.get("speaker_id", "")
        action_type = turn.get("action_type", "") or "statement"
        target_id = turn.get("target_id", "") or ""
        if target_id == speaker_id or target_id not in self._social_physics:
            target_id = ""

        logger.debug("Turn %d processed: speaker=%s action=%s", self._turn_count, speaker_id, action_type, extra={"turn": self._turn_count, "speaker": speaker_id, "action_type": action_type, "event": "turn_processed"})

        # Custom (user-defined) actions use statement dynamics plus their own deltas.
        physics_action = action_type if action_type in DEFAULT_DELTAS else "statement"
        custom = self._custom_actions.get(action_type) if physics_action != action_type else None

        if speaker_id in self._social_physics:
            context = dict(turn)
            context["personality"] = self._personas.get(speaker_id)
            context["archetype"] = self._agent_archetypes.get(speaker_id)
            context["volatility"] = self._scenario.volatility
            sp = self._social_physics[speaker_id].update(physics_action, speaker_id, target_id, context)
            if custom:
                sp = sp.nudge(**custom)
            self._social_physics[speaker_id] = sp
        if target_id:
            self._social_physics[target_id] = self._social_physics[target_id].receive(
                physics_action, volatility=self._scenario.volatility)

        emotion_event = {"action_type": physics_action, "directed_at": target_id or None, "speaker_id": speaker_id}
        if speaker_id in self._internal_states:
            self._internal_states[speaker_id].apply_event(emotion_event)
        if target_id and target_id in self._internal_states:
            self._internal_states[target_id].apply_event(emotion_event)
        if physics_action == "walkaway":
            for aid, ist in self._internal_states.items():
                if aid not in (speaker_id, target_id):
                    ist.apply_event(emotion_event)

        # Reciprocity is judged on the relationship BEFORE this turn's own effect.
        reciprocated = False
        if target_id:
            back = self._graph.get(target_id, speaker_id)
            reciprocated = back.alliance or back.trust >= 0.55
        graph_turn = {"action_type": physics_action, "speaker_id": speaker_id, "target_id": target_id}
        self._graph.apply_turn(graph_turn)
        self._update_coalitions(physics_action, speaker_id, target_id, turn.get("content", ""), reciprocated)
        if physics_action in ("challenge", "escalate") and target_id:
            self._coalitions.dissolve(speaker_id, target_id, turn=self._turn_count)

        sp = self._social_physics.get(speaker_id)
        sp_snap = sp.snapshot() if sp else {}
        ist = self._internal_states.get(speaker_id)
        return BehaviorResult(state_snapshot=sp_snap, triggers=sp_snap.get("triggers", []),
            internal_state=ist.snapshot() if ist else {}, relationship_matrix=self._graph.to_matrix(),
            suggested_action=self._suggest_action(speaker_id))

    def _update_coalitions(self, action: str, speaker: str, target: str, content: str,
                           reciprocated: bool) -> None:
        """Coalitions are mutual: one side's overture only forms a coalition once
        the other side has reciprocated (alliance or solid trust back)."""
        if action not in ("coalition_signal", "compromise", "agreement") or not target:
            return
        for c in self._coalitions.get_active():
            if {c.agent_a, c.agent_b} == {speaker, target}:
                c.strength = min(1.0, c.strength + 0.1)  # reinforce, don't duplicate
                return
        if reciprocated:
            self._coalitions.detect(
                {"action_type": "coalition_signal" if action != "compromise" else "compromise",
                 "agent_id": speaker, "directed_at": target, "content": content},
                turn_index=self._turn_count,
            )

    def apply_shock(self, social: dict[str, float] | None = None, emotion: dict[str, float] | None = None) -> Self:
        """Apply an external shock (e.g. a leak or deadline) to every agent."""
        for aid in self._social_physics:
            if social:
                self._social_physics[aid] = self._social_physics[aid].nudge(**social)
            if emotion:
                self._internal_states[aid].shift_emotions(emotion)
        return self

    def tick(self) -> Self:
        for aid in self._social_physics:
            self._social_physics[aid] = self._social_physics[aid].decay()
        for st in self._internal_states.values():
            st.emotional_decay()
        self._graph.decay_all()
        self._coalitions.decay()
        return self

    def triggers_for(self, agent_id: str) -> list[str]:
        sp = self._social_physics.get(agent_id)
        return sp.threshold_triggers() if sp else []

    def shift_focus(self, agent_id: str, goal_text: str, priority: int = 3) -> None:
        ist = self._internal_states.get(agent_id)
        if ist is not None:
            ist.shift_goal(goal_text, max(0, min(5, priority)))

    def archetype_of(self, agent_id: str) -> str | None:
        return self._agent_archetypes.get(agent_id)

    def deadlock_risk(self) -> float:
        """0-1 score: high average tension and low average trust mean deadlock."""
        if not self._social_physics:
            return 0.0
        n = len(self._social_physics)
        avg_tension = sum(sp.tension for sp in self._social_physics.values()) / n
        avg_trust = sum(sp.trust for sp in self._social_physics.values()) / n
        hostile_pairs = sum(1 for (a, b), e in self._graph._edges.items() if e.rivalry > 0.6)
        pair_count = max(1, n * (n - 1))
        score = 0.5 * avg_tension + 0.35 * (1 - avg_trust) + 0.15 * min(1.0, hostile_pairs / pair_count * 2)
        return round(max(0.0, min(1.0, score)), 3)

    def get_coalitions(self) -> list[dict]:
        return [
            {"members": [c.agent_a, c.agent_b], "issue": c.issue, "strength": round(c.strength, 3),
             "formed_turn": c.formed_turn}
            for c in self._coalitions.get_active()
        ]

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
            "archetypes": dict(self._agent_archetypes),
            "coalitions": self.get_coalitions(),
            "deadlock_risk": self.deadlock_risk(),
            "agent_plans": {
                aid: [{
                    "goal_text": p.goal_text.replace("_", " "),
                    "status": p.status,
                    "confidence": p.confidence,
                    "subgoal_count": len(p.subgoals),
                    "completed_subgoals": sum(1 for sg in p.subgoals if sg.status == "completed"),
                    "subgoals": [{"description": sg.description, "status": sg.status} for sg in p.subgoals],
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


def make_engine(
    agent_ids: list[str],
    scenario_type: str = "debate",
    personas: list | None = None,
    archetypes: list | None = None,
    custom_actions: dict | None = None,
) -> BehaviorEngine:
    return BehaviorEngine(agent_ids, scenario_type=scenario_type, personas=personas,
                          archetypes=archetypes, custom_actions=custom_actions)
