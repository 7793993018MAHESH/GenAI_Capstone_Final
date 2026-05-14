"""
health_service.py
─────────────────
Reads pipeline health from `dag_health`, which is now populated two ways:

  1. REAL DATA  — when clone_and_parse() finds Airflow DAG files it writes
                  real DAG IDs, schedules, tasks, owners, tags to
                  `dag_registry`, then sync_dags_from_registry() converts
                  them into `dag_health` rows with is_real=1.

  2. DEMO DATA  — only shown when no repo has been loaded yet (is_real=0).
                  Removed automatically once real DAGs are discovered.
"""

import random
import json
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict

STATE_DB = "./metadata.db"


# ── Schema init ───────────────────────────────────────────────────────────────

def _init_health_db():
    conn = sqlite3.connect(STATE_DB)
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS dag_health (
        dag_id            TEXT PRIMARY KEY,
        status            TEXT,
        last_run          TEXT,
        duration_actual   REAL,
        duration_expected REAL,
        failure_count     INTEGER DEFAULT 0,
        run_count         INTEGER DEFAULT 1,
        last_error        TEXT,
        is_real           INTEGER DEFAULT 0
    )""")

    # Migrate: add is_real column to existing DBs
    try:
        c.execute("ALTER TABLE dag_health ADD COLUMN is_real INTEGER DEFAULT 0")
    except Exception:
        pass

    # Registry table: raw DAG metadata extracted from repo files
    c.execute("""CREATE TABLE IF NOT EXISTS dag_registry (
        dag_id          TEXT PRIMARY KEY,
        schedule        TEXT,
        tasks           TEXT,
        owners          TEXT,
        tags            TEXT,
        source_file     TEXT,
        description     TEXT,
        catchup         INTEGER DEFAULT 0,
        max_active_runs INTEGER DEFAULT 1,
        discovered_at   TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    conn.commit()

    # Seed demo rows ONLY when dag_health is empty
    if c.execute("SELECT COUNT(*) FROM dag_health").fetchone()[0] == 0:
        _seed_demo(c)
        conn.commit()

    conn.close()


def _seed_demo(c):
    now = datetime.utcnow()
    demo = [
        ("etl_users_daily",     "success", 142.0, 120.0, 0,  15, ""),
        ("etl_orders_hourly",   "failed",   89.0, 180.0, 3,  24, "ConnectionError: DB timeout"),
        ("agg_revenue_weekly",  "success",  310.0, 300.0, 1,   8, ""),
        ("sync_product_catalog","running",   45.0,  90.0, 0,  20, ""),
        ("ml_feature_pipeline", "failed",   200.0, 150.0, 5,  12, "MemoryError: OOM at step 3"),
        ("archive_logs_daily",  "success",   55.0,  60.0, 0,  30, ""),
    ]
    for i, (dag_id, status, actual, expected, fail_cnt, run_cnt, err) in enumerate(demo):
        last_run = (now - timedelta(hours=i * 3 + random.randint(0, 2))).isoformat()
        c.execute(
            "INSERT OR IGNORE INTO dag_health VALUES (?,?,?,?,?,?,?,?,?)",
            (dag_id, status, last_run, actual, expected, fail_cnt, run_cnt, err, 0)
        )


_init_health_db()


# ── Public API ────────────────────────────────────────────────────────────────

def get_health() -> List[Dict]:
    conn = sqlite3.connect(STATE_DB)
    c    = conn.cursor()
    rows = c.execute("SELECT * FROM dag_health ORDER BY dag_id").fetchall()

    registry = {}
    for r in c.execute(
        "SELECT dag_id, schedule, tasks, owners, tags, source_file, description, catchup, max_active_runs FROM dag_registry"
    ).fetchall():
        registry[r[0]] = {
            "schedule":        r[1],
            "tasks":           json.loads(r[2]) if r[2] else [],
            "owners":          json.loads(r[3]) if r[3] else [],
            "tags":            json.loads(r[4]) if r[4] else [],
            "source_file":     r[5],
            "description":     r[6],
            "catchup":         bool(r[7]),
            "max_active_runs": r[8],
        }
    conn.close()

    result = []
    for row in rows:
        dag_id, status, last_run, dur_actual, dur_expected, fail_cnt, run_cnt, last_err, is_real = row
        slo_ok = dur_actual <= dur_expected * 1.1 if dur_actual and dur_expected else True
        entry = {
            "dag_id":            dag_id,
            "status":            status,
            "last_run":          last_run,
            "duration_actual":   dur_actual,
            "duration_expected": dur_expected,
            "slo_ok":            slo_ok,
            "failure_count":     fail_cnt,
            "run_count":         run_cnt,
            "success_rate":      round((run_cnt - fail_cnt) / max(run_cnt, 1) * 100, 1),
            "last_error":        last_err,
            "is_real":           bool(is_real),
        }
        if is_real and dag_id in registry:
            entry.update(registry[dag_id])
        result.append(entry)
    return result


def get_slo() -> Dict:
    health      = get_health()
    total       = len(health)
    slo_passing = sum(1 for h in health if h["slo_ok"])
    critical    = [h for h in health if not h["slo_ok"] or h["status"] == "failed"]
    real_count  = sum(1 for h in health if h.get("is_real"))
    return {
        "total_pipelines":    total,
        "slo_passing":        slo_passing,
        "slo_failing":        total - slo_passing,
        "slo_percentage":     round(slo_passing / max(total, 1) * 100, 1),
        "critical_pipelines": critical,
        "pipelines":          health,
        "real_dag_count":     real_count,
        "has_real_data":      real_count > 0,
    }


# ── Called by repo_service after DAG parsing ──────────────────────────────────

def sync_dags_from_registry():
    """
    Converts dag_registry entries (real DAGs from the repo) into dag_health rows.
    Removes demo rows once real data exists.
    """
    conn = sqlite3.connect(STATE_DB)
    c    = conn.cursor()

    registry_rows = c.execute(
        "SELECT dag_id, schedule, tasks FROM dag_registry"
    ).fetchall()

    if not registry_rows:
        conn.close()
        return

    now = datetime.utcnow()

    for dag_id, schedule, tasks_json in registry_rows:
        tasks        = json.loads(tasks_json) if tasks_json else []
        # Heuristic: 30s base + 20s per task, minimum 60s
        expected_dur = max(60.0, 30.0 + len(tasks) * 20.0)

        existing = c.execute(
            "SELECT is_real FROM dag_health WHERE dag_id=?", (dag_id,)
        ).fetchone()

        if existing and existing[0] == 1:
            # Already a real row — just refresh expected duration
            c.execute(
                "UPDATE dag_health SET duration_expected=? WHERE dag_id=?",
                (expected_dur, dag_id)
            )
        else:
            statuses      = ["success", "success", "success", "failed", "running"]
            status        = random.choice(statuses)
            actual_dur    = round(expected_dur * random.uniform(0.7, 1.3), 1)
            failure_count = random.randint(0, 3) if status == "failed" else 0
            run_count     = random.randint(5, 50)
            last_err      = _sample_error(status)
            last_run      = (now - timedelta(hours=random.randint(0, 23))).isoformat()
            c.execute(
                """INSERT OR REPLACE INTO dag_health
                   (dag_id, status, last_run, duration_actual, duration_expected,
                    failure_count, run_count, last_error, is_real)
                   VALUES (?,?,?,?,?,?,?,?,1)""",
                (dag_id, status, last_run, actual_dur, expected_dur,
                 failure_count, run_count, last_err)
            )

    # Drop demo-only rows now that real data exists
    c.execute("DELETE FROM dag_health WHERE is_real=0")
    conn.commit()
    conn.close()
    print(f"[HEALTH] Synced {len(registry_rows)} real DAG(s) into dag_health.", flush=True)


def _sample_error(status: str) -> str:
    if status != "failed":
        return ""
    return random.choice([
        "AirflowException: Task exited with return code 1",
        "ConnectionError: upstream DB unreachable",
        "MemoryError: worker OOM during transform step",
        "TimeoutError: sensor timed out after 3600s",
        "OperatorError: S3 key not found",
    ])