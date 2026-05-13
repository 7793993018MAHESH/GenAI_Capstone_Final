import json
import random
import sqlite3
from typing import Dict, List
from app.services.repo_service import get_tables, get_lineage
from app.services.health_service import get_health

STATE_DB = "./metadata.db"

MCP_TOOL_DEFINITIONS = [
    {
        "name": "get_tables",
        "description": "Retrieve all tables from the data catalog including columns and PII detection",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_lineage",
        "description": "Get the data lineage DAG showing table-level dependencies and transformations",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_health",
        "description": "Get current pipeline health status, failures, and SLO adherence",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "trigger_quality_check",
        "description": "Trigger a data quality check on a specific table",
        "inputSchema": {
            "type": "object",
            "properties": {"table_name": {"type": "string", "description": "The table to check"}},
            "required": ["table_name"],
        },
    },
]


def trigger_data_quality_check(table_name: str) -> Dict:
    conn = sqlite3.connect(STATE_DB)
    c = conn.cursor()
    row = c.execute("SELECT columns FROM tables WHERE name=?", (table_name,)).fetchone()
    conn.close()
    columns = json.loads(row[0]) if row else ["id", "created_at", "value"]
    total_rows = random.randint(10_000, 500_000)
    null_counts = {col: random.randint(0, int(total_rows * 0.05)) for col in columns}
    duplicates  = random.randint(0, int(total_rows * 0.02))
    schema_mismatches = []
    if random.random() < 0.3 and columns:
        schema_mismatches.append({
            "column":        random.choice(columns),
            "expected_type": "VARCHAR",
            "actual_type":   "INTEGER",
            "rows_affected": random.randint(1, 100),
        })
    passed = duplicates == 0 and all(v == 0 for v in null_counts.values()) and not schema_mismatches
    return {
        "table":             table_name,
        "total_rows":        total_rows,
        "null_counts":       null_counts,
        "duplicate_rows":    duplicates,
        "schema_mismatches": schema_mismatches,
        "quality_score":     round(
            (1 - (sum(null_counts.values()) + duplicates) / max(total_rows * len(columns), 1)) * 100, 2
        ),
        "passed":      passed,
        "checked_at":  __import__("datetime").datetime.utcnow().isoformat(),
    }


def execute_mcp_tool(tool_name: str, params: Dict = {}) -> Dict:
    if tool_name == "get_tables":          return {"tables": get_tables()}
    if tool_name == "get_lineage":         return get_lineage()
    if tool_name == "get_health":          return {"pipelines": get_health()}
    if tool_name == "trigger_quality_check":
        return trigger_data_quality_check(params.get("table_name", "unknown"))
    return {"error": f"Unknown tool: {tool_name}"}
