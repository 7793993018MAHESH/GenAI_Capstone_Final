import io
import json
import math
from datetime import datetime
from typing import Dict, List, Any

from fastapi import APIRouter, UploadFile, File, HTTPException
from app.utils.response import ok, err

router = APIRouter()

PII_KEYWORDS = [
    "email", "phone", "mobile", "cell", "telephone", "ssn", "social_security",
    "credit_card", "card_number", "cvv", "password", "passwd", "pwd", "secret",
    "dob", "birth", "birthday", "birthdate", "address", "street", "zipcode",
    "postcode", "national_id", "passport", "license", "ip_addr", "ip_address",
    "first_name", "last_name", "fullname", "fname", "lname", "gender", "sex",
    "salary", "income", "bank_account", "latitude", "longitude", "location",
]


def _detect_pii(col: str) -> bool:
    col_lower = col.lower()
    return any(kw in col_lower for kw in PII_KEYWORDS)


def _infer_type(values: List[str]) -> str:
    non_empty = [v for v in values if v.strip() != ""]
    if not non_empty:
        return "unknown"
    int_count = float_count = date_count = 0
    for v in non_empty:
        try:
            int(v); int_count += 1; continue
        except ValueError:
            pass
        try:
            float(v); float_count += 1; continue
        except ValueError:
            pass
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
            try:
                datetime.strptime(v.strip(), fmt); date_count += 1; break
            except ValueError:
                pass
    n = len(non_empty)
    if date_count / n > 0.7:  return "date"
    if int_count / n > 0.8:   return "integer"
    if (int_count + float_count) / n > 0.7: return "float"
    return "string"


def _parse_csv_manual(content: str):
    """Parse CSV without pandas — works in any environment."""
    lines = content.splitlines()
    if not lines:
        return [], []

    # Detect delimiter
    first = lines[0]
    delim = "," if first.count(",") >= first.count(";") else ";"

    def split_line(line):
        """Naive CSV split respecting double-quoted fields."""
        fields, field, in_q = [], [], False
        for ch in line:
            if ch == '"':
                in_q = not in_q
            elif ch == delim and not in_q:
                fields.append(field); field = []
            else:
                field.append(ch)
        fields.append(field)
        return ["".join(f).strip() for f in fields]

    headers = split_line(lines[0])
    rows = [split_line(l) for l in lines[1:] if l.strip()]
    # Pad / truncate rows to header length
    n = len(headers)
    rows = [r[:n] + [""] * max(0, n - len(r)) for r in rows]
    return headers, rows


@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported.")

    raw = await file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("latin-1")

    headers, rows = _parse_csv_manual(content)
    if not headers:
        raise HTTPException(status_code=422, detail="CSV appears to be empty or malformed.")

    total_rows = len(rows)
    n_cols = len(headers)

    # --- Per-column analysis ---
    columns_info: List[Dict[str, Any]] = []
    total_nulls = 0
    total_cells = total_rows * n_cols

    for idx, col in enumerate(headers):
        col_vals = [r[idx] if idx < len(r) else "" for r in rows]
        null_count = sum(1 for v in col_vals if v.strip() == "")
        unique_count = len(set(v for v in col_vals if v.strip() != ""))
        inferred_type = _infer_type(col_vals)
        is_pii = _detect_pii(col)
        total_nulls += null_count

        # Type-mismatch check
        mismatches = 0
        if inferred_type in ("integer", "float"):
            for v in col_vals:
                if v.strip() == "":
                    continue
                try:
                    float(v)
                except ValueError:
                    mismatches += 1

        # Numeric stats
        num_stats = {}
        if inferred_type in ("integer", "float"):
            nums = []
            for v in col_vals:
                try:
                    nums.append(float(v))
                except ValueError:
                    pass
            if nums:
                nums.sort()
                mean_val = sum(nums) / len(nums)
                variance = sum((x - mean_val) ** 2 for x in nums) / len(nums)
                num_stats = {
                    "min": round(min(nums), 4),
                    "max": round(max(nums), 4),
                    "mean": round(mean_val, 4),
                    "std": round(math.sqrt(variance), 4),
                    "median": round(nums[len(nums) // 2], 4),
                }

        columns_info.append({
            "name": col,
            "inferred_type": inferred_type,
            "null_count": null_count,
            "null_pct": round(null_count / total_rows * 100, 2) if total_rows else 0,
            "unique_count": unique_count,
            "unique_pct": round(unique_count / total_rows * 100, 2) if total_rows else 0,
            "type_mismatches": mismatches,
            "is_pii": is_pii,
            "numeric_stats": num_stats,
        })

    # --- Duplicate row detection ---
    row_tuples = [tuple(r) for r in rows]
    duplicate_count = total_rows - len(set(row_tuples))

    # --- Overall quality score ---
    null_penalty = (total_nulls / total_cells) if total_cells else 0
    dup_penalty  = (duplicate_count / total_rows) if total_rows else 0
    mismatch_penalty = sum(c["type_mismatches"] for c in columns_info) / max(total_cells, 1)
    quality_score = round(max(0.0, (1 - null_penalty - dup_penalty - mismatch_penalty)) * 100, 2)

    # --- Issues summary ---
    issues = []
    high_null_cols = [c["name"] for c in columns_info if c["null_pct"] > 5]
    if high_null_cols:
        issues.append({"severity": "warning", "message": f"High null rate (>5%) in: {', '.join(high_null_cols)}"})
    if duplicate_count > 0:
        issues.append({"severity": "error" if duplicate_count > total_rows * 0.01 else "warning",
                       "message": f"{duplicate_count} duplicate rows detected"})
    for c in columns_info:
        if c["type_mismatches"] > 0:
            issues.append({"severity": "warning",
                           "message": f"Type mismatches in '{c['name']}': {c['type_mismatches']} non-{c['inferred_type']} values"})
    pii_cols = [c["name"] for c in columns_info if c["is_pii"]]
    if pii_cols:
        issues.append({"severity": "info", "message": f"PII detected in: {', '.join(pii_cols)}"})
    if quality_score >= 95:
        issues.append({"severity": "success", "message": "Data quality looks excellent!"})

    # Preview: first 10 rows
    preview = [dict(zip(headers, r)) for r in rows[:10]]

    return ok(data={
        "filename": file.filename,
        "total_rows": total_rows,
        "total_columns": n_cols,
        "duplicate_rows": duplicate_count,
        "total_nulls": total_nulls,
        "quality_score": quality_score,
        "columns": columns_info,
        "issues": issues,
        "preview": preview,
        "analyzed_at": datetime.utcnow().isoformat(),
    }, message=f"CSV analysed: {total_rows} rows × {n_cols} columns")
