"""Tavily web research service for persona knowledge growth."""

from __future__ import annotations

import logging
from typing import Any

from app.config import TAVILY_API_KEY
from app.knowledge import get_knowledge_store

logger = logging.getLogger("boardroom.research")


class TavilyResearchService:
    """Research topics via Tavily API and store results as persona knowledge."""

    def __init__(self) -> None:
        self._api_key = TAVILY_API_KEY

    async def research_topic(
        self, persona_id: str, topic: str, max_results: int = 5
    ) -> list[dict[str, Any]]:
        """Research a topic via Tavily, store results in Chroma, return structured results."""
        if not self._api_key:
            logger.info("TAVILY_API_KEY not set — skipping research for %s", topic)
            return []

        try:
            from tavily import TavilyClient

            client = TavilyClient(api_key=self._api_key)
            response = client.search(
                query=topic,
                search_depth="basic",
                max_results=max_results,
            )
            results = response.get("results", [])
        except ImportError:
            logger.warning("tavily-python not installed — skipping research")
            return []
        except Exception as exc:
            logger.warning("Tavily research failed for '%s': %s", topic, exc)
            return []

        # Store each result in Chroma
        ks = get_knowledge_store()
        for i, result in enumerate(results):
            title = result.get("title", "")
            content = result.get("content", "")
            url = result.get("url", "")
            text = f"Title: {title}\nSource: {url}\n\n{content}"
            doc_id = f"research_{persona_id}_{hash(topic) % 10000}_{i}"
            try:
                await ks.add_document(
                    persona_id=persona_id,
                    doc_id=doc_id,
                    text=text,
                    metadata={
                        "filename": f"research_{topic[:30]}_{i}.txt",
                        "source_type": "research",
                        "url": url,
                        "title": title,
                        "topic": topic,
                    },
                )
            except Exception as exc:
                logger.warning(
                    "Failed to store research result %d for %s: %s", i, persona_id, exc
                )

        logger.info(
            "Research completed for persona=%s topic='%s' results=%d",
            persona_id,
            topic,
            len(results),
        )
        return results

    async def research_subject(
        self, persona_id: str, subject: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Research a simulation subject by combining name + description into a query."""
        name = subject.get("name", "")
        description = subject.get("description", "")
        query_parts = [name]
        if description:
            query_parts.append(description)
        query = " — ".join(query_parts)
        if not query.strip():
            logger.warning("Empty subject for persona %s — skipping research", persona_id)
            return []
        return await self.research_topic(persona_id, query, max_results=5)
