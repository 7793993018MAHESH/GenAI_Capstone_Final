import os, re, shutil, tempfile, json, sqlite3
from typing import List, Dict, Tuple
import git

from app.services.rag_service import _chunk_code

STATE_DB = "./metadata.db"
SUPPORTED_EXTENSIONS = (".py", ".sql", ".yml", ".yaml", ".md", ".txt")
SKIP_DIRS = {
    ".git","__pycache__","node_modules",".venv","venv",
    ".mypy_cache",".tox","dist","build",".eggs",".pytest_cache",
}

SQL_KEYWORDS = {
    "SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","AND","OR",
    "NOT","IN","IS","NULL","TRUE","FALSE","INSERT","INTO","VALUES","UPDATE","SET",
    "DELETE","CREATE","TABLE","VIEW","INDEX","IF","EXISTS","AS","WITH","HAVING",
    "GROUP","ORDER","BY","ASC","DESC","LIMIT","OFFSET","UNION","ALL","DISTINCT",
    "CASE","WHEN","THEN","ELSE","END","CAST","OVER","PARTITION","ROWS","BETWEEN",
    "LIKE","ILIKE","USING","FULL","CROSS","NATURAL","RETURNING","TEMPORARY","TEMP",
    "REPLACE","TRUNCATE","DROP","ALTER","ADD","COLUMN","TYPE","VARCHAR","INTEGER",
    "INT","BIGINT","FLOAT","DOUBLE","BOOLEAN","TEXT","DATE","TIMESTAMP","NUMERIC",
    "DECIMAL","SERIAL","CHAR","STRING","ARRAY","STRUCT","MAP","SMALLINT","TINYINT",
    "LONG","SCHEMA","DATABASE","CONSTRAINT","PRIMARY","FOREIGN","IDENTITY",
    "KEY","UNIQUE","DEFAULT","CHECK","REFERENCES","INTERVAL","EPOCH","SECOND",
    "MINUTE","HOUR","DAY","MONTH","YEAR","SORTKEY","DISTKEY","ENCODE",
    "DISTSTYLE","COMPOUND","INTERLEAVED","NEXTVAL","CURRVAL","NOW","CURRENT",
    "START_TIME","END_TIME","CREATED_AT","UPDATED_AT","EVENT","EVENTS","LOG",
    "TYPING","OS","SYS","RE","JSON","MATH","TIME","DATETIME","RANDOM",
}

PII_COLUMN_KEYWORDS = [
    "email","phone","mobile","cell","telephone","ssn","social_security",
    "credit_card","card_number","cvv","password","passwd","pwd","secret",
    "dob","birth","birthday","birthdate","address","street","zipcode",
    "postcode","national_id","passport","license","ip_addr","ip_address",
    "first_name","last_name","fullname","fname","lname","gender","sex",
    "salary","income","bank_account","latitude","longitude","location",
]

_INSERT_VAR_SUFFIXES = [
    "_table_insert_delete","_table_upsert_delete","_table_insert",
    "_table_upsert","_table_load","_insert_delete","_insert",
    "_upsert","_load","_table",
]


def _init_db():
    conn = sqlite3.connect(STATE_DB)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS tables (
        name TEXT PRIMARY KEY, columns TEXT, pii_columns TEXT,
        source_file TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS lineage (
        source TEXT, target TEXT, transformation TEXT, file TEXT,
        PRIMARY KEY (source, target))""")
    c.execute("""CREATE TABLE IF NOT EXISTS repo_state (
        key TEXT PRIMARY KEY, value TEXT)""")
    # dag_registry is owned by health_service but we ensure it exists here too
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
    conn.commit(); conn.close()

_init_db()


def _is_valid_table_name(name: str) -> bool:
    return (
        name and len(name) >= 2
        and name.upper() not in SQL_KEYWORDS
        and not name.isdigit()
        and bool(re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', name))
        and len(name) <= 64
    )

def _detect_pii(column_name: str) -> List[str]:
    col = column_name.lower()
    return list({kw for kw in PII_COLUMN_KEYWORDS if kw in col})


# ── CREATE TABLE body extractor ───────────────────────────────────────────────
def _extract_create_table_blocks(sql: str) -> List[Tuple[str, str]]:
    pat = re.compile(
        r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE\s+'
        r'(?:IF\s+NOT\s+EXISTS\s+)?'
        r'(?:\w+\.)?'
        r'(?:"(\w+)"|`(\w+)`|\[(\w+)\]|(\w+))'
        r'\s*\(', re.IGNORECASE)
    results = []
    for m in pat.finditer(sql):
        name = m.group(1) or m.group(2) or m.group(3) or m.group(4)
        if not _is_valid_table_name(name):
            continue
        start = m.end(); depth = 1; pos = start
        while pos < len(sql) and depth > 0:
            if   sql[pos] == '(': depth += 1
            elif sql[pos] == ')': depth -= 1
            pos += 1
        if depth == 0:
            results.append((name, sql[start:pos-1]))
    return results


def _split_columns(body: str) -> List[str]:
    parts, cur, depth = [], [], 0
    for ch in body:
        if   ch == '(': depth += 1; cur.append(ch)
        elif ch == ')': depth -= 1; cur.append(ch)
        elif ch == ',' and depth == 0: parts.append(''.join(cur).strip()); cur = []
        else: cur.append(ch)
    if cur: parts.append(''.join(cur).strip())
    return [p for p in parts if p]


def _parse_columns(body: str) -> Tuple[List[str], List[Dict]]:
    columns, pii_cols = [], []
    skip = ("PRIMARY","FOREIGN","UNIQUE","INDEX","KEY","CONSTRAINT","CHECK","--","/*")
    for col_def in _split_columns(body):
        s = col_def.strip()
        if not s or any(s.upper().startswith(k) for k in skip): continue
        tok = re.split(r'\s+', s)[0]
        is_quoted = bool(re.match(r'^[`"\[]', tok))
        col = re.sub(r'[`"\[\]]', '', tok)
        if col and re.match(r'^[a-zA-Z_]', col):
            if is_quoted or col.upper() not in SQL_KEYWORDS:
                columns.append(col)
                pii = _detect_pii(col)
                if pii: pii_cols.append({"column": col, "pii_types": pii})
    return columns, pii_cols


# ── Lineage: explicit INSERT INTO ... SELECT ... FROM ─────────────────────────
def _extract_insert_lineage(sql: str, file_path: str) -> List[Dict]:
    edges = []
    insert_blocks = re.split(r'(?=INSERT\s+(?:OR\s+\w+\s+)?INTO\s)', sql, flags=re.IGNORECASE)
    for block in insert_blocks:
        m = re.match(r'INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:\w+\.)?(\w+)\b(.*)', block, re.IGNORECASE | re.DOTALL)
        if not m:
            continue
        target, seg = m.group(1), m.group(2)
        if not _is_valid_table_name(target):
            continue
        select_match = re.search(r'\bSELECT\b(.*?)(?:;|$)', seg, re.IGNORECASE | re.DOTALL)
        search_seg = select_match.group(0) if select_match else seg
        for src in re.findall(r'(?:FROM|JOIN)\s+(?:\w+\.)?(\w+)', search_seg, re.IGNORECASE):
            if _is_valid_table_name(src) and src.upper() != target.upper():
                is_join = bool(re.search(rf'\bJOIN\s+(?:\w+\.)?{re.escape(src)}\b', search_seg, re.IGNORECASE))
                t = "JOIN" if is_join else "INSERT_SELECT"
                edges.append({"source": src, "target": target, "transformation": t, "file": file_path})
    return edges


# ── Lineage: Airflow variable pattern  ────────────────────────────────────────
def _extract_airflow_variable_lineage(content: str, file_path: str) -> List[Dict]:
    edges = []
    var_pat = re.compile(
        r'(\w+)\s*=\s*\(?\s*(?:"""|\'\'\')(.*?)(?:"""|\'\'\')\s*\)?',
        re.DOTALL
    )
    for m in var_pat.finditer(content):
        var_name = m.group(1)
        sql_body = m.group(2)
        var_lower = var_name.lower()

        if not any(kw in var_lower for kw in ('_insert', '_load', '_upsert')):
            continue
        if not re.search(r'\bSELECT\b', sql_body, re.IGNORECASE):
            continue

        target = var_lower
        for suffix in _INSERT_VAR_SUFFIXES:
            if target.endswith(suffix):
                target = target[:-len(suffix)]
                break

        if not target or target.upper() in SQL_KEYWORDS:
            continue

        sources = re.findall(
            r'(?:FROM|JOIN)\s+\(?(?:\w+\.)?(\w+)(?:\s+(?:AS\s+)?\w+)?',
            sql_body, re.IGNORECASE
        )
        for src in sources:
            if _is_valid_table_name(src) and src.lower() != target:
                is_join = bool(re.search(
                    rf'\bJOIN\s+(?:\w+\.)?{re.escape(src)}\b',
                    sql_body, re.IGNORECASE
                ))
                edges.append({
                    "source": src,
                    "target": target,
                    "transformation": "JOIN" if is_join else "INSERT_SELECT",
                    "file": file_path,
                })
    return edges


def _fuzzy_match_table(name: str, known_tables: Dict) -> str:
    n = name.lower()
    for candidate in known_tables:
        if candidate.lower() == n:           return candidate
        if candidate.lower() == n + 's':     return candidate
        if candidate.lower() == n + 'es':    return candidate
    for candidate in known_tables:
        if candidate.lower().startswith(n):  return candidate
    return name


# ── Full .sql file parser ─────────────────────────────────────────────────────
def _extract_sql_tables(sql_content: str, file_path: str) -> Tuple[Dict, List[Dict]]:
    tables = {}
    for tname, body in _extract_create_table_blocks(sql_content):
        cols, pii = _parse_columns(body)
        tables[tname] = {"columns": cols, "pii_columns": pii, "source_file": file_path}
    edges = _extract_insert_lineage(sql_content, file_path)
    return tables, edges


# ── .py file parser ───────────────────────────────────────────────────────────
def _extract_python_tables(content: str, file_path: str) -> Tuple[Dict, List[Dict]]:
    tables = {}
    all_edges = []

    # Pass 1: SQL inside triple-quoted strings
    for sql_str in re.findall(r'(?:"""|\'\'\')(.*?)(?:"""|\'\'\')', content, re.DOTALL):
        if not re.search(r'\b(SELECT|INSERT|CREATE|UPDATE|DELETE)\b', sql_str, re.IGNORECASE):
            continue
        t, e = _extract_sql_tables(sql_str, file_path)
        tables.update(t)
        all_edges.extend(e)

    # Pass 2: Airflow-style variable lineage
    airflow_edges = _extract_airflow_variable_lineage(content, file_path)
    all_edges.extend(airflow_edges)

    return tables, all_edges


# ── NEW: DAG registry writer ──────────────────────────────────────────────────

def _persist_dags_to_registry(dags: List[Dict], conn: sqlite3.Connection) -> int:
    """
    Write DAG metadata into dag_registry. Returns count of DAGs saved.
    Called inside clone_and_parse() after all files are processed.
    """
    if not dags:
        return 0
    c = conn.cursor()
    # Wipe old registry entries so re-loading a repo starts fresh
    c.execute("DELETE FROM dag_registry")
    for d in dags:
        c.execute(
            """INSERT OR REPLACE INTO dag_registry
               (dag_id, schedule, tasks, owners, tags, source_file, description, catchup, max_active_runs)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                d["dag_id"],
                d.get("schedule", ""),
                json.dumps(d.get("tasks", [])),
                json.dumps(d.get("owners", [])),
                json.dumps(d.get("tags", [])),
                d.get("source_file", ""),
                d.get("description", ""),
                1 if d.get("catchup") else 0,
                int(d.get("max_active_runs") or 1),
            )
        )
    return len(dags)


# ── Main clone-and-parse pipeline ─────────────────────────────────────────────
def clone_and_parse(repo_url: str, branch: str = "main") -> Dict:
    from app.services.progress_service import set_progress
    # Import DAG parser — in same package
    try:
        from app.services.dag_parser import parse_dag_file, is_dag_file
        dag_parser_available = True
    except ImportError:
        try:
            # Fallback: try importing from the tools directory
            import sys, importlib.util
            spec = importlib.util.spec_from_file_location(
                "dag_parser",
                os.path.join(os.path.dirname(__file__), "dag_parser.py")
            )
            dp_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(dp_module)
            parse_dag_file = dp_module.parse_dag_file
            is_dag_file    = dp_module.is_dag_file
            dag_parser_available = True
        except Exception as e:
            print(f"[REPO] dag_parser not found: {e} — DAG ingestion disabled", flush=True)
            dag_parser_available = False
            parse_dag_file = None
            is_dag_file    = None

    print(f"\n[CLONE] Thread started: {repo_url}  branch={branch}", flush=True)
    tmpdir = tempfile.mkdtemp()
    all_chunks:  List[Dict] = []
    all_tables:  Dict       = {}
    all_lineage: List[Dict] = []
    all_dags:    List[Dict] = []   # ← NEW: collected DAG metadata

    # Clone
    set_progress("cloning", 0, 1, f"Cloning {repo_url} (branch: {branch})")
    try:
        try:
            git.Repo.clone_from(repo_url, tmpdir, branch=branch, depth=1)
        except git.exc.GitCommandError:
            print(f"[CLONE] Branch '{branch}' not found — retrying with default...", flush=True)
            set_progress("cloning", 0, 1, "Branch not found — retrying with default branch...")
            git.Repo.clone_from(repo_url, tmpdir, depth=1)
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        set_progress("error", 0, 1, str(e), done=True)
        raise RuntimeError(f"Failed to clone repo: {e}")
    set_progress("cloning", 1, 1, "Clone complete")

    # Scan
    set_progress("scanning", 0, 1, "Counting files...")
    eligible = []
    for root, dirs, files in os.walk(tmpdir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS:
                eligible.append(os.path.join(root, f))
    total = len(eligible)
    set_progress("scanning", total, total, f"Found {total} files")
    print(f"\n[REPO] Found {total} eligible files", flush=True)

    # Parse
    file_count = 0
    for idx, fpath in enumerate(eligible, 1):
        rel = os.path.relpath(fpath, tmpdir)
        ext = os.path.splitext(fpath)[1].lower()
        set_progress("parsing", idx, total, rel[-60:] if len(rel) > 60 else rel)
        try:
            content = open(fpath, "r", encoding="utf-8", errors="ignore").read()
            if not content.strip(): continue
            file_count += 1
            all_chunks.extend(_chunk_code(content, rel))

            if ext == ".sql":
                t, e = _extract_sql_tables(content, rel)
            elif ext == ".py":
                t, e = _extract_python_tables(content, rel)
                # ── NEW: DAG detection for .py files ──────────────────────
                if dag_parser_available and is_dag_file(content):
                    try:
                        found_dags = parse_dag_file(content, rel)
                        if found_dags:
                            all_dags.extend(found_dags)
                            print(
                                f"[REPO] DAG file: {rel} → "
                                f"{[d['dag_id'] for d in found_dags]}",
                                flush=True
                            )
                    except Exception as dag_err:
                        print(f"[REPO] DAG parse error {rel}: {dag_err}", flush=True)
                # ──────────────────────────────────────────────────────────
            else:
                t, e = {}, []

            for tname, tdata in t.items():
                existing = all_tables.get(tname)
                new_has_cols = len(tdata["columns"]) > 0
                if not existing:
                    if new_has_cols:
                        all_tables[tname] = tdata
                elif len(tdata["columns"]) > len(existing["columns"]):
                    all_tables[tname] = tdata

            all_lineage.extend(e)
        except Exception as ex:
            print(f"\n[REPO] Skipped {rel}: {ex}", flush=True)

    shutil.rmtree(tmpdir, ignore_errors=True)

    # Post-process lineage
    resolved_lineage = []
    seen_edges = set()
    for e in all_lineage:
        src = _fuzzy_match_table(e["source"], all_tables)
        tgt = _fuzzy_match_table(e["target"], all_tables)
        k = (src.lower(), tgt.lower())
        if k in seen_edges or src.lower() == tgt.lower(): continue
        if not _is_valid_table_name(src) or not _is_valid_table_name(tgt): continue
        seen_edges.add(k)
        resolved_lineage.append({**e, "source": src, "target": tgt})

    # Persist everything in one connection
    set_progress("saving", 0, 1, "Saving to database...")
    conn = sqlite3.connect(STATE_DB)
    c = conn.cursor()
    c.execute("DELETE FROM tables")
    c.execute("DELETE FROM lineage")
    for tname, tdata in all_tables.items():
        c.execute(
            "INSERT OR REPLACE INTO tables (name,columns,pii_columns,source_file) VALUES (?,?,?,?)",
            (tname, json.dumps(tdata["columns"]), json.dumps(tdata["pii_columns"]), tdata["source_file"]),
        )
    for edge in resolved_lineage:
        c.execute(
            "INSERT OR REPLACE INTO lineage (source,target,transformation,file) VALUES (?,?,?,?)",
            (edge["source"], edge["target"], edge["transformation"], edge["file"]),
        )
    c.execute("INSERT OR REPLACE INTO repo_state (key,value) VALUES ('last_repo',?)", (repo_url,))

    # ── NEW: write DAG registry and sync health ────────────────────────────
    dag_count = _persist_dags_to_registry(all_dags, conn)
    conn.commit()
    conn.close()

    if dag_count > 0:
        try:
            from app.services.health_service import sync_dags_from_registry
            sync_dags_from_registry()
            print(f"[REPO] {dag_count} Airflow DAG(s) written to health dashboard.", flush=True)
        except Exception as he:
            print(f"[REPO] health sync error: {he}", flush=True)
    else:
        print("[REPO] No Airflow DAGs found — health dashboard keeps existing data.", flush=True)
    # ──────────────────────────────────────────────────────────────────────

    summary = (f"{file_count} files · {len(all_chunks)} chunks · "
               f"{len(all_tables)} tables · {len(resolved_lineage)} lineage edges · "
               f"{dag_count} DAGs")
    set_progress("done", total, total, summary, done=True)
    print(f"\n[REPO] Done: {summary}", flush=True)

    return {
        "files_processed": file_count,
        "chunks_indexed":  len(all_chunks),
        "tables_found":    len(all_tables),
        "lineage_edges":   len(resolved_lineage),
        "dags_found":      dag_count,           # ← new field surfaced to frontend
        "chunks":          all_chunks,
    }


def get_tables() -> List[Dict]:
    conn = sqlite3.connect(STATE_DB)
    rows = conn.execute(
        "SELECT name,columns,pii_columns,source_file FROM tables ORDER BY name"
    ).fetchall()
    conn.close()
    return [{"name": r[0], "columns": json.loads(r[1]), "pii_columns": json.loads(r[2]),
             "source_file": r[3], "has_pii": len(json.loads(r[2])) > 0} for r in rows]


def get_lineage() -> Dict:
    conn = sqlite3.connect(STATE_DB)
    edges  = conn.execute("SELECT source,target,transformation,file FROM lineage").fetchall()
    tables = conn.execute("SELECT name FROM tables").fetchall()
    conn.close()

    edge_list = [{"source": e[0],"target": e[1],"transformation": e[2],"file": e[3]} for e in edges]

    connected_nodes = set()
    for e in edge_list:
        connected_nodes.add(e["source"])
        connected_nodes.add(e["target"])

    conn2 = sqlite3.connect(STATE_DB)
    rich_tables = set(
        row[0] for row in conn2.execute(
            "SELECT name FROM tables WHERE json_array_length(columns) > 0"
        ).fetchall()
    )
    conn2.close()

    all_nodes = connected_nodes | rich_tables

    return {
        "nodes": [{"id": n, "label": n} for n in sorted(all_nodes)],
        "edges": edge_list,
    }