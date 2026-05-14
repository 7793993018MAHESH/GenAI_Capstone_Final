🤖 DE AI Assistant
A Fully Offline, RAG-Powered Data Engineering Intelligence Platform
GenAI Capstone Project — Load any GitHub repository and instantly chat with your codebase, explore your data catalog, visualise lineage, monitor pipeline health, and run real data quality checks — all without sending a single byte to the cloud.

📌 Project Summary
Data engineers joining a new team spend weeks reading hundreds of SQL and Python files to understand what tables exist, how data flows, and what's broken. DE AI Assistant solves this with a local AI assistant that learns your private codebase in minutes and answers natural-language questions about it — fully offline, no API keys, no data leaving your machine.

You: "Which tables contain customer PII data?"
AI:  "Three tables contain PII: raw_customers (email, phone, dob, address),
      stg_customers (email_hash — masked), and mart_customer_ltv (no raw PII).
      Sources: sql/01_create_raw_tables.sql, dags/etl_customers_daily.py"
🏗️ Architecture
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend (Vite)                     │
│  Chat │ Catalog │ Lineage │ Health │ Agent │ Pipeline            │
└──────────────────────────┬──────────────────────────────────────┘
                           │  REST + SSE (FastAPI)
┌──────────────────────────▼──────────────────────────────────────┐
│                      FastAPI Backend                             │
│  repo_service  │  rag_service  │  health_service  │  etl_engine │
└───┬────────────┴──────┬────────┴──────────┬────────┴────────────┘
    │                   │                   │
    ▼                   ▼                   ▼
┌───────┐       ┌───────────────┐    ┌──────────┐
│SQLite │       │   ChromaDB    │    │  Ollama  │
│metadata│      │ (embeddings)  │    │  llama3  │
└───────┘       └───────────────┘    └──────────┘
                        ▲
               sentence-transformers
               (all-MiniLM-L6-v2)
RAG Pipeline (3 Phases)
Phase	When	What happens
Indexing	On repo load	Clone → chunk → embed → store in ChromaDB + SQLite
Retrieval	Per query	Embed question → cosine similarity search → top-5 chunks
Generation	Per query	Assemble prompt → stream to Ollama → token-by-token response
🚀 Quick Start
Prerequisites
# Required
python3 --version    # 3.10+ required (3.12 recommended, NOT 3.14)
node --version       # 18+ required
ollama --version     # Install from https://ollama.ai

# Pull the model
ollama pull llama3
ollama serve         # Keep this running
One-Shot Setup
# From your project root (where genai/ folder lives):
bash setup.sh

# This creates de-assistant/ with everything pre-configured
Start the Application
# Terminal 1 — Backend (port 8000)
bash de-assistant/start_backend.sh

# Terminal 2 — Frontend (port 3000)
bash de-assistant/start_frontend.sh

# Open http://localhost:3000
Load the Sample Repo
Open http://localhost:3000
Paste this URL into the Load Repo bar:
https://github.com/hi9105/Data_Engineer_Airflow
Or use any public GitHub URL
Watch the live progress bar as files are indexed
📁 Project Structure
de-assistant/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, router registration
│   │   ├── routers/
│   │   │   ├── repo.py             # /load-repo, /repo-progress (SSE)
│   │   │   ├── chat.py             # /chat, /chat/stream (SSE), /ollama-health
│   │   │   ├── catalog.py          # /tables
│   │   │   ├── lineage.py          # /lineage
│   │   │   ├── health.py           # /health, /slo
│   │   │   ├── agent.py            # /trigger-check, /mcp/tools
│   │   │   └── pipeline.py         # /upload, /run-pipeline, /quality-check-file ⭐NEW
│   │   ├── services/
│   │   │   ├── repo_service.py     # Git clone, SQL parsing, lineage extraction
│   │   │   ├── rag_service.py      # ChromaDB embeddings, similarity search
│   │   │   ├── ollama_service.py   # LLM communication, streaming
│   │   │   ├── health_service.py   # Pipeline health, SLO metrics
│   │   │   ├── progress_service.py # Real-time ingestion progress (SSE)
│   │   │   └── etl_engine.py       # Real ETL runner (Pandas + DuckDB) ⭐NEW
│   │   ├── tools/
│   │   │   └── mcp_tools.py        # MCP-compatible tool definitions
│   │   ├── models/schemas.py       # Pydantic request/response models
│   │   └── utils/response.py       # ok() / err() envelope helpers
│   ├── requirements.txt
│   └── start.sh
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat/ChatPage.jsx        # Streaming chat with RAG sources
│   │   │   ├── Catalog/CatalogPage.jsx  # Table browser with PII detection
│   │   │   ├── Lineage/LineagePage.jsx  # Interactive DAG (ReactFlow)
│   │   │   ├── Health/HealthPage.jsx    # SLO dashboard
│   │   │   ├── Agent/AgentPage.jsx      # MCP quality check tools
│   │   │   ├── Pipeline/PipelinePage.jsx# Upload + real ETL ⭐NEW
│   │   │   └── Layout/
│   │   │       ├── Sidebar.jsx          # Navigation + download reports
│   │   │       └── Topbar.jsx           # Repo loader + live progress bar
│   │   ├── context/AppContext.jsx        # Global state (React Context)
│   │   ├── hooks/useChat.js              # Streaming chat logic
│   │   ├── services/
│   │   │   ├── api.js                   # Axios + SSE helpers
│   │   │   └── reportGenerator.js        # Client-side PDF/CSV/JSON export
│   │   └── styles/globals.css           # Design system (CSS variables)
│   └── package.json
└── mock-repo/                            # Sample data engineering repo ⭐NEW
    ├── dags/
    │   ├── etl_orders_hourly.py          # Full Airflow DAG with embedded SQL
    │   ├── etl_customers_daily.py        # PII masking DAG
    │   └── ml_feature_pipeline.py        # RFM feature engineering DAG
    ├── sql/
    │   ├── 01_create_raw_tables.sql      # raw_orders, raw_customers, dim_products
    │   ├── 02_staging_transforms.sql     # stg_orders, stg_customers (lineage)
    │   └── 03_mart_aggregations.sql      # mart_revenue, mart_customer_ltv
    └── data/
        ├── raw_orders.csv                # 1,500 clean orders
        ├── raw_customers.csv             # 200 customers with PII (email, phone, dob)
        ├── dim_products.csv              # 8 products
        └── raw_orders_dirty.csv          # 300 rows with intentional quality issues ⭐DEMO
🔌 API Reference
Method	Endpoint	Description
POST	/load-repo	Clone & index a GitHub repo (non-blocking)
GET	/repo-progress	SSE — live ingestion progress stream
POST	/chat	Single-shot chat with RAG context
POST	/chat/stream	SSE — streaming chat token-by-token
GET	/ollama-health	Check Ollama status + available models
GET	/tables	Full data catalog with PII tags
GET	/lineage	Lineage DAG (nodes + edges)
GET	/health	Pipeline health status
GET	/slo	SLO summary + critical pipelines
POST	/trigger-check	Run quality check on a table
GET	/mcp/tools	MCP tool definitions for agents
POST	/upload	⭐ Upload CSV/Parquet data file
POST	/run-pipeline	⭐ Trigger real ETL job on uploaded file
POST	/quality-check-file	⭐ Upload + real DuckDB quality analysis
GET	/pipeline-runs	⭐ Real execution history
GET	/quality-history	⭐ Persisted quality check results
GET	/uploaded-files	⭐ List uploaded files
📖 Full interactive docs: http://localhost:8000/docs

🧠 How RAG Works in This Project
1. Index Time (repo load)
GitHub URL → git clone (depth=1) → walk files (.py, .sql, .yml, .md)
    → _chunk_code() [400-char chunks] → sentence-transformers encode()
    → ChromaDB upsert() [384-dim vectors, cosine space]
    → _extract_sql_tables() → SQLite tables + lineage
2. Query Time (per chat message)
User question → sentence-transformers encode() [query vector]
    → ChromaDB cosine search [top-5 chunks]
    → _build_prompt() [context + history + question]
    → Ollama stream_generate() [llama3, temp=0.3]
    → SSE token stream → React UI
Key Parameters
Parameter	Value	Why
Chunk size	400 chars	~3-8 lines — specific enough for focused retrieval
Embedding dim	384	all-MiniLM-L6-v2 output dimension
Top-K retrieved	5 (use 3)	Balance between context richness and prompt size
Context window	4096 tokens	Fits 3 chunks + 4 history turns + question
Temperature	0.3	Factual/consistent — appropriate for code Q&A
Max tokens	1024	~700 words — concise answers
✅ Real ETL Engine (NEW)
The Pipeline tab adds real computation on top of the mock UI:

Upload → Analyse
Upload raw_orders_dirty.csv →
    DuckDB analysis →
    Real null counts: {order_id: 30, customer_id: 24, total_amount: 15}
    Real duplicates: 47 rows
    Real schema issues: [quantity < 0 in 9 rows]
    Real outliers: unit_price IQR fence [0.0, 185.0], 12 outliers
    Quality score: 68.4% (FAILED)
Upload → Run ETL
Upload raw_orders.csv → Select "Orders ETL" → Trigger Run →
    [09:14:23.441] Loading /uploads/raw_orders.csv...
    [09:14:23.512] Loaded 1500 rows, 8 columns
    [09:14:23.598] After validation: 1487/1500 rows retained (13 dropped)
    [09:14:23.601] Deduplication: removed 0 duplicates
    [09:14:23.612] Written staging: /uploads/stg_orders.csv (1487 rows)
    [09:14:23.651] Mart aggregation: 47 revenue dates → /uploads/mart_revenue.csv
    ✅ Pipeline completed: 1500 rows in → 1487 rows out
    Duration: 0.218s
Pipeline health metrics on the Health tab are updated with real execution timing from your ETL runs.

🐛 Bug Fixes Applied
#	Component	Fix
1	setup.sh	set -euo pipefail + trap ERR with line number
2	setup.sh	Dependency checks: python3 ≥3.10, node ≥18, npm, git
3	setup.sh	Section/step terminal logging throughout
4	routers/repo.py	asyncio.to_thread() wraps blocking clone + ingest
5	services/progress_service.py	New module — real-time ingestion % via SSE
5b	routers/repo.py	GET /repo-progress SSE endpoint added
6	services/rag_service.py	Empty collection guard before col.query()
7	services/repo_service.py	_chunk_code import moved out of os.walk loop
8	hooks/useChat.js	React 18 batching: msgId replaces array index ref
9	services/api.js	repoProgressStream() SSE helper added
10	components/Layout/Topbar.jsx	Live progress bar + stage label + % during ingestion
11	components/Chat/ChatPage.jsx	Syntax highlighter: /dist/esm/ → /dist/cjs/
📊 Tech Stack
Backend
Library	Version	Purpose
fastapi	0.111.0	Async REST API + SSE
uvicorn	0.29.0	ASGI server
chromadb	0.5.0	Vector database (HNSW, cosine)
sentence-transformers	2.7.0	Local embeddings (all-MiniLM-L6-v2)
gitpython	3.1.43	Repo cloning
pandas	2.2.2	⭐ Real ETL transforms
duckdb	0.10.3	⭐ Real data quality analysis
pydantic	2.7.1	Request/response validation
httpx	0.27.0	Async HTTP (Ollama calls)
Frontend
Library	Version	Purpose
react	18.3.1	UI framework
vite	5.2.11	Build tool + dev server
reactflow	11.11.3	Lineage DAG visualisation
react-markdown	9.0.1	Chat message rendering
react-syntax-highlighter	15.5.0	Code block highlighting
recharts	2.12.7	Data charts
lucide-react	0.383.0	Icons
Infrastructure
Tool	Purpose
Ollama	Local LLM runtime (llama3, nomic-embed-text)
SQLite	Structured metadata (tables, lineage, health, runs)
ChromaDB	Vector store (code embeddings)
🎯 Demo Script (for evaluators)
1. Load the mock repo
# Paste into the Load Repo bar:
file:///absolute/path/to/de-assistant/mock-repo
# OR use:
https://github.com/hi9105/Data_Engineer_Airflow
2. Chat tab — RAG in action
Ask these questions and show the source citations:

"Which tables contain PII data and what types?"
"What does the orders ETL pipeline do step by step?"
"What are the upstream dependencies of mart_revenue?"
3. Catalog tab — Real table discovery
Filter by "Has PII" → show orange-bordered tables
Expand raw_customers → show email, phone, dob, address flagged
Trigger quick quality check → show simulated results
4. Lineage tab — DAG visualisation
Show blue source nodes → cyan intermediate → green sink nodes
Click stg_orders → show upstream (raw_orders) + downstream (mart_revenue, mart_customer_ltv)
5. Health tab — SLO monitoring
Show the SLO gauge (overall %)
Show failed pipelines with error messages
Filter by "SLO Breach"
6. Pipeline tab ⭐ — Real computation
# Upload this file for maximum demo impact:
de-assistant/mock-repo/data/raw_orders_dirty.csv
Click "Upload & Analyse" → DuckDB runs real quality analysis
Show genuine null counts, real duplicates, actual IQR outliers
Select "Orders ETL" → click "Trigger Run" → watch real Pandas execution log
Switch to Health tab → see the new run reflected in metrics
⚙️ Configuration
Backend environment variables (optional)
# backend/.env (create this file)
OLLAMA_BASE=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b     # or llama3, mistral, etc.
CHROMA_PATH=./chroma_db
STATE_DB=./metadata.db
UPLOAD_DIR=./uploads
Switch LLM model
Edit backend/app/services/ollama_service.py:

DEFAULT_MODEL = "llama3"      # change to any ollama model
Then pull the model: ollama pull llama3

🔒 Privacy & Security
Zero cloud calls — all processing runs on your machine
No telemetry — no usage data sent anywhere
No authentication required — single-user local tool
Code stays local — ChromaDB and SQLite write to your disk only
PII detection — flags sensitive columns to help with compliance review
⚠️ For organizational deployment, add authentication (OAuth/SSO) and restrict CORS to your domain before exposing the API beyond localhost.

🧪 Troubleshooting
Python 3.14 — tiktoken build error
# tiktoken requires Rust compiler on Python 3.14
# Solution: use Python 3.12
python3.12 -m venv .venv
Ollama not reachable
# Start Ollama server
ollama serve

# Pull required model
ollama pull llama3

# Verify
curl http://localhost:11434/api/tags
ChromaDB corruption
# Auto-heals on restart, or manually:
rm -rf de-assistant/backend/chroma_db/
# Then reload a repo to rebuild the index
Port already in use
# Kill process on port 8000
lsof -ti:8000 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
Frontend not showing Pipeline tab
Add these 3 lines manually (see FRONTEND_PATCH.md):

// In src/App.jsx — add import:
import PipelinePage from './components/Pipeline/PipelinePage'
// Add to PAGES object:
pipeline: PipelinePage,

// In src/components/Layout/Sidebar.jsx — add to NAV array:
{ id: 'pipeline', icon: Upload, label: 'Pipeline', desc: 'ETL · Upload · QC' },
📈 What Makes This Different from a Chatbot
Feature	Regular Chatbot	DE AI Assistant
Private code knowledge	❌	✅ RAG over your codebase
Data lineage	❌	✅ Extracted from SQL
PII detection	❌	✅ Column-level flagging
Pipeline health	❌	✅ SLO monitoring
Works offline	❌	✅ 100% local
Real ETL execution	❌	✅ Pandas + DuckDB
Real data quality	❌	✅ DuckDB analysis
Report export	❌	✅ PDF, CSV, JSON
🤝 Contributing
This is a GenAI capstone project. The key areas for extension are:

Better SQL parsing — replace regex with sqlparse AST
dbt support — parse {{ ref('model') }} lineage patterns
Airflow REST API — replace simulated health with real DAG run data
Chunk overlap — prevent important code from splitting across boundaries
Hybrid search — combine BM25 keyword + vector search
Multi-repo — search across multiple loaded repositories simultaneously
📄 License
MIT License — use freely for personal and educational projects.

