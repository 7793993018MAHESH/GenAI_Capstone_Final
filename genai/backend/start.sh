#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀  DE AI Assistant — Backend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Port      : 8000"
echo "  API Docs  : http://localhost:8000/docs"
echo "  Reload    : enabled"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level info
# uvicorn app.main:app \
#   --host 0.0.0.0 \
#   --port 8000 \
#   --reload \
#   --reload-exclude ".venv/*" \
#   --log-level info

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app --log-level info

