#!/usr/bin/env bash
# Nebula Learning Galaxy – start both frontend and backend
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NEBULA Learning Galaxy – Dev Launcher  "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Backend ─────────────────────────────────
echo ""
echo "▶  Starting FastAPI backend on :8000 …"
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  echo "   Creating Python venv …"
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# ── Frontend ─────────────────────────────────
echo ""
echo "▶  Starting Vite frontend on :5173 …"
cd "$ROOT"
npm install -q
npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "✓  Open http://localhost:5173 in your browser"
echo "   API docs at http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
