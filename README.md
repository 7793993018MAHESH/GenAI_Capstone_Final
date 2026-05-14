````markdown
# 🚀 GenAI Data Engineering Assistant

<p align="center">
  <img src="https://raw.githubusercontent.com/Platane/snk/output/github-contribution-grid-snake.svg" width="100%" />
</p>

<h3 align="center">
AI-Powered Data Engineering Assistant using RAG, Ollama & Modern UI
</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue?style=for-the-badge&logo=python"/>
  <img src="https://img.shields.io/badge/FastAPI-Backend-green?style=for-the-badge&logo=fastapi"/>
  <img src="https://img.shields.io/badge/React-Frontend-blue?style=for-the-badge&logo=react"/>
  <img src="https://img.shields.io/badge/Ollama-LLM-orange?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/RAG-AI-red?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/ChromaDB-VectorDB-purple?style=for-the-badge"/>
</p>

---

# ✨ Overview

GenAI Data Engineering Assistant is an intelligent AI-powered platform designed to help data engineers instantly understand pipelines, SQL workflows, DAGs, lineage, metadata, and system health through a conversational interface.

Instead of constantly switching between GitHub repositories, Airflow dashboards, SQL editors, monitoring tools, and documentation, engineers can ask natural language questions and receive contextual AI-driven answers instantly.

---

# 🔥 Features

## 🧠 AI-Powered RAG Chatbot

- Retrieval-Augmented Generation (RAG)
- Semantic document search
- Context-aware AI responses
- LLM-powered intelligent assistance

---

## 📊 Pipeline Intelligence

- DAG metadata extraction
- Pipeline dependency mapping
- SQL understanding
- Table lineage analysis
- Ownership tracking

---

## ⚡ Real-Time Insights

- Data quality checks
- Health monitoring
- Pipeline status visibility
- SLO monitoring
- Error diagnostics

---

## 🎨 Modern UI/UX

- ChatGPT-style interface
- Beautiful dark theme
- Interactive dashboard
- Real-time chat experience
- Smooth animations

---

# 🏗️ System Architecture

```text
                ┌──────────────────────┐
                │    React Frontend    │
                └──────────┬───────────┘
                           │
                    REST / WebSocket
                           │
                ┌──────────▼───────────┐
                │    FastAPI Backend   │
                └──────────┬───────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
 │ Vector DB   │   │ Ollama LLM  │   │ DAG Parser  │
 │ ChromaDB    │   │ Llama/Qwen  │   │ Metadata    │
 └─────────────┘   └─────────────┘   └─────────────┘
````

---

# 🖼️ UI Preview

## 💬 AI Chat Interface

<p align="center">
  <img src="https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=1600&auto=format&fit=crop" width="90%" />
</p>

---

## 📊 Monitoring Dashboard

<p align="center">
  <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1600&auto=format&fit=crop" width="90%" />
</p>

---

# 🛠️ Tech Stack

| Category        | Technologies                 |
| --------------- | ---------------------------- |
| Frontend        | React, TailwindCSS           |
| Backend         | FastAPI, Python              |
| AI/LLM          | Ollama, Llama3, Qwen         |
| Vector Database | ChromaDB                     |
| Parsing         | AST, DAG Metadata Extraction |
| Deployment      | Docker, GitHub               |
| Database        | SQLite/PostgreSQL            |

---

# 📂 Project Structure

```bash
GenAI_Capstone_Final/
│
├── backend/
│   ├── app/
│   ├── parsers/
│   ├── rag/
│   ├── services/
│   ├── utils/
│   └── main.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── assets/
│   │   └── styles/
│   │
│   └── package.json
│
├── data/
├── docs/
├── screenshots/
├── requirements.txt
└── README.md
```

---

# ⚙️ Installation Guide

## 1️⃣ Clone Repository

```bash
git clone https://github.com/7793993018MAHESH/GenAI_Capstone_Final.git

cd GenAI_Capstone_Final
```

---

## 2️⃣ Backend Setup

```bash
cd backend

python -m venv .venv

source .venv/bin/activate
```

### Windows

```bash
.venv\Scripts\activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Backend

```bash
uvicorn app.main:app --reload
```

---

## 3️⃣ Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

---

## 4️⃣ Run Ollama

```bash
ollama serve
```

### Pull Model

```bash
ollama run llama3
```

OR

```bash
ollama run qwen2.5:14b
```

---

# 🧠 Example Questions

```text
• Which pipelines failed today?
• Explain this SQL query
• Show lineage for customer_orders table
• Which DAG depends on this table?
• What are the data quality issues?
• Who owns this pipeline?
• Summarize this Airflow DAG
```

---

# 🚀 Future Enhancements

* Multi-agent AI workflows
* Live Airflow integration
* Snowflake metadata integration
* Slack/Teams integration
* Voice-enabled assistant
* Real-time observability
* MCP architecture support

---

# 📈 Why This Project?

Modern data engineering teams work across fragmented tools like:

* GitHub
* Airflow
* SQL Editors
* Documentation Platforms
* Monitoring Dashboards

This project centralizes everything into one AI-powered assistant that improves:

✅ Productivity
✅ Incident response
✅ Pipeline visibility
✅ Developer experience

---

# 👨‍💻 Author

## Mahesh

AI & Data Engineering Enthusiast
Building intelligent developer tools using GenAI

### 🔗 Connect

* GitHub:
  [https://github.com/7793993018MAHESH](https://github.com/7793993018MAHESH)

---

# ⭐ Support The Project

If you found this project useful:

```text
⭐ Star the repository

🍴 Fork the project

🛠️ Contribute improvements
```

---

# 📜 License

This project is licensed under the MIT License.

---

<p align="center">
  Made with ❤️ using GenAI, FastAPI, React & Ollama
</p>
```
