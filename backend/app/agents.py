from typing import List, Dict, Any, Optional, TypedDict
import json

from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool as langchain_tool
from langchain_openai import ChatOpenAI

from app.tools import (
    calculate_roi, check_financials, calculate_burn_rate,
    query_clause, compliance_check,
    assess_tech_stack, check_integration,
    TOOL_REGISTRY
)
from app.models import Stakeholder, ActionType


class AgentResponse(BaseModel):
    content: str = Field(description="The agent's spoken statement in the negotiation")
    internal_reasoning: str = Field(description="Private reasoning the agent used to formulate response")
    action_type: ActionType = Field(description="Type of action being taken")
    directed_at: Optional[str] = Field(None, description="Stakeholder ID this turn is addressed to")
    coalition_with: Optional[str] = Field(None, description="Stakeholder ID forming coalition with")
    emotional_tone: str = Field(default="neutral", description="Emotional tone: tense, neutral, heated, conciliatory")
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
        """Build persona-specific system prompt."""
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

**Your Memory (key positions you've taken):**
{chr(10).join(f"- {pos}" for pos in self.positions) if self.positions else "No positions stated yet"}

**Your Concessions So Far:**
{chr(10).join(f"- {conc}" for conc in self.concessions) if self.concessions else "No concessions made"}

**Your Red Lines:**
{chr(10).join(f"- {red}" for red in self.red_lines) if self.red_lines else "No hard boundaries stated"}

**Available Tools:**
{chr(10).join(f"- {tool.name}: {tool.description}" for tool in self.tools) if self.tools else "No tools available"}

**Your Mission:**
Advance your agenda while appearing reasonable. Use data from your tools to bolster arguments.
Be strategic: know when to push, when to compromise, when to form coalitions.

**Response Guidelines:**
1. Stay in character - your role, focus, and incentive level guide your behavior
2. Use tools when you need factual data to support your position
3. Track what others have said - reference their positions when strategic
4. Be specific and actionable - vague statements reduce your leverage
5. Adapt tone based on voltage and negotiation dynamics

Remember: You're not just stating positions - you're negotiating outcomes."""
    
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
    
    def invoke(self, state: AgentState) -> AgentResponse:
        """
        Generate agent response for current turn.
        
        Flow:
        1. If agent has tools, invoke LLM with tool binding first
        2. Let LLM call tools if needed
        3. Inject tool results back into context
        4. Generate final structured response
        """
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
            HumanMessage(content=user_prompt)
        ]
        
        tool_results = []
        
        if self.llm_with_tools:
            tool_response = self.llm_with_tools.invoke(messages)
            
            if hasattr(tool_response, 'tool_calls') and tool_response.tool_calls:
                for tool_call in tool_response.tool_calls:
                    tool_name = tool_call['name']
                    tool_args = tool_call['args']
                    
                    matching_tool = next((t for t in self.tools if t.name == tool_name), None)
                    if matching_tool:
                        result = matching_tool.func(**tool_args)
                        tool_results.append({
                            "tool": tool_name,
                            "args": tool_args,
                            "result": result
                        })
                
                if tool_results:
                    tool_context = "\n\n**Tool Results:**\n" + "\n".join(
                        f"- {tr['tool']}{tr['args']}: {tr['result']}"
                        for tr in tool_results
                    )
                    messages.append(HumanMessage(content=tool_context))
        
        try:
            raw_response = self.llm.invoke(messages)
            if isinstance(raw_response, AgentResponse):
                response = raw_response
            elif isinstance(raw_response, dict):
                response = AgentResponse.model_validate(raw_response)
            else:
                content_text = raw_response if isinstance(raw_response, str) else str(raw_response)
                parsed = None
                if isinstance(content_text, str):
                    stripped = content_text.strip()
                    if stripped.startswith("{") and stripped.endswith("}"):
                        try:
                            parsed = json.loads(stripped)
                        except json.JSONDecodeError:
                            parsed = None
                if isinstance(parsed, dict):
                    response = AgentResponse.model_validate(parsed)
                else:
                    response = AgentResponse(
                        content=content_text,
                        internal_reasoning="",
                        action_type="statement",
                        emotional_tone="neutral",
                    )
        except Exception as e:
            # structured output failed — fall back to plain LLM call
            plain_response = self.llm_base.invoke(messages)
            content_text = plain_response.content if hasattr(plain_response, 'content') else str(plain_response)
            response = AgentResponse(
                content=content_text,
                internal_reasoning="",
                action_type="statement",
                emotional_tone="neutral",
            )

        response.tool_calls = tool_results

        self.positions.append(response.content[:100])

        return response


def create_agent_for_stakeholder(
    stakeholder: Stakeholder,
    openrouter_api_key: str,
    model: str = "anthropic/claude-sonnet-4"
) -> BoardroomAgent:
    """
    Factory function to create a BoardroomAgent with appropriate tools.
    
    Assigns tools based on role:
    - CFO roles get financial tools
    - Legal roles get compliance tools  
    - CTO/Technical roles get tech assessment tools
    - Others get no tools (rely on reasoning only)
    """
    import os
    os.environ["OPENAI_API_KEY"] = openrouter_api_key
    
    llm = ChatOpenAI(
        model=model,
        api_key=openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0.7
    )
    
    role_lower = stakeholder.role.lower()
    
    if "cfo" in role_lower or "finance" in role_lower or "financial" in role_lower:
        tools = convert_tools_to_langchain("cfo")
    elif "legal" in role_lower or "counsel" in role_lower or "compliance" in role_lower:
        tools = convert_tools_to_langchain("legal")
    elif "cto" in role_lower or "technical" in role_lower or "engineer" in role_lower or "tech" in role_lower:
        tools = convert_tools_to_langchain("cto")
    else:
        tools = []
    
    return BoardroomAgent(
        stakeholder=stakeholder,
        llm_base=llm,
        tools=tools
    )
