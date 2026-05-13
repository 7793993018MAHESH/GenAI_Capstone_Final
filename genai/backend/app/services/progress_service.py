"""
progress_service.py
───────────────────
Tracks GitHub repo ingestion progress as a module-level dict.
- set_progress() → updates state + prints a live terminal bar
- get_progress()  → returns a snapshot for SSE streaming to the frontend

Stages:
  idle      → no ingestion running
  cloning   → git clone in progress
  scanning  → counting files to process
  parsing   → reading/chunking files (most time here)
  embedding → ChromaDB vector ingestion
  done      → complete
"""

import time

_state: dict = {
    "stage": "idle",
    "current": 0,
    "total": 0,
    "pct": 0,
    "message": "",
    "done": True,
    "started_at": None,
    "elapsed_s": 0,
}

_BAR_WIDTH = 25


def set_progress(stage: str, current: int, total: int, message: str = "", done: bool = False) -> None:
    """Update progress state and print a live bar to the terminal."""
    global _state
    pct = int(current / max(total, 1) * 100)
    elapsed = round(time.time() - (_state.get("started_at") or time.time()), 1)

    _state = {
        "stage": stage,
        "current": current,
        "total": total,
        "pct": pct,
        "message": message,
        "done": done,
        "started_at": _state.get("started_at") or time.time(),
        "elapsed_s": elapsed,
    }

    filled = int(pct / 100 * _BAR_WIDTH)
    bar = "█" * filled + "░" * (_BAR_WIDTH - filled)

    # Use \r to overwrite the same terminal line while in progress
    end_char = "\n" if done else "\r"
    label = f"[INGEST] [{bar}] {pct:3d}% | {stage:<10} | {message[:55]:<55} | {elapsed}s"
    print(label, end=end_char, flush=True)


def reset_progress() -> None:
    """Call before starting a new ingestion."""
    global _state
    _state = {
        "stage": "starting",
        "current": 0,
        "total": 0,
        "pct": 0,
        "message": "Initialising...",
        "done": False,
        "started_at": time.time(),
        "elapsed_s": 0,
    }
    print(f"\n[INGEST] Starting ingestion...", flush=True)


def get_progress() -> dict:
    """Return a copy of the current progress state (safe for SSE serialisation)."""
    return dict(_state)
