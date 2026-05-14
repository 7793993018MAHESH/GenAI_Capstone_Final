"""
dag_parser.py
─────────────
Extracts real Airflow DAG metadata from Python source files.

Handles both styles:
  • Classic:     with DAG('my_dag', schedule_interval='@daily', ...) as dag:
  • Decorator:   @dag(schedule_interval='@weekly', ...)
                 def my_pipeline(): ...

Extracted fields:
  dag_id, schedule, tasks (list of task_ids), owners, tags,
  description, catchup, max_active_runs, source_file

Zero external dependencies — pure stdlib regex + ast.
"""

import re
import ast
import json
from typing import Dict, List, Optional, Tuple


# ── Helpers ───────────────────────────────────────────────────────────────────

def _str_val(node) -> Optional[str]:
    """Return a string constant from an AST node, or None."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _list_of_strings(node) -> List[str]:
    """Extract a list of string constants from an AST List/Tuple node."""
    if not isinstance(node, (ast.List, ast.Tuple)):
        return []
    return [_str_val(elt) for elt in node.elts if _str_val(elt) is not None]


def _bool_val(node) -> Optional[bool]:
    if isinstance(node, ast.Constant) and isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.NameConstant):  # Python 3.7 compat
        return node.value if isinstance(node.value, bool) else None
    return None


def _int_val(node) -> Optional[int]:
    if isinstance(node, ast.Constant) and isinstance(node.value, int):
        return node.value
    return None


# ── DAG call extractor (ast-based) ───────────────────────────────────────────

def _extract_dag_call_kwargs(call_node: ast.Call) -> Dict:
    """Pull keyword arguments from a DAG(...) or @dag(...) call node."""
    kwargs = {}
    # Positional arg[0] is dag_id for classic DAG()
    if call_node.args:
        v = _str_val(call_node.args[0])
        if v:
            kwargs["dag_id"] = v

    for kw in call_node.keywords:
        key = kw.arg
        val = kw.value
        if key == "dag_id":
            kwargs["dag_id"] = _str_val(val) or kwargs.get("dag_id")
        elif key in ("schedule_interval", "schedule"):
            kwargs["schedule"] = _str_val(val) or ""
        elif key == "description":
            kwargs["description"] = _str_val(val) or ""
        elif key == "catchup":
            b = _bool_val(val)
            if b is not None:
                kwargs["catchup"] = b
        elif key == "max_active_runs":
            n = _int_val(val)
            if n is not None:
                kwargs["max_active_runs"] = n
        elif key == "default_args":
            # default_args may be a dict literal
            if isinstance(val, ast.Dict):
                for k, v in zip(val.keys, val.values):
                    k_str = _str_val(k)
                    if k_str == "owner":
                        owner = _str_val(v)
                        if owner:
                            kwargs.setdefault("owners", []).append(owner)
        elif key == "tags":
            kwargs["tags"] = _list_of_strings(val)
        elif key == "owner":
            owner = _str_val(val)
            if owner:
                kwargs.setdefault("owners", []).append(owner)

    return kwargs


# ── Task extractor ────────────────────────────────────────────────────────────

# Airflow task operator class name fragments
_TASK_OPERATORS = {
    "PythonOperator", "BashOperator", "BranchPythonOperator",
    "ShortCircuitOperator", "DummyOperator", "EmptyOperator",
    "EmailOperator", "HttpSensor", "SqlSensor", "ExternalTaskSensor",
    "S3KeySensor", "BigQueryOperator", "SparkSubmitOperator",
    "DockerOperator", "KubernetesPodOperator", "SimpleHttpOperator",
    "TriggerDagRunOperator", "SubDagOperator", "LatestOnlyOperator",
    "PostgresOperator", "MySqlOperator", "MsSqlOperator",
    "SnowflakeOperator", "RedshiftToS3Transfer", "S3ToRedshiftOperator",
    "DataprocSubmitJobOperator", "GCSToGCSOperator",
    "PythonVirtualenvOperator", "ExternalPythonOperator",
}

_TASK_DECORATORS = {"task", "task.python", "task.branch", "task.sensor"}


def _extract_tasks_from_ast(tree: ast.Module) -> List[str]:
    """Walk AST looking for task_id=... assignments or @task decorated functions."""
    task_ids: List[str] = []
    visited: set = set()

    class TaskVisitor(ast.NodeVisitor):
        def visit_Call(self, node):
            # Look for Operator(..., task_id='foo', ...)
            func_name = ""
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr

            if any(op in func_name for op in _TASK_OPERATORS) or func_name.endswith("Operator"):
                for kw in node.keywords:
                    if kw.arg == "task_id":
                        v = _str_val(kw.value)
                        if v and v not in visited:
                            visited.add(v)
                            task_ids.append(v)
            self.generic_visit(node)

        def visit_FunctionDef(self, node):
            # @task decorated functions: function name becomes task_id
            for dec in node.decorator_list:
                dec_name = ""
                if isinstance(dec, ast.Name):
                    dec_name = dec.id
                elif isinstance(dec, ast.Attribute):
                    dec_name = dec.attr
                elif isinstance(dec, ast.Call):
                    if isinstance(dec.func, ast.Name):
                        dec_name = dec.func.id
                    elif isinstance(dec.func, ast.Attribute):
                        dec_name = dec.func.attr
                if dec_name == "task":
                    tid = node.name
                    if tid not in visited:
                        visited.add(tid)
                        task_ids.append(tid)
            self.generic_visit(node)

        visit_AsyncFunctionDef = visit_FunctionDef

    TaskVisitor().visit(tree)
    return task_ids


# ── Regex fallbacks (for files that can't be parsed by ast) ──────────────────

_DAG_ID_PATTERNS = [
    re.compile(r'''DAG\s*\(\s*['"]([^'"]+)['"]'''),
    re.compile(r'''dag_id\s*=\s*['"]([^'"]+)['"]'''),
    re.compile(r'''@dag\b.*?def\s+(\w+)\s*\(''', re.DOTALL),
]

_SCHEDULE_PATTERNS = [
    re.compile(r'''schedule_interval\s*=\s*['"]([^'"]+)['"]'''),
    re.compile(r'''schedule\s*=\s*['"]([^'"]+)['"]'''),
]

_TASK_ID_RE = re.compile(r'''task_id\s*=\s*['"]([^'"]+)['"]''')
_OWNER_RE   = re.compile(r'''['"]owner['"]\s*:\s*['"]([^'"]+)['"]''')
_TAGS_RE    = re.compile(r'''tags\s*=\s*\[([^\]]+)\]''')
_TAG_STR_RE = re.compile(r'''['"]([^'"]+)['"]''')


def _regex_extract(content: str) -> Dict:
    result: Dict = {}
    for pat in _DAG_ID_PATTERNS:
        m = pat.search(content)
        if m:
            result["dag_id"] = m.group(1)
            break

    for pat in _SCHEDULE_PATTERNS:
        m = pat.search(content)
        if m:
            result["schedule"] = m.group(1)
            break

    result["tasks"] = list(dict.fromkeys(_TASK_ID_RE.findall(content)))

    owners = _OWNER_RE.findall(content)
    if owners:
        result["owners"] = owners

    tags_m = _TAGS_RE.search(content)
    if tags_m:
        result["tags"] = _TAG_STR_RE.findall(tags_m.group(1))

    return result


# ── Is this file an Airflow DAG file? ────────────────────────────────────────

_IS_DAG_RE = re.compile(
    r'(from\s+airflow|import\s+airflow|DAG\s*\(|@dag\b|airflow\.DAG)',
    re.IGNORECASE
)


def is_dag_file(content: str) -> bool:
    """Quick check — does this file look like an Airflow DAG?"""
    return bool(_IS_DAG_RE.search(content))


# ── Main entry point ──────────────────────────────────────────────────────────

def parse_dag_file(content: str, source_file: str) -> List[Dict]:
    """
    Parse one Python file and return a list of DAG metadata dicts.
    A single file can define multiple DAGs (rare but valid).

    Each dict has:
      dag_id, schedule, tasks, owners, tags, description,
      catchup, max_active_runs, source_file
    """
    if not is_dag_file(content):
        return []

    dags: List[Dict] = []

    # ── Try AST parsing first ──────────────────────────────────────────────
    try:
        tree = ast.parse(content)
        tasks_in_file = _extract_tasks_from_ast(tree)

        class DagFinder(ast.NodeVisitor):
            def visit_Call(self, node):
                # Direct DAG(...) or airflow.DAG(...)
                func_name = ""
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr

                if func_name == "DAG":
                    meta = _extract_dag_call_kwargs(node)
                    if meta.get("dag_id"):
                        meta.setdefault("schedule", "")
                        meta.setdefault("tasks", tasks_in_file)
                        meta.setdefault("owners", [])
                        meta.setdefault("tags", [])
                        meta.setdefault("description", "")
                        meta.setdefault("catchup", False)
                        meta.setdefault("max_active_runs", 1)
                        meta["source_file"] = source_file
                        dags.append(meta)
                self.generic_visit(node)

            def visit_FunctionDef(self, node):
                # @dag(...) decorated function
                for dec in node.decorator_list:
                    dec_func = None
                    if isinstance(dec, ast.Name) and dec.id == "dag":
                        dec_func = ast.Call(func=dec, args=[], keywords=[])
                    elif isinstance(dec, ast.Call):
                        fn = dec.func
                        name = fn.id if isinstance(fn, ast.Name) else (fn.attr if isinstance(fn, ast.Attribute) else "")
                        if name == "dag":
                            dec_func = dec

                    if dec_func is not None:
                        meta = _extract_dag_call_kwargs(dec_func) if isinstance(dec_func, ast.Call) else {}
                        # dag_id defaults to function name for @dag
                        meta.setdefault("dag_id", node.name)
                        meta.setdefault("schedule", "")
                        meta.setdefault("tasks", tasks_in_file)
                        meta.setdefault("owners", [])
                        meta.setdefault("tags", [])
                        meta.setdefault("description", ast.get_docstring(node) or "")
                        meta.setdefault("catchup", False)
                        meta.setdefault("max_active_runs", 1)
                        meta["source_file"] = source_file
                        dags.append(meta)

            visit_AsyncFunctionDef = visit_FunctionDef

        DagFinder().visit(tree)

    except SyntaxError:
        pass  # fall through to regex

    # ── Regex fallback ─────────────────────────────────────────────────────
    if not dags:
        meta = _regex_extract(content)
        if meta.get("dag_id"):
            meta.setdefault("schedule", "")
            meta.setdefault("tasks", [])
            meta.setdefault("owners", [])
            meta.setdefault("tags", [])
            meta.setdefault("description", "")
            meta.setdefault("catchup", False)
            meta.setdefault("max_active_runs", 1)
            meta["source_file"] = source_file
            dags.append(meta)

    # Sanitise: deduplicate tasks, ensure all fields are serialisable
    for d in dags:
        d["tasks"]  = list(dict.fromkeys(d.get("tasks") or []))
        d["owners"] = list(dict.fromkeys(d.get("owners") or []))
        d["tags"]   = list(dict.fromkeys(d.get("tags") or []))
        d["catchup"]         = bool(d.get("catchup", False))
        d["max_active_runs"] = int(d.get("max_active_runs") or 1)

    return dags


# ── Batch helper ──────────────────────────────────────────────────────────────

def parse_dag_files(file_contents: List[Tuple[str, str]]) -> List[Dict]:
    """
    file_contents: list of (relative_path, file_content) tuples.
    Returns all DAGs found across all files.
    """
    all_dags = []
    for rel_path, content in file_contents:
        try:
            found = parse_dag_file(content, rel_path)
            all_dags.extend(found)
        except Exception as e:
            print(f"[DAG_PARSER] Error parsing {rel_path}: {e}", flush=True)
    return all_dags