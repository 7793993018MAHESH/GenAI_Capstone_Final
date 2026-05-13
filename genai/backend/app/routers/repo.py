import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.schemas import LoadRepoRequest, APIResponse
from app.utils.response import ok, err
from app.services import repo_service, rag_service
from app.services.progress_service import get_progress, reset_progress

router = APIRouter()


@router.post("/load-repo", response_model=APIResponse)
async def load_repo(req: LoadRepoRequest):
    reset_progress()
    try:
        print(f"\n[API] POST /load-repo  url={req.repo_url}  branch={req.branch}", flush=True)
        print(f"[API] Progress reset — SSE stream is live", flush=True)

        # Blocking parse runs in thread — does not block event loop
        result = await asyncio.to_thread(
            repo_service.clone_and_parse, req.repo_url, req.branch
        )
        chunks = result.pop("chunks", [])

        # FIX: embedding failure is NON-FATAL.
        # SQLite (catalog + lineage) is already saved inside clone_and_parse.
        # If ChromaDB fails, catalog/lineage/health all still work.
        # Only RAG chat answers will be context-free until the issue resolves.
        if chunks:
            print(f"[API] Starting embedding for {len(chunks)} chunks...", flush=True)
            try:
                await asyncio.to_thread(rag_service.ingest_chunks, chunks, True)
                print("[API] Embedding complete.", flush=True)
            except Exception as embed_err:
                print(
                    f"[API] ⚠ Embedding failed: {embed_err}\n"
                    f"[API] Catalog / Lineage / Health still work. "
                    f"Chat will answer without code context.",
                    flush=True
                )
                # Don't re-raise — return success so the frontend
                # shows the loaded repo and enables all other tabs

        msg = (
            f"Repo loaded: {result['files_processed']} files, "
            f"{result['chunks_indexed']} chunks, "
            f"{result['tables_found']} tables, "
            f"{result['lineage_edges']} lineage edges"
        )
        print(f"[API] {msg}", flush=True)
        return ok(data=result, message=msg)

    except Exception as e:
        print(f"[API] /load-repo ERROR: {e}", flush=True)
        return err(message=str(e))


@router.get("/repo-progress")
async def repo_progress():
    async def generator():
        await asyncio.sleep(0.3)
        seen_active = False
        while True:
            progress = get_progress()
            yield f"data: {json.dumps(progress)}\n\n"
            if progress.get("done"):
                if seen_active:
                    break
            else:
                seen_active = True
            await asyncio.sleep(0.3)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )