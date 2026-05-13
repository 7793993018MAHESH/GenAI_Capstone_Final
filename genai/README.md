# 🤖 Data Engineering AI Assistant

A fully offline AI assistant for data engineering teams.
Powered by **Ollama** (local LLM), **FastAPI**, **ChromaDB** (RAG), and a **React** frontend.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.ai) installed

### 1 — Start Ollama
```bash
ollama pull llama3          # ~4 GB
ollama pull nomic-embed-text # for embeddings (optional)
ollama serve
```

### 2 — Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
./start.sh
# → http://localhost:8000/docs
```

### 3 — Frontend
```bash
cd frontend
npm install
./start.sh
# → http://localhost:3000
```

### 4 — Load a repo and start chatting
Paste a public GitHub URL into the top bar → click **Load Repo**.
Watch the **live progress bar** and terminal output as files are indexed.

---

## 🐛 Bug Fixes Applied (vs original setup.sh)

| # | File | Fix |
|---|------|-----|
| 1 | `setup.sh` | `set -euo pipefail` + `trap ERR` with line number |
| 2 | `setup.sh` | Dependency checks: python3 ≥3.10, node ≥18, npm, git |
| 3 | `setup.sh` | Section/step terminal logging throughout |
| 4 | `routers/repo.py` | `asyncio.to_thread()` wraps blocking `clone_and_parse` + `ingest_chunks` |
| 5 | `services/progress_service.py` | **New module** — real-time ingestion % in terminal + SSE |
| 5b| `routers/repo.py` | `GET /repo-progress` SSE endpoint added |
| 6 | `services/rag_service.py` | Empty collection guard: returns `[]` before calling `col.query()` |
| 7 | `services/repo_service.py` | `_chunk_code` import moved out of `os.walk` loop |
| 8 | `hooks/useChat.js` | React 18 batching race condition: `msgId` replaces array index ref |
| 9 | `services/api.js` | `repoProgressStream()` SSE helper added |
| 10| `components/Layout/Topbar.jsx` | Live progress bar + stage label + % during ingestion |
| 11| `components/Chat/ChatPage.jsx` | Syntax highlighter: `/dist/esm/` → `/dist/cjs/` for Vite compat |

---

## 📊 Ingestion Progress

### Terminal
```
[INGEST] Starting ingestion...
[REPO] Found 47 eligible files
[INGEST] [████████░░░░░░░░░░░░░░░░░] 32% | parsing    | dags/etl_pipeline.py
[INGEST] [████████████████░░░░░░░░░] 64% | parsing    | sql/transforms/orders.sql
[INGEST] [████████████████████████░] 96% | embedding  | Batch 5/6 (100 chunks)
[INGEST] [█████████████████████████] 100% | done      | 47 files · 312 chunks · 18 tables
```

### Website (Topbar)
- Colour-coded progress bar slides across the header bottom border
- Stage label + percentage shown inline next to the Load Repo button
- Fades automatically 2.5 s after completion

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/load-repo` | Clone & index a repo (non-blocking) |
| `GET`  | `/repo-progress` | SSE stream: ingestion progress |
| `POST` | `/chat` | Single-shot chat |
| `POST` | `/chat/stream` | Streaming chat (SSE) |
| `GET`  | `/tables` | Data catalog |
| `GET`  | `/lineage` | Lineage DAG |
| `GET`  | `/health` | Pipeline health |
| `GET`  | `/slo` | SLO metrics |
| `POST` | `/trigger-check` | Quality check |
| `GET`  | `/mcp/tools` | MCP tool definitions |
