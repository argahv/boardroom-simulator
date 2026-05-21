from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
import hashlib

from . import config


class NegotiationMemory:

    def __init__(self, persist_directory: str = "./chroma_db", openrouter_api_key: str = ""):
        self.client = chromadb.Client(Settings(
            persist_directory=persist_directory,
            anonymized_telemetry=False
        ))

        api_key = openrouter_api_key or config.OPENROUTER_API_KEY
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is required for vector embeddings")

        self.embedding_fn = OpenAIEmbeddingFunction(
            api_key=api_key,
            api_base=config.OPENROUTER_BASE_URL,
            model_name=config.OPENROUTER_EMBEDDING_MODEL,
        )

        self.collections: Dict[str, chromadb.Collection] = {}

    # ------------------------------------------------------------------
    # Collection helpers
    # ------------------------------------------------------------------

    def _agent_collection_name(self, simulation_id: str, agent_id: str) -> str:
        h = hashlib.md5(f"{simulation_id}_{agent_id}".encode()).hexdigest()[:16]
        return f"agent_{h}"

    def _sim_collection_name(self, simulation_id: str) -> str:
        """Shared collection for all agents in a simulation (cross-agent memory)."""
        h = hashlib.md5(simulation_id.encode()).hexdigest()[:16]
        return f"sim_{h}"

    def _get_or_create(self, name: str, metadata: Optional[Dict] = None) -> chromadb.Collection:
        if name in self.collections:
            return self.collections[name]
        try:
            col = self.client.get_collection(name=name, embedding_function=self.embedding_fn)
        except Exception:
            col = self.client.create_collection(
                name=name,
                metadata=metadata or {},
                embedding_function=self.embedding_fn,
            )
        self.collections[name] = col
        return col

    def _agent_collection(self, simulation_id: str, agent_id: str) -> chromadb.Collection:
        return self._get_or_create(
            self._agent_collection_name(simulation_id, agent_id),
            {"simulation_id": simulation_id, "agent_id": agent_id, "type": "agent"},
        )

    def _sim_collection(self, simulation_id: str) -> chromadb.Collection:
        return self._get_or_create(
            self._sim_collection_name(simulation_id),
            {"simulation_id": simulation_id, "type": "shared"},
        )

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def store_turn(
        self,
        simulation_id: str,
        agent_id: str,
        turn_index: int,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Write turn to both:
        1. Per-agent collection  — agent retrieves its own history
        2. Shared sim collection — any agent can retrieve what others said
        """
        doc_id = f"turn_{turn_index}_{agent_id}"
        meta = {
            "simulation_id": simulation_id,
            "agent_id": agent_id,
            "turn_index": turn_index,
            **(metadata or {}),
        }
        # Ensure all metadata values are chromadb-safe (str/int/float/bool)
        safe_meta = {k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool))}

        # Per-agent
        agent_col = self._agent_collection(simulation_id, agent_id)
        agent_col.add(documents=[content], metadatas=[safe_meta], ids=[doc_id])

        # Shared sim collection — same doc, same id to avoid duplicates
        sim_col = self._sim_collection(simulation_id)
        try:
            sim_col.add(documents=[content], metadatas=[safe_meta], ids=[doc_id])
        except Exception:
            # Already exists (idempotent re-run); ignore
            pass

    # ------------------------------------------------------------------
    # Read: own history
    # ------------------------------------------------------------------

    def retrieve_relevant_context(
        self,
        simulation_id: str,
        agent_id: str,
        query: str,
        n_results: int = 5,
    ) -> List[Dict[str, Any]]:
        """Semantically retrieve this agent's own past turns."""
        col = self._agent_collection(simulation_id, agent_id)
        if col.count() == 0:
            return []

        results = col.query(
            query_texts=[query],
            n_results=min(n_results, col.count()),
        )
        return self._unpack_results(results)

    # ------------------------------------------------------------------
    # Read: cross-agent (gap 2 fix)
    # ------------------------------------------------------------------

    def retrieve_cross_agent_context(
        self,
        simulation_id: str,
        query: str,
        exclude_agent_id: str,
        n_results: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Query the shared simulation collection for what OTHER agents said
        about a topic.  Excludes the calling agent's own turns so the
        agent isn't just re-reading its own voice.
        """
        col = self._sim_collection(simulation_id)
        if col.count() == 0:
            return []

        # Fetch more than needed so we can filter out own turns
        fetch = min(n_results * 3, col.count())
        results = col.query(query_texts=[query], n_results=fetch)

        unpacked = self._unpack_results(results)
        filtered = [
            r for r in unpacked
            if r.get("metadata", {}).get("agent_id") != exclude_agent_id
        ]
        return filtered[:n_results]

    # ------------------------------------------------------------------
    # Read: timeline
    # ------------------------------------------------------------------

    def get_agent_timeline(
        self,
        simulation_id: str,
        agent_id: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        col = self._agent_collection(simulation_id, agent_id)
        if col.count() == 0:
            return []
        results = col.get(limit=limit, include=["documents", "metadatas"])
        timeline = [
            {"content": doc, "metadata": results["metadatas"][i]}
            for i, doc in enumerate(results["documents"])
        ]
        timeline.sort(key=lambda x: x["metadata"].get("turn_index", 0))
        return timeline

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def clear_simulation_memory(self, simulation_id: str) -> None:
        agent_name_prefix = hashlib.md5(simulation_id.encode()).hexdigest()[:16]
        for name in list(self.collections.keys()):
            if agent_name_prefix in name:
                self.client.delete_collection(name)
                del self.collections[name]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _unpack_results(results: Dict) -> List[Dict[str, Any]]:
        out = []
        docs = results.get("documents") or []
        metas = results.get("metadatas") or []
        distances = results.get("distances") or []
        if docs:
            for i, doc in enumerate(docs[0]):
                out.append({
                    "content": doc,
                    "metadata": metas[0][i] if metas else {},
                    "distance": distances[0][i] if distances else None,
                })
        return out


_memory_instance: Optional[NegotiationMemory] = None


def get_memory(persist_directory: str = "./chroma_db", openrouter_api_key: str = "") -> NegotiationMemory:
    global _memory_instance
    if _memory_instance is None:
        _memory_instance = NegotiationMemory(
            persist_directory=persist_directory,
            openrouter_api_key=openrouter_api_key,
        )
    return _memory_instance
