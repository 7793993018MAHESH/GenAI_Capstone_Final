import random
import json
import sqlite3
from datetime import datetime, timedelta
from typing import List, Dict

STATE_DB = "./metadata.db"

def _init_health_db():
    conn = sqlite3.connect(STATE_DB)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS dag_health (
        dag_id TEXT PRIMARY KEY, status TEXT, last_run TEXT,
        duration_actual REAL, duration_expected REAL,
        failure_count INTEGER DEFAULT 0, run_count INTEGER DEFAULT 1,
        last_error TEXT
    )""")
    conn.commit()
    rows = c.execute("SELECT COUNT(*) FROM dag_health").fetchone()[0]
    if rows == 0:
        demo_dags = [
            ("etl_users_daily",    "success", 142.0, 120.0, 0,  15, ""),
            ("etl_orders_hourly",  "failed",   89.0, 180.0, 3,  24, "ConnectionError: DB timeout"),
            ("agg_revenue_weekly", "success",  310.0, 300.0, 1,   8, ""),
            ("sync_product_catalog","running",  45.0,  90.0, 0,  20, ""),
            ("ml_feature_pipeline","failed",  200.0, 150.0, 5,  12, "MemoryError: OOM at step 3"),
            ("archive_logs_daily", "success",   55.0,  60.0, 0,  30, ""),
        ]
        now = datetime.utcnow()
        for i, (dag_id, status, actual, expected, fail_cnt, run_cnt, err) in enumerate(demo_dags):
            last_run = (now - timedelta(hours=i * 3 + random.randint(0, 2))).isoformat()
            c.execute("INSERT OR IGNORE INTO dag_health VALUES (?,?,?,?,?,?,?,?)",
                      (dag_id, status, last_run, actual, expected, fail_cnt, run_cnt, err))
    conn.commit()
    conn.close()

_init_health_db()


def get_health() -> List[Dict]:
    conn = sqlite3.connect(STATE_DB)
    c = conn.cursor()
    rows = c.execute("SELECT * FROM dag_health").fetchall()
    conn.close()
    result = []
    for row in rows:
        dag_id, status, last_run, dur_actual, dur_expected, fail_cnt, run_cnt, last_err = row
        slo_ok = dur_actual <= dur_expected * 1.1 if dur_actual and dur_expected else True
        result.append({
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
        })
    return result


def get_slo() -> Dict:
    health = get_health()
    total = len(health)
    slo_passing = sum(1 for h in health if h["slo_ok"])
    critical = [h for h in health if not h["slo_ok"] or h["status"] == "failed"]
    return {
        "total_pipelines":   total,
        "slo_passing":       slo_passing,
        "slo_failing":       total - slo_passing,
        "slo_percentage":    round(slo_passing / max(total, 1) * 100, 1),
        "critical_pipelines":critical,
        "pipelines":         health,
    }
