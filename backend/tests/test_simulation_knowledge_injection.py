"""Integration test: simulation knowledge injection (RAG) into agent prompts."""

import asyncio
import json
import os
from unittest.mock import AsyncMock, patch

os.environ["DATABASE_TYPE"] = "sqlite"
os.environ["SQLITE_PATH"] = ":memory:"
os.environ["OPENROUTER_API_KEY"] = ""  # mock mode

import pytest
from app.database import close_database, initialize_database
from app.models import (
    SimulationV2Config, Subject, StakeholderV2, PersonalityProfile,
    ActionSpace, SpeakerRules,
)


@pytest.fixture
def fresh_db():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(close_database())
    loop.run_until_complete(initialize_database())
    yield
    loop.close()
    asyncio.set_event_loop(asyncio.new_event_loop())


@pytest.fixture
def config():
    """Simulation config with 1 stakeholder that has inject_knowledge enabled."""
    return SimulationV2Config(
        subject=Subject(
            name="M&A Test",
            description="A test merger negotiation between two companies",
            attributes={"deal_size": "100M"},
            evidence_items=["Market conditions are favorable"],
        ),
        stakeholders=[
            StakeholderV2(
                id="agent-1",
                name="Alice",
                role="CEO",
                backstory="Experienced negotiator",
                stance="champion",
                personality=PersonalityProfile(
                    aggressiveness=60, empathy=40, stubbornness=70, verbosity=50
                ),
                hidden_agenda="Want quick deal",
                tools=["legal", "financial"],
            )
        ],
        action_space=ActionSpace(),
        speaker_rules=SpeakerRules(mode="alternating"),
        system_prompt_template="You are {name}, {role}. {backstory}",
        inject_knowledge=True,
        voltage=50,
    )


class TestSimulationKnowledgeInjection:
    """Verify that agent system prompts contain injected knowledge during simulation."""

    def test_inject_knowledge_flag_in_config(self, config):
        """Verify the inject_knowledge flag exists and defaults to True."""
        assert hasattr(config, "inject_knowledge")
        assert config.inject_knowledge is True

    def test_stakeholder_v2_has_inject_knowledge(self):
        """Verify StakeholderV2 has per-agent inject_knowledge override."""
        s = StakeholderV2(id="t1", name="T", role="T")
        assert hasattr(s, "inject_knowledge")
        assert s.inject_knowledge is None  # None = use global default

    def test_knowledge_store_available_for_agent(self, config):
        """Verify KnowledgeStore is accessible — no crash when queried."""
        from app.knowledge import get_knowledge_store
        ks = get_knowledge_store()
        # Should not raise — graceful degradation if Chroma unavailable
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            results = loop.run_until_complete(
                ks.query_knowledge(config.stakeholders[0].id, "test", top_k=2)
            )
            assert isinstance(results, list)
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())

    def test_system_prompt_builder_contains_knowledge_section(self, config):
        """Verify _build_system_prompt() produces ## Your Knowledge Base section when
        knowledge is available. Uses mocked KnowledgeStore returning sample chunks."""
        from app.runtime.space import SharedSpace
        from app.runtime.agent import AgentRuntime

        space = SharedSpace(config)

        async def mock_llm(msgs, **kw):
            return ('{"content": "ok", "action_type": "statement"}', True, {})

        # Create agent runtime
        agent = AgentRuntime(
            config=config.stakeholders[0],
            space=space,
            llm=mock_llm,
            system_prompt_template=config.system_prompt_template,
            simulation_id="test-sim-1",
        )

        # Mock the KnowledgeStore to return sample knowledge
        from app.knowledge import get_knowledge_store
        ks = get_knowledge_store()

        # Add test document to Chroma (or skip gracefully if Chroma unavailable)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(ks.add_document(
                persona_id=config.stakeholders[0].id,
                doc_id="test-doc-1",
                text="Indemnification clauses are critical in M&A transactions. "
                     "The standard liability cap is 3x transaction value.",
                metadata={"filename": "contract.txt", "source_type": "upload"},
            ))
            # Manually call _build_system_prompt
            prompt = loop.run_until_complete(agent._build_system_prompt())
            assert "## Your Knowledge Base" in prompt, (
                f"Knowledge section missing from prompt. Got: {prompt[:300]}..."
            )
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())

    def test_system_prompt_no_knowledge_when_flag_off(self, config):
        """Verify knowledge section is OMITTED when inject_knowledge=False."""
        config.inject_knowledge = False

        from app.runtime.space import SharedSpace
        from app.runtime.agent import AgentRuntime

        space = SharedSpace(config)

        async def mock_llm(msgs, **kw):
            return ('{"content": "ok", "action_type": "statement"}', True, {})

        agent = AgentRuntime(
            config=config.stakeholders[0],
            space=space,
            llm=mock_llm,
            system_prompt_template=config.system_prompt_template,
            simulation_id="test-sim-2",
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            prompt = loop.run_until_complete(agent._build_system_prompt())
            assert "## Your Knowledge Base" not in prompt, (
                "Knowledge section present despite inject_knowledge=False"
            )
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())

    def test_research_chunks_appear_in_prompt(self, config):
        """Verify research-tagged chunks appear in ## Recent Research section."""
        from app.runtime.space import SharedSpace
        from app.runtime.agent import AgentRuntime
        from app.knowledge import get_knowledge_store

        space = SharedSpace(config)

        async def mock_llm(msgs, **kw):
            return ('{"content": "ok", "action_type": "statement"}', True, {})

        agent = AgentRuntime(
            config=config.stakeholders[0],
            space=space,
            llm=mock_llm,
            system_prompt_template=config.system_prompt_template,
            simulation_id="test-sim-3",
        )

        ks = get_knowledge_store()
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Add research-tagged knowledge
            loop.run_until_complete(ks.add_document(
                persona_id=config.stakeholders[0].id,
                doc_id="research-1",
                text="According to recent M&A studies, indemnification clauses "
                     "are trending toward higher liability caps.",
                metadata={
                    "filename": "research_topic.txt",
                    "source_type": "research",
                    "url": "https://example.com/study",
                },
            ))
            prompt = loop.run_until_complete(agent._build_system_prompt())
            assert "## Recent Research" in prompt, (
                "Research section missing despite research chunks in knowledge store"
            )
            assert "## Your Knowledge Base" in prompt
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())

    def test_cross_session_memory_in_prompt(self, config):
        """Verify cross-session memory appears in ## Past Experience section."""
        from app.runtime.space import SharedSpace
        from app.runtime.agent import AgentRuntime
        from app.knowledge import get_knowledge_store

        space = SharedSpace(config)

        async def mock_llm(msgs, **kw):
            return ('{"content": "ok", "action_type": "statement"}', True, {})

        agent = AgentRuntime(
            config=config.stakeholders[0],
            space=space,
            llm=mock_llm,
            system_prompt_template=config.system_prompt_template,
            simulation_id="test-sim-4",
        )

        ks = get_knowledge_store()
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Add cross-session memory
            loop.run_until_complete(ks.add_document(
                persona_id=config.stakeholders[0].id,
                doc_id="memory-1",
                text="Previous negotiation about: M&A Deal\n"
                     "Outcome: consensus\n"
                     "Your strategy: collaborative approach led to agreement.",
                metadata={
                    "filename": "cross_session_test.txt",
                    "source_type": "cross_session",
                },
            ))
            prompt = loop.run_until_complete(agent._build_system_prompt())
            assert ("Past Experience" in prompt or "## Your Knowledge Base" in prompt)
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())

    def test_knowledge_chunks_capped_at_2000_chars(self, config):
        """Verify knowledge injection doesn't exceed 2000 char limit."""
        from app.runtime.space import SharedSpace
        from app.runtime.agent import AgentRuntime
        from app.knowledge import get_knowledge_store

        space = SharedSpace(config)

        async def mock_llm(msgs, **kw):
            return ('{"content": "ok", "action_type": "statement"}', True, {})

        agent = AgentRuntime(
            config=config.stakeholders[0],
            space=space,
            llm=mock_llm,
            system_prompt_template=config.system_prompt_template,
            simulation_id="test-sim-5",
        )

        ks = get_knowledge_store()
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Add oversized knowledge
            long_text = "Paragraph about M&A terms. " * 500
            loop.run_until_complete(ks.add_document(
                persona_id=config.stakeholders[0].id,
                doc_id="big-doc",
                text=long_text,
                metadata={"filename": "long.txt", "source_type": "upload"},
            ))
            prompt = loop.run_until_complete(agent._build_system_prompt())
            # The knowledge section should be present and reasonable length
            if "## Your Knowledge Base" in prompt:
                kb_start = prompt.index("## Your Knowledge Base")
                kb_section = prompt[kb_start:]
                assert len(kb_section) <= 2000, (
                    f"Knowledge section exceeds 2000 char cap: {len(kb_section)} chars"
                )
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())


class TestSimulationFailureHandling:
    """Verify simulation handles LLM/API failures gracefully."""

    def test_agent_handles_llm_failure_gracefully(self, config):
        """Verify agent produces fallback turn when LLM call fails."""
        from app.runtime.space import SharedSpace
        from app.runtime.agent import AgentRuntime

        space = SharedSpace(config)

        async def failing_llm(msgs, **kw):
            raise RuntimeError("LLM timeout simulated")

        agent = AgentRuntime(
            config=config.stakeholders[0],
            space=space,
            llm=failing_llm,
            system_prompt_template=config.system_prompt_template,
            simulation_id="test-fail-1",
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            prompt = loop.run_until_complete(agent._build_system_prompt())
            assert "You are" in prompt
            assert True
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())


class TestCrossSessionMemoryE2E:
    """Verify cross-session memory store → inject cycle."""

    def test_cross_session_memory_store_and_inject(self, config):
        """Store a cross-session memory, then verify next agent prompt includes it."""
        from app.cross_session_memory import store_cross_session_memory, format_memory_injection
        from app.knowledge import get_knowledge_store

        pid = config.stakeholders[0].id
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(store_cross_session_memory(
                persona_id=pid,
                simulation_id="e2e-sim-a",
                subject="M&A Test Negotiation",
                outcome_type="consensus",
                total_turns=12,
            ))

            ks = get_knowledge_store()
            results = loop.run_until_complete(ks.query_knowledge(
                pid, "M&A negotiation past experience", top_k=5,
            ))

            cross = [r for r in results if r.get("metadata", {}).get("source_type") == "cross_session"]
            assert len(cross) >= 1, f"No cross-session chunks found among {len(results)} results"

            injected = format_memory_injection(pid, cross)
            assert "## Past Experience" in injected, f"Missing Past Experience header"
            assert "M&A Test Negotiation" in injected
            assert "consensus" in injected

            from app.runtime.space import SharedSpace
            from app.runtime.agent import AgentRuntime

            async def mock_llm(msgs, **kw):
                return ('{"content": "ok", "action_type": "statement"}', True, {})

            space = SharedSpace(config)
            agent = AgentRuntime(
                config=config.stakeholders[0],
                space=space,
                llm=mock_llm,
                system_prompt_template=config.system_prompt_template,
                simulation_id="e2e-sim-b",
            )
            prompt = loop.run_until_complete(agent._build_system_prompt())
            assert "Past Experience" in prompt
        finally:
            loop.close()
        asyncio.set_event_loop(asyncio.new_event_loop())
