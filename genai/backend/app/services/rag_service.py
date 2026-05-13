import os
import hashlib
from typing import List, Dict

import chromadb

CHROMA_PATH     = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../chroma_db"))
COLLECTION_NAME = "de_codebase"

_client     = None
_collection = None
_embedder   = None

os.makedirs(CHROMA_PATH, exist_ok=True)


def _get_embedder():
    global _embedder
    if _embedder is None:
        print("[RAG] Loading sentence-transformer model...", flush=True)
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
        print("[RAG] Embedder ready.", flush=True)
    return _embedder


def _get_client():
    global _client, _collection
    if _client is None:
        print(f"[RAG] Connecting to ChromaDB at {CHROMA_PATH}", flush=True)
        try:
            _client = chromadb.PersistentClient(path=CHROMA_PATH)
        except Exception as e:
            print(f"[RAG] ChromaDB init failed ({e}), wiping and retrying...", flush=True)
            import shutil
            shutil.rmtree(CHROMA_PATH, ignore_errors=True)
            os.makedirs(CHROMA_PATH, exist_ok=True)
            _client = chromadb.PersistentClient(path=CHROMA_PATH)
            _collection = None
    return _client


def _get_collection(reset: bool = False):
    """
    FIX: When reset=True (called at start of every new ingestion):
      1. Invalidate the module-level _collection reference immediately.
      2. Delete the collection from ChromaDB.
      3. Recreate it fresh.

    Previously _collection could be non-None from the last ingestion,
    causing delete_collection to be skipped or the old reference to be
    reused, leaving old vectors in place.
    """
    global _collection
    client = _get_client()

    if reset:
        # Always clear the cached reference first
        _collection = None
        try:
            client.delete_collection(COLLECTION_NAME)
            print("[RAG] Existing collection deleted — starting fresh.", flush=True)
        except Exception:
            # Collection didn't exist yet — that's fine
            pass

    if _collection is None:
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def _chunk_code(content: str, file_path: str, chunk_size: int = 400) -> List[Dict]:
    chunks = []
    lines  = content.split("\n")
    current: List[str] = []
    current_len = 0
    chunk_idx   = 0
    for line in lines:
        current.append(line)
        current_len += len(line)
        if current_len >= chunk_size:
            text = "\n".join(current).strip()
            if text:
                chunks.append({"text": text, "metadata": {
                    "file": file_path, "chunk": chunk_idx,
                    "type": _detect_type(file_path),
                }})
            current = []; current_len = 0; chunk_idx += 1
    if current:
        text = "\n".join(current).strip()
        if text:
            chunks.append({"text": text, "metadata": {
                "file": file_path, "chunk": chunk_idx,
                "type": _detect_type(file_path),
            }})
    return chunks


def _detect_type(path: str) -> str:
    if path.endswith(".py"):            return "python"
    if path.endswith(".sql"):           return "sql"
    if path.endswith((".yml",".yaml")): return "yaml"
    if path.endswith(".md"):            return "markdown"
    return "text"


def ingest_chunks(chunks: List[Dict], reset: bool = False) -> None:
    from app.services.progress_service import set_progress

    # reset=True always passed from repo.py — this wipes the old collection first
    col      = _get_collection(reset=reset)
    embedder = _get_embedder()
    texts     = [c["text"]     for c in chunks]
    metadatas = [c["metadata"] for c in chunks]
    ids = [
        hashlib.md5(f"{m['file']}:{m['chunk']}".encode()).hexdigest()
        for m in metadatas
    ]

    batch_size    = 64
    total_batches = max(1, (len(texts) + batch_size - 1) // batch_size)
    print(f"[RAG] Embedding {len(texts)} chunks in {total_batches} batches...", flush=True)

    for batch_num, i in enumerate(range(0, len(texts), batch_size), 1):
        bt = texts[i:i+batch_size]
        bm = metadatas[i:i+batch_size]
        bi = ids[i:i+batch_size]
        embeddings = embedder.encode(bt).tolist()
        col.upsert(documents=bt, metadatas=bm, ids=bi, embeddings=embeddings)
        set_progress("embedding", batch_num, total_batches,
                     f"Batch {batch_num}/{total_batches} ({len(bt)} chunks)")

    print(f"\n[RAG] Done. Collection size: {col.count()}", flush=True)


def query_similar(query: str, top_k: int = 5) -> List[Dict]:
    col   = _get_collection()
    count = col.count()
    if count == 0:
        return []
    embedder = _get_embedder()
    q_emb    = embedder.encode([query]).tolist()
    results  = col.query(query_embeddings=q_emb, n_results=min(top_k, count))
    docs  = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    return [{"text": d, "metadata": m} for d, m in zip(docs, metas)]


def collection_count() -> int:
    try:
        return _get_collection().count()
    except Exception:
        return 0