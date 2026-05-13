from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, APIResponse
from app.utils.response import ok, err
from app.services import rag_service, ollama_service
import json

router = APIRouter()

def _build_prompt(message: str, context_chunks: list, history: list) -> str:
    history_text = ""
    for h in history[-4:]:
        history_text += f"\n{h['role'].upper()}: {h['content']}"

    if context_chunks:
        ctx_text = "\n---\n".join(
            [f"[{c['metadata'].get('file','?')}]\n{c['text']}" for c in context_chunks[:3]]
        )
        context_section = f"RELEVANT CODEBASE CONTEXT:\n{ctx_text}\n\n"
    else:
        context_section = ""

    history_section = f"CONVERSATION HISTORY:{history_text}\n\n" if history_text.strip() else ""

    return f"""{context_section}{history_section}USER: {message}

A:"""

@router.get("/ollama-health", response_model=APIResponse)
async def ollama_health():
    result = await ollama_service.check_ollama_health()
    if result["ok"]:
        return ok(data=result, message="Ollama is running")
    return err(message=f"Ollama not reachable: {result.get('error','unknown')}")

@router.post("/chat", response_model=APIResponse)
async def chat(req: ChatRequest):
    try:
        chunks = rag_service.query_similar(req.message, top_k=5)
        prompt = _build_prompt(req.message, chunks, req.history or [])
        response = await ollama_service.generate(prompt)
        return ok(data={
            "response": response,
            "sources": [
                {"file": c["metadata"].get("file", "?"), "type": c["metadata"].get("type", "?")}
                for c in chunks
            ],
        }, message="")
    except Exception as e:
        return err(message=f"LLM error: {str(e)}")

@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    chunks = rag_service.query_similar(req.message, top_k=5)
    prompt = _build_prompt(req.message, chunks, req.history or [])
    async def event_generator():
        try:
            async for token in ollama_service.stream_generate(prompt):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")