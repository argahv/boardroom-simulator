from typing import List, Dict, Any, Optional, TypedDict
import json
import logging
import re

from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool as langchain_tool
from langchain_openai import ChatOpenAI

from app import config

from app.tools import (
    calculate_roi, check_financials, calculate_burn_rate,
    query_clause, compliance_check,
    assess_tech_stack, check_integration,
    TOOL_REGISTRY
)
from app.models import Stakeholder, ActionType


logger = logging.getLogger(__name__)


class AgentResponse(BaseModel):
    content: str = Field(description="The agent's spoken statement in the negotiation")
    internal_reasoning: str = Field(description="Private reasoning the agent used to formulate response")
    action_type: ActionType = Field(description="Type of action being taken")
    directed_at: Optional[str] = Field(None, description="Stakeholder ID this turn is addressed to")
    coalition_with: Optional[str] = Field(None, description="Stakeholder ID forming coalition with")
    emotional_tone: str = Field(default="neutral", description="Emotional tone: tense, neutral, heated, conciliatory")

    # production dynamics
    interrupt_bid: float = Field(default=0.0, ge=0.0, le=1.0, description="How urgently you want to interrupt immediately after this turn")
    position_delta: Dict[str, str] = Field(default_factory=dict, description="Key stance updates made in this turn")
    leverage_delta: Dict[str, int] = Field(default_factory=dict, description="Suggested leverage adjustments: map stakeholder_id -> -10..+10")

    tool_calls: List[Dict[str, Any]] = Field(default_factory=list, description="Tools invoked during reasoning")


class AgentState(TypedDict, total=False):
    """State dictionary for LangGraph workflow."""
    simulation_id: str
    turn_index: int
    background: str
    primary_goal: str
    stakeholders: List[Dict[str, Any]]
    voltage: int
    active_speaker_id: str
    history: List[Dict[str, Any]]
    agent_memories: Dict[str, Any]
    heatmap: Dict[str, int]
    event_log: List[str]


def convert_tools_to_langchain(agent_type: str) -> List:
    """
    Convert our tool functions to LangChain tool format.
    
    LangChain tools require specific annotations and structure.
    This wraps our existing tool functions.
    """
    agent_tools = TOOL_REGISTRY.get(agent_type.lower(), [])
    langchain_tools = []
    
    for tool_def in agent_tools:
        func = tool_def["func"]
        description = tool_def["description"]
        tool_name = tool_def["name"]
        
        wrapped_tool = langchain_tool(func)
        wrapped_tool.name = tool_name
        wrapped_tool.description = description
        langchain_tools.append(wrapped_tool)
    
    return langchain_tools


class BoardroomAgent:
    """
    Individual agent representing a stakeholder in the negotiation.
    
    Each agent has:
    - Persona (from Stakeholder config)
    - Tools (role-specific: CFO gets financial tools, Legal gets compliance tools, etc.)
    - LLM with structured output (Pydantic parser)
    - Memory of negotiation history
    """
    
    def __init__(
        self,
        stakeholder: Stakeholder,
        llm_base: ChatOpenAI,
        tools: Optional[List] = None
    ):
        self.stakeholder = stakeholder
        self.llm_base = llm_base
        self.tools = tools or []
        
        self.llm = llm_base.with_structured_output(AgentResponse)
        
        if self.tools:
            self.llm_with_tools = llm_base.bind_tools(self.tools)
        else:
            self.llm_with_tools = None
        
        self.memory: List[str] = []
        self.positions: List[str] = []
        self.concessions: List[str] = []
        self.red_lines: List[str] = []
    
    def _build_system_prompt(self, state: AgentState) -> str:
        agent_id = self.stakeholder.id
        memories = state.get("agent_memories", {})

        # Own semantic memory: what I've said on similar topics before
        own_ctx = memories.get(agent_id, [])
        own_ctx_text = (
            "\n".join(f"  [{i+1}] {m['content'][:200]}" for i, m in enumerate(own_ctx))
            if own_ctx else "  (none yet)"
        )

        # Cross-agent memory: what OTHERS said on this topic
        cross_ctx = memories.get("_cross_agent", [])
        cross_ctx_text = (
            "\n".join(
                f"  [{i+1}] {m['metadata'].get('stakeholder_name','?')} "
                f"({m['metadata'].get('role','?')}): {m['content'][:200]}"
                for i, m in enumerate(cross_ctx)
            )
            if cross_ctx else "  (none yet)"
        )

        return f"""You are {self.stakeholder.name}, {self.stakeholder.role} in a high-stakes boardroom negotiation.

**Your Character:**
- Role: {self.stakeholder.role}
- Focus: {self.stakeholder.focus}
- Incentive: {self.stakeholder.incentive_tuning}/100 (higher = more aggressive pursuit of your goals)
- Hidden Agenda: {self.stakeholder.hidden_agenda or "None"}
- Tag: {self.stakeholder.tag or "Neutral"}

**Negotiation Context:**
Background: {state.get('background', '')}
Primary Goal: {state.get('primary_goal', '')}
Current Voltage (tension level): {state.get('voltage', 50)}/100

**Your Memory (positions you've taken on similar topics):**
{own_ctx_text}

**Your Concessions So Far:**
{chr(10).join(f"- {conc}" for conc in self.concessions) if self.concessions else "  No concessions made"}

**Your Red Lines:**
{chr(10).join(f"- {red}" for red in self.red_lines) if self.red_lines else "  No hard boundaries stated"}

**What Others Have Said On This Topic:**
{cross_ctx_text}

**Available Tools:**
{chr(10).join(f"- {tool.name}: {tool.description}" for tool in self.tools) if self.tools else "No tools available"}

**Your Mission:**
Advance your agenda while appearing reasonable. Use data from your tools to bolster arguments.
Be strategic: know when to push, when to compromise, when to form coalitions.
Reference what others said above — agree with allies, challenge opponents with their own words.

**Response Guidelines:**
1. Stay in character — your role, focus, and incentive level guide your behavior
2. Use tools when you need factual data to support your position
3. Reference prior statements by other participants when strategic
4. Be specific and actionable — vague statements reduce your leverage
5. Adapt tone based on voltage and negotiation dynamics

**Formatting:**
Use **bold** for key demands, lists for arguments, `backticks` for numbers.

Remember: You're not just stating positions — you're negotiating outcomes."""
    
    def _build_history_context(self, history: List[Dict[str, Any]]) -> str:
        """Build conversation history context."""
        if not history:
            return "No prior turns yet. You're starting the negotiation."
        
        formatted = []
        for turn in history[-5:]:
            formatted.append(
                f"{turn['stakeholder_name']} ({turn['role']}): {turn['content']}"
            )
        
        return "Recent conversation:\n" + "\n".join(formatted)
    
    # ── structured-output helpers ──────────────────────────────────────────

    @staticmethod
    def _extract_json_from_text(text: str) -> dict | None:
        """
        Try to salvage a JSON object from prose/fenced model output.
        Handles: plain JSON, ```json fences, JSON embedded in surrounding text.
        Returns parsed dict or None.
        """
        text = text.strip()
        # Strip markdown fences
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines).strip()

        # Direct JSON
        if text.startswith("{"):
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                pass

        # JSON block anywhere in text
        match = re.search(r"\{[\s\S]+\}", text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        return None

    def _safe_fallback_response(
        self,
        raw_text: str,
        error: Exception,
        turn_index: int,
    ) -> AgentResponse:
        """
        Soft-fallback AgentResponse used when all parse attempts fail.
        Logs telemetry: raw_output_preview, error class, stakeholder, turn.
        Marked degraded=true via event_log (caller sees it).
        """
        preview = (raw_text or "")[:200].replace("\n", " ")
        logger.warning(
            "PARSE_FALLBACK stakeholder=%s turn=%d error=%s raw_preview=%r",
            self.stakeholder.id,
            turn_index,
            type(error).__name__,
            preview,
        )
        # Extract at least the content if it looks like prose
        content = raw_text.strip() if raw_text.strip() else (
            f"I need a moment to gather my thoughts on this."
        )
        # If it's just a JSON parse failure, the LLM may have returned a valid
        # English statement — use it directly as content.
        return AgentResponse(
            content=content[:1500],
            internal_reasoning="[DEGRADED: parse fallback]",
            action_type="statement",
            emotional_tone="neutral",
            interrupt_bid=0.0,
        )

    def invoke(self, state: AgentState) -> AgentResponse:
        """
        Generate agent response for current turn.

        Hardened flow (production):
        1. Tool call phase (if tools bound)
        2. Structured output attempt (provider-enforced schema)
        3. If parse fails: 1 targeted retry with error context
        4. If still fails: soft-fallback turn (never raises, degraded flag)
        """
        turn_index: int = state.get("turn_index", 0)
        system_prompt = self._build_system_prompt(state)
        history_context = self._build_history_context(state.get('history', []))

        user_prompt = f"""{history_context}

It's your turn to speak. Consider:
- What's your strategic move right now?
- Do you need data from your tools to strengthen your argument?
- Who are you primarily addressing?
- What action type best describes your move?

Respond with your statement."""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        # ── Phase 1: optional tool calls ──────────────────────────────────
        tool_results: List[Dict[str, Any]] = []

        if self.llm_with_tools:
            try:
                tool_response = self.llm_with_tools.invoke(messages)
                if hasattr(tool_response, "tool_calls") and tool_response.tool_calls:
                    for tool_call in tool_response.tool_calls:
                        tool_name = tool_call["name"]
                        tool_args = tool_call["args"]
                        matching_tool = next(
                            (t for t in self.tools if t.name == tool_name), None
                        )
                        if matching_tool:
                            try:
                                result = matching_tool.func(**tool_args)
                                tool_results.append({"tool": tool_name, "args": tool_args, "result": result})
                            except Exception as tool_exc:
                                logger.warning("TOOL_ERR tool=%s err=%s", tool_name, tool_exc)

                    if tool_results:
                        tool_context = "\n\n**Tool Results:**\n" + "\n".join(
                            f"- {tr['tool']}{tr['args']}: {tr['result']}"
                            for tr in tool_results
                        )
                        messages.append(HumanMessage(content=tool_context))
            except Exception as tool_phase_exc:
                logger.warning(
                    "TOOL_PHASE_ERR stakeholder=%s err=%s",
                    self.stakeholder.id,
                    tool_phase_exc,
                )

        # ── Phase 2: primary structured-output call ───────────────────────
        response: AgentResponse | None = None
        last_exc: Exception | None = None
        last_raw: str = ""

        try:
            raw_response = self.llm.invoke(messages)
            if isinstance(raw_response, AgentResponse):
                response = raw_response
            elif isinstance(raw_response, dict):
                response = AgentResponse.model_validate(raw_response)
            else:
                last_raw = raw_response if isinstance(raw_response, str) else str(raw_response)
                extracted = self._extract_json_from_text(last_raw)
                if extracted:
                    response = AgentResponse.model_validate(extracted)
                else:
                    # Treat as prose content directly
                    response = AgentResponse(
                        content=last_raw[:1500],
                        internal_reasoning="",
                        action_type="statement",
                        emotional_tone="neutral",
                    )
        except Exception as exc:
            last_exc = exc
            last_raw = str(exc)
            logger.warning(
                "STRUCTURED_OUT_FAIL_1 stakeholder=%s turn=%d err=%s",
                self.stakeholder.id,
                turn_index,
                type(exc).__name__,
            )

        # ── Phase 3: 1 targeted retry with error context ──────────────────
        if response is None:
            repair_prompt = (
                "Your previous response could not be parsed as valid JSON. "
                f"The error was: {type(last_exc).__name__}. "
                "Return ONLY a valid JSON object matching the required schema. "
                "No prose, no markdown fences, no explanation."
            )
            retry_messages = messages + [HumanMessage(content=repair_prompt)]
            try:
                raw_retry = self.llm.invoke(retry_messages)
                if isinstance(raw_retry, AgentResponse):
                    response = raw_retry
                elif isinstance(raw_retry, dict):
                    response = AgentResponse.model_validate(raw_retry)
                else:
                    raw_text = raw_retry if isinstance(raw_retry, str) else str(raw_retry)
                    extracted = self._extract_json_from_text(raw_text)
                    if extracted:
                        response = AgentResponse.model_validate(extracted)
                    else:
                        last_raw = raw_text
                logger.info(
                    "STRUCTURED_OUT_RETRY_OK stakeholder=%s turn=%d",
                    self.stakeholder.id,
                    turn_index,
                )
            except Exception as retry_exc:
                last_exc = retry_exc
                logger.warning(
                    "STRUCTURED_OUT_FAIL_2 stakeholder=%s turn=%d err=%s — using soft fallback",
                    self.stakeholder.id,
                    turn_index,
                    type(retry_exc).__name__,
                )

        # ── Phase 4: soft-fallback (never raises) ─────────────────────────
        if response is None:
            response = self._safe_fallback_response(last_raw, last_exc or Exception("parse"), turn_index)

        response.tool_calls = tool_results
        self.positions.append(response.content[:100])
        return response


def create_agent_for_stakeholder(
    stakeholder: Stakeholder,
    openrouter_api_key: str,
    model: str = "anthropic/claude-sonnet-4"
) -> BoardroomAgent:
    """
    Factory: create a BoardroomAgent with tools determined by stakeholder.tool_profile.

    tool_profile values → tool set:
      financial  → CFO financial tools
      legal      → compliance / clause tools
      technical  → tech stack / integration tools
      comms      → (no tools yet; profile reserved for future comms tools)
      none       → no tools
    """
    import os
    os.environ["OPENAI_API_KEY"] = openrouter_api_key

    llm = ChatOpenAI(
        model=model,
        api_key=openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.7,
        max_tokens=config.MAX_OUTPUT_TOKENS,
    )

    profile = (stakeholder.tool_profile or "none").lower()

    _profile_to_registry_key = {
        "financial": "cfo",
        "legal": "legal",
        "technical": "cto",
        "comms": None,   # reserved — no tools implemented yet
        "none": None,
    }

    registry_key = _profile_to_registry_key.get(profile)
    tools = convert_tools_to_langchain(registry_key) if registry_key else []

    return BoardroomAgent(
        stakeholder=stakeholder,
        llm_base=llm,
        tools=tools
    )
