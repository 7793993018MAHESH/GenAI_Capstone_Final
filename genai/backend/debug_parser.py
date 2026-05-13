"""
debug_parser.py
───────────────
Run this inside your backend venv to see exactly what the parser
finds in the cloned repo — tables, columns, and lineage edges.

Usage:
  cd de-assistant/backend
  source .venv/bin/activate
  python debug_parser.py https://github.com/hi9105/Data_Engineer_Airflow master
"""
import sys, os, re, shutil, tempfile, json
import git

SUPPORTED_EXT = (".py", ".sql", ".yml", ".yaml", ".md", ".txt")
SKIP_DIRS = {".git","__pycache__","node_modules",".venv","venv",".mypy_cache"}

SQL_KW = {
    "SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","AND","OR",
    "NOT","IN","IS","NULL","TRUE","FALSE","INSERT","INTO","VALUES","UPDATE","SET",
    "DELETE","CREATE","TABLE","VIEW","IF","EXISTS","AS","WITH","HAVING","GROUP",
    "ORDER","BY","ASC","DESC","LIMIT","UNION","ALL","DISTINCT","CASE","WHEN",
    "THEN","ELSE","END","CAST","OVER","PARTITION","FULL","CROSS","NATURAL",
    "VARCHAR","INTEGER","INT","BIGINT","FLOAT","DOUBLE","BOOLEAN","TEXT","DATE",
    "TIMESTAMP","NUMERIC","DECIMAL","SERIAL","CHAR","SMALLINT","TINYINT",
    "SORTKEY","DISTKEY","ENCODE","DISTSTYLE","COMPOUND","INTERLEAVED","IDENTITY",
    "CONSTRAINT","PRIMARY","FOREIGN","KEY","UNIQUE","DEFAULT","CHECK","REFERENCES",
    "INTERVAL","EPOCH","SECOND","MINUTE","HOUR","DAY","MONTH","YEAR",
}

def valid(name):
    return (name and len(name)>=2 and name.upper() not in SQL_KW
            and not name.isdigit() and re.match(r'^[a-zA-Z_]\w*$', name)
            and len(name)<=64)

def extract_create_blocks(sql):
    pat = re.compile(
        r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE\s+'
        r'(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)\s*\(', re.IGNORECASE)
    results = []
    for m in pat.finditer(sql):
        name = m.group(1)
        if not valid(name): continue
        start = m.end(); depth=1; pos=start
        while pos < len(sql) and depth > 0:
            if sql[pos]=='(': depth+=1
            elif sql[pos]==')': depth-=1
            pos+=1
        if depth==0:
            results.append((name, sql[start:pos-1]))
    return results

def split_cols(body):
    parts, cur, depth = [], [], 0
    for ch in body:
        if ch=='(': depth+=1; cur.append(ch)
        elif ch==')': depth-=1; cur.append(ch)
        elif ch==',' and depth==0:
            parts.append(''.join(cur).strip()); cur=[]
        else: cur.append(ch)
    if cur: parts.append(''.join(cur).strip())
    return [p for p in parts if p]

def parse_cols(body):
    cols = []
    skip = ("PRIMARY","FOREIGN","UNIQUE","INDEX","KEY","CONSTRAINT","CHECK","--","/*")
    for cd in split_cols(body):
        s = cd.strip().lstrip('\n\r\t ')
        if not s or any(s.upper().startswith(k) for k in skip): continue
        tok = re.split(r'\s+', s)[0]
        col = re.sub(r'[`"\[\]]','',tok)
        if col and re.match(r'^[a-zA-Z_]',col) and col.upper() not in SQL_KW:
            cols.append(col)
    return cols

def extract_lineage(sql, filepath):
    edges = []
    for m in re.finditer(
        r'INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:\w+\.)?(\w+)\b(.*?)(?=INSERT\s+INTO|CREATE\s+TABLE|$)',
        sql, re.IGNORECASE|re.DOTALL):
        target, seg = m.group(1), m.group(2)
        if not valid(target): continue
        for src in re.findall(r'(?:FROM|JOIN)\s+(?:\w+\.)?(\w+)', seg, re.IGNORECASE):
            if valid(src) and src.upper()!=target.upper():
                edges.append((src, target))
    return edges

def process_file(path, relpath):
    ext = os.path.splitext(path)[1].lower()
    content = open(path,'r',encoding='utf-8',errors='ignore').read()
    tables, edges = {}, []

    sqls_to_parse = []
    if ext == '.sql':
        sqls_to_parse.append(('(direct .sql file)', content))
    elif ext == '.py':
        triples = re.findall(r'(?:"""|\'\'\')(.*?)(?:"""|\'\'\')', content, re.DOTALL)
        for i, s in enumerate(triples):
            if re.search(r'\b(SELECT|INSERT|CREATE|UPDATE|DELETE)\b', s, re.IGNORECASE):
                sqls_to_parse.append((f'(triple-string #{i+1})', s))
        if not sqls_to_parse:
            print(f"      ⚠  No SQL triple-strings found in this .py file")
            # Show first 200 chars of content to debug
            preview = content[:500].replace('\n','↵')
            print(f"      Preview: {preview[:200]}")

    for label, sql in sqls_to_parse:
        blocks = extract_create_blocks(sql)
        for tname, body in blocks:
            cols = parse_cols(body)
            tables[tname] = cols
            print(f"      ✅ CREATE TABLE {tname}  → {len(cols)} cols: {cols[:5]}{'...' if len(cols)>5 else ''}")
        for src, tgt in extract_lineage(sql, relpath):
            edges.append((src, tgt))
            print(f"      🔗 LINEAGE: {src} → {tgt}")
        if not blocks and not edges:
            print(f"      ℹ  {label}: SQL found but no CREATE TABLE or INSERT INTO→FROM extracted")
            # Print first 300 chars of the SQL
            print(f"         SQL preview: {sql[:300].strip()[:200]}...")

    return tables, edges

def main():
    url    = sys.argv[1] if len(sys.argv)>1 else 'https://github.com/hi9105/Data_Engineer_Airflow'
    branch = sys.argv[2] if len(sys.argv)>2 else 'master'

    print(f"\n{'='*60}")
    print(f"DEBUG PARSER")
    print(f"  Repo  : {url}")
    print(f"  Branch: {branch}")
    print(f"{'='*60}\n")

    tmpdir = tempfile.mkdtemp()
    print(f"Cloning into {tmpdir}...")
    try:
        git.Repo.clone_from(url, tmpdir, branch=branch, depth=1)
    except Exception as e:
        print(f"❌ Clone failed: {e}")
        return

    all_tables, all_edges = {}, []
    eligible = []
    for root, dirs, files in os.walk(tmpdir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if os.path.splitext(f)[1].lower() in SUPPORTED_EXT:
                eligible.append(os.path.join(root,f))

    print(f"Found {len(eligible)} eligible files\n")

    for fpath in eligible:
        rel = os.path.relpath(fpath, tmpdir)
        ext = os.path.splitext(fpath)[1].lower()
        if ext not in ('.sql', '.py'): continue  # only show SQL-bearing files
        print(f"  📄 {rel}")
        try:
            t, e = process_file(fpath, rel)
            all_tables.update(t)
            all_edges.extend(e)
        except Exception as ex:
            print(f"      ❌ Error: {ex}")

    shutil.rmtree(tmpdir, ignore_errors=True)

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"  Tables found : {len(all_tables)}")
    for name, cols in all_tables.items():
        print(f"    • {name} ({len(cols)} cols): {cols}")
    print(f"  Lineage edges: {len(all_edges)}")
    for src, tgt in all_edges:
        print(f"    • {src} → {tgt}")
    print(f"{'='*60}\n")

if __name__ == '__main__':
    main()