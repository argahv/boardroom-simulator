from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
import hashlib
from typing import Any, Dict, List, Optional

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
    
    def _get_collection_name(self, simulation_id: str, agent_id: str) -> str:
        """Generate collection name for agent-specific memory."""
        hash_id = hashlib.md5(f"{simulation_id}_{agent_id}".encode()).hexdigest()[:16]
        return f"sim_{hash_id}"
    
    def get_or_create_collection(self, simulation_id: str, agent_id: str) -> chromadb.Collection:
        """Get or create a Chroma collection for this agent's memory."""
        collection_name = self._get_collection_name(simulation_id, agent_id)
        
        if collection_name in self.collections:
            return self.collections[collection_name]
        
        try:
            collection = self.client.get_collection(
                name=collection_name,
                embedding_function=self.embedding_fn
            )
        except Exception:
            collection = self.client.create_collection(
                name=collection_name,
                metadata={"simulation_id": simulation_id, "agent_id": agent_id},
                embedding_function=self.embedding_fn
            )
        
        self.collections[collection_name] = collection
        return collection
    
    def store_turn(
        self,
        simulation_id: str,
        agent_id: str,
        turn_index: int,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Store a negotiation turn in agent's memory."""
        collection = self.get_or_create_collection(simulation_id, agent_id)
        
        doc_id = f"turn_{turn_index}_{agent_id}"

        doc_metadata = {
            "simulation_id": simulation_id,
            "agent_id": agent_id,
            "turn_index": turn_index,
            **(metadata or {})
        }

        collection.add(
            documents=[content],
            metadatas=[doc_metadata],
            ids=[doc_id]
        )
    
    def retrieve_relevant_context(
        self,
        simulation_id: str,
        agent_id: str,
        query: str,
        n_results: int = 5
    ) -> List[Dict[str, Any]]:
        """Retrieve semantically similar past turns for context."""
        collection = self.get_or_create_collection(simulation_id, agent_id)
        
        if collection.count() == 0:
            return []
        
        results = collection.query(
            query_texts=[query],
            n_results=min(n_results, collection.count())
        )
        
        retrieved = []
        if results['documents']:
            for i, doc in enumerate(results['documents'][0]):
                retrieved.append({
                    "content": doc,
                    "metadata": results['metadatas'][0][i],
                    "distance": results['distances'][0][i] if 'distances' in results else None
                })
        
        return retrieved
    
    def get_agent_timeline(
        self,
        simulation_id: str,
        agent_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get chronological timeline of agent's turns."""
        collection = self.get_or_create_collection(simulation_id, agent_id)
        
        if collection.count() == 0:
            return []
        
        results = collection.get(
            limit=limit,
            include=["documents", "metadatas"]
        )
        
        timeline = []
        if results['documents']:
            for i, doc in enumerate(results['documents']):
                timeline.append({
                    "content": doc,
                    "metadata": results['metadatas'][i]
                })
        
        timeline.sort(key=lambda x: x['metadata'].get('turn_index', 0))
        
        return timeline
    
    def clear_simulation_memory(self, simulation_id: str):
        """Clear all agent memories for a simulation."""
        for collection_name in list(self.collections.keys()):
            collection = self.collections[collection_name]
            metadata = collection.metadata or {}
            
            if metadata.get('simulation_id') == simulation_id:
                self.client.delete_collection(collection_name)
                del self.collections[collection_name]


_memory_instance: Optional[NegotiationMemory] = None


def get_memory(persist_directory: str = "./chroma_db", openrouter_api_key: str = "") -> NegotiationMemory:
    """Singleton accessor for memory instance."""
    global _memory_instance
    
    if _memory_instance is None:
        _memory_instance = NegotiationMemory(
            persist_directory=persist_directory,
            openrouter_api_key=openrouter_api_key
        )
    
    return _memory_instance
