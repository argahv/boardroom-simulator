import logging
import chromadb
from chromadb.config import Settings
from app.config import CHROMA_PERSIST_DIR, EMBEDDING_DIM

logger = logging.getLogger("boardroom.knowledge")


def _chunk_text(text: str, max_tokens: int = 512, overlap_tokens: int = 64) -> list[str]:
    """Split text into chunks by paragraphs, then merge up to max_tokens.
    Uses word-count heuristic: 1 token ≈ 0.75 words.
    """
    # Split by double newlines (paragraphs)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current_chunk = []
    current_words = 0
    max_words = int(max_tokens * 0.75)
    overlap_words = int(overlap_tokens * 0.75)

    for para in paragraphs:
        para_words = len(para.split())
        if current_words + para_words > max_words and current_chunk:
            chunks.append(" ".join(current_chunk))
            # Keep overlap words from the end
            overlap_text = " ".join(current_chunk)[-overlap_words * 5 :]  # ~5 chars per word
            current_chunk = [overlap_text] if overlap_text else []
            current_words = len(overlap_text.split()) if overlap_text else 0

        current_chunk.append(para)
        current_words += para_words

    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks


class KnowledgeStore:
    def __init__(self):
        self._client = None
        self._init_client()

    def _init_client(self):
        try:
            self._client = chromadb.PersistentClient(
                path=CHROMA_PERSIST_DIR,
                settings=Settings(anonymized_telemetry=False),
            )
        except Exception as exc:
            logger.warning("Chroma init failed — running without persistent storage: %s", exc)
            self._client = None

    def _get_or_create_collection(self, persona_id: str):
        """Get existing collection or create a new one for this persona."""
        if self._client is None:
            return None
        collection_name = f"persona_{persona_id}"
        try:
            return self._client.get_or_create_collection(name=collection_name)
        except Exception as exc:
            logger.warning("Chroma collection error for %s: %s", persona_id, exc)
            return None

    async def add_document(self, persona_id: str, doc_id: str, text: str, metadata: dict | None = None):
        """Chunk text → embed each chunk → store in Chroma collection."""
        from app.embeddings import embed_text

        collection = self._get_or_create_collection(persona_id)
        if collection is None:
            logger.warning("Chroma unavailable — skipping add for %s/%s", persona_id, doc_id)
            return

        chunks = _chunk_text(text)
        base_meta = {"persona_id": persona_id, "doc_id": doc_id, "source_type": "upload"}
        if metadata:
            base_meta.update(metadata)

        ids = []
        embeddings = []
        metadatas = []
        documents = []

        for i, chunk in enumerate(chunks):
            try:
                embedding = await embed_text(chunk)
                ids.append(f"{doc_id}_chunk_{i}")
                embeddings.append(embedding)
                meta = dict(base_meta)
                meta["chunk_index"] = i
                meta["filename"] = metadata.get("filename", "") if metadata else ""
                metadatas.append(meta)
                documents.append(chunk)
            except Exception as exc:
                logger.warning("Embedding failed for chunk %s/%d: %s", doc_id, i, exc)
                continue

        if not ids:
            return

        try:
            collection.add(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=documents,
            )
            logger.info("Stored %d chunks for doc %s (persona %s)", len(ids), doc_id, persona_id)
        except Exception as exc:
            logger.warning("Chroma add failed for %s: %s", doc_id, exc)

    async def query_knowledge(
        self, persona_id: str, query_text: str,
        top_k: int = 3, where: dict | None = None,
    ) -> list[dict]:
        """Embed query → Chroma similarity search → return top_k results.

        Args:
            persona_id: The persona UUID.
            query_text: Natural language query.
            top_k: Max results to return.
            where: Optional metadata filter dict (e.g. ``{"source_type": "research"}``).
        """
        from app.embeddings import embed_text

        collection = self._get_or_create_collection(persona_id)
        if collection is None:
            return []

        try:
            query_embedding = await embed_text(query_text)
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=min(top_k, 10),
                where=where,
            )
        except Exception as exc:
            logger.warning("Chroma query failed for %s: %s", persona_id, exc)
            return []

        if not results or not results.get("ids") or not results["ids"][0]:
            return []

        output = []
        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i] if results.get("metadatas") else {}
            doc_text = results["documents"][0][i] if results.get("documents") else ""
            distance = results["distances"][0][i] if results.get("distances") else 0.0
            output.append({
                "chunk_id": doc_id,
                "text": doc_text[:500],  # truncate for display
                "score": 1.0 - distance,
                "metadata": meta,
            })
        return output

    def delete_document(self, persona_id: str, doc_id: str):
        """Remove all chunks for a document from the persona's collection."""
        collection = self._get_or_create_collection(persona_id)
        if collection is None:
            return
        try:
            collection.delete(where={"doc_id": doc_id})
            logger.info("Deleted doc %s from persona %s Chroma collection", doc_id, persona_id)
        except Exception as exc:
            logger.warning("Chroma delete failed for %s/%s: %s", persona_id, doc_id, exc)

    def get_collection_stats(self, persona_id: str) -> dict:
        """Return document count and chunk count for a persona."""
        collection = self._get_or_create_collection(persona_id)
        if collection is None:
            return {"doc_count": 0, "chunk_count": 0}
        try:
            count = collection.count()
            return {"doc_count": count, "chunk_count": count}
        except Exception as exc:
            logger.warning("Chroma count failed for %s: %s", persona_id, exc)
            return {"doc_count": 0, "chunk_count": 0}


_store: KnowledgeStore | None = None


def get_knowledge_store() -> KnowledgeStore:
    global _store
    if _store is None:
        _store = KnowledgeStore()
    return _store
