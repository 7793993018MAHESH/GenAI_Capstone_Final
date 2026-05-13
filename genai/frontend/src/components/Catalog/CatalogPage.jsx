import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { getTables, triggerCheck } from '../../services/api'
import {
  Database, AlertTriangle, RefreshCw, Search,
  Shield, ChevronDown, ChevronUp, Zap,
  FileCode, BarChart2, Eye
} from 'lucide-react'

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = 'var(--neon-cyan)' }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 130,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{label}</div>
      </div>
    </div>
  )
}

// ─── Column pill ──────────────────────────────────────────────────────────────
function ColumnPill({ name, piiInfo }) {
  return (
    <div title={piiInfo ? `PII: ${piiInfo.pii_types.join(', ')}` : name} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 6, fontSize: 11,
      fontFamily: 'var(--font-mono)',
      background: piiInfo ? '#ff6b3510' : 'var(--bg-elevated)',
      border: `1px solid ${piiInfo ? '#ff6b3540' : 'var(--border)'}`,
      color: piiInfo ? 'var(--neon-orange)' : 'var(--text-secondary)',
      maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      cursor: piiInfo ? 'help' : 'default',
    }}>
      {piiInfo && <Shield size={9} style={{ flexShrink: 0 }} />}
      {name}
    </div>
  )
}

// ─── Table row card ───────────────────────────────────────────────────────────
function TableCard({ table, onTriggerCheck, expanded, onToggleExpand, checkResult, onSetCheckResult }) {
  const [checking, setChecking] = useState(false)

  const handleCheck = async (e) => {
    e.stopPropagation()
    setChecking(true)
    try {
      const res = await triggerCheck(table.name)
      onSetCheckResult(table.name, res.data)
      if (!expanded) onToggleExpand(table.name, true)
    } catch {}
    finally { setChecking(false) }
  }

  const piiMap = useMemo(() => {
    const m = {}
    table.pii_columns.forEach(p => { m[p.column] = p })
    return m
  }, [table.pii_columns])

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${table.has_pii ? '#ff6b3530' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = table.has_pii ? '#ff6b3560' : '#00f5c430'; e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = table.has_pii ? '#ff6b3530' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Row header — always visible */}
      <div
        onClick={() => onToggleExpand(table.name, !expanded)}
        style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center',
          gap: 12, cursor: 'pointer', userSelect: 'none',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: table.has_pii ? '#ff6b3515' : '#00f5c415',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {table.has_pii
            ? <AlertTriangle size={16} color="var(--neon-orange)" />
            : <Database size={16} color="var(--neon-cyan)" />
          }
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
            color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{table.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12 }}>
            <span><FileCode size={9} style={{ display: 'inline', marginRight: 3 }} />{table.source_file?.split('/').pop() || '—'}</span>
            <span>{table.columns.length} col{table.columns.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {table.has_pii && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
              fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em',
              background: '#ff6b3515', color: 'var(--neon-orange)', border: '1px solid #ff6b3530',
            }}>
              <Shield size={9} /> PII
            </span>
          )}
          {table.columns.length > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 99, fontSize: 10,
              fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)', border: '1px solid var(--border)',
            }}>
              {table.columns.length}
            </span>
          )}
          {/* Quick-check button */}
          <button
            onClick={handleCheck}
            disabled={checking}
            title="Run quality check"
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {checking
              ? <div style={{ width: 12, height: 12, border: '2px solid var(--text-muted)', borderTop: '2px solid var(--neon-cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              : <Zap size={12} color="var(--text-secondary)" />
            }
          </button>
          {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '14px 16px',
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* Columns */}
          {table.columns.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                Columns ({table.columns.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {table.columns.map(col => (
                  <ColumnPill key={col} name={col} piiInfo={piiMap[col]} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No column definitions extracted — table found via SQL reference only
            </div>
          )}

          {/* PII summary */}
          {table.pii_columns.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#ff6b3508', border: '1px solid #ff6b3520', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--neon-orange)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={11} /> PII Detected ({table.pii_columns.length} column{table.pii_columns.length > 1 ? 's' : ''})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {table.pii_columns.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--neon-orange)', minWidth: 120 }}>{p.column}</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.pii_types.map(t => (
                        <span key={t} style={{ padding: '1px 6px', background: '#ff6b3520', borderRadius: 4, fontSize: 10, color: 'var(--neon-orange)' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick check result */}
          {checkResult && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: checkResult.passed ? '#22c55e08' : '#ff3d5a08', border: `1px solid ${checkResult.passed ? '#22c55e20' : '#ff3d5a20'}`, borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: checkResult.passed ? 'var(--neon-green)' : 'var(--neon-red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart2 size={11} /> Quality Score: {checkResult.quality_score}% · {checkResult.total_rows?.toLocaleString()} rows
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                <span>Nulls: {Object.values(checkResult.null_counts || {}).reduce((a, b) => a + b, 0)}</span>
                <span>Dupes: {checkResult.duplicate_rows}</span>
                <span>Schema issues: {checkResult.schema_mismatches?.length || 0}</span>
              </div>
            </div>
          )}

          {/* Source file */}
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileCode size={10} />
            {table.source_file}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',   label: 'All' },
  { id: 'pii',   label: 'Has PII' },
  { id: 'clean', label: 'Clean' },
  { id: 'rich',  label: 'Has Columns' },
]

export default function CatalogPage() {
  const {
    catalogTables, setCatalogTables,
    catalogLoading, setCatalogLoading,
    catalogSearch, setCatalogSearch,
    catalogFilter, setCatalogFilter,
    expandedTables, setExpandedTables,
    checkResults, setCheckResults,
  } = useApp()

  const fetchTables = async () => {
    setCatalogLoading(true)
    try {
      const res = await getTables()
      setCatalogTables(res.data?.tables || [])
    } catch {}
    finally { setCatalogLoading(false) }
  }

  useEffect(() => {
    // Only fetch if we don't have tables yet
    if (catalogTables.length === 0) {
      fetchTables()
    }
  }, [])

  const stats = useMemo(() => ({
    total:   catalogTables.length,
    pii:     catalogTables.filter(t => t.has_pii).length,
    clean:   catalogTables.filter(t => !t.has_pii).length,
    withCols:catalogTables.filter(t => t.columns.length > 0).length,
  }), [catalogTables])

  const filtered = useMemo(() => catalogTables.filter(t => {
    const q = catalogSearch.toLowerCase()
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.source_file?.toLowerCase().includes(q)
      || t.columns.some(c => c.toLowerCase().includes(q))
    const matchFilter =
      catalogFilter === 'all'   ? true :
      catalogFilter === 'pii'   ? t.has_pii :
      catalogFilter === 'clean' ? !t.has_pii :
      catalogFilter === 'rich'  ? t.columns.length > 0 : true
    return matchSearch && matchFilter
  }), [catalogTables, catalogSearch, catalogFilter])

  const handleToggleExpand = (tableName, isExpanded) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableName]: isExpanded
    }))
  }

  const handleSetCheckResult = (tableName, result) => {
    setCheckResults(prev => ({
      ...prev,
      [tableName]: result
    }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Fixed header ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {/* Title row */}
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={18} color="var(--neon-cyan)" />
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Data Catalog</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, marginTop: 2 }}>
                {catalogLoading ? 'Loading...' : `${stats.total} tables discovered`}
              </p>
            </div>
          </div>
          <button onClick={fetchTables} style={{
            padding: '6px 14px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text-secondary)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Stat cards */}
        {!catalogLoading && catalogTables.length > 0 && (
          <div style={{ padding: '0 24px 14px', display: 'flex', gap: 10 }}>
            <StatCard icon={Database}      label="Total Tables"  value={stats.total}    color="var(--neon-cyan)"   />
            <StatCard icon={AlertTriangle} label="Has PII"       value={stats.pii}      color="var(--neon-orange)" />
            <StatCard icon={Eye}           label="Clean"         value={stats.clean}    color="var(--neon-green)"  />
            <StatCard icon={BarChart2}     label="With Schema"   value={stats.withCols} color="var(--neon-blue)"   />
          </div>
        )}

        {/* Search + filters */}
        <div style={{ padding: '0 24px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 12px',
          }}
            onFocusCapture={e => e.currentTarget.style.borderColor = '#00f5c440'}
            onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <Search size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <input
              value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
              placeholder="Search tables, columns, files..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 13,
              }}
            />
            {catalogSearch && (
              <button onClick={() => setCatalogSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>✕</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setCatalogFilter(f.id)} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12,
                fontFamily: 'var(--font-mono)', cursor: 'pointer',
                background: catalogFilter === f.id ? '#00f5c415' : 'transparent',
                border: `1px solid ${catalogFilter === f.id ? '#00f5c440' : 'var(--border)'}`,
                color: catalogFilter === f.id ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
                {f.label}
                {f.id !== 'all' && (
                  <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
                    {f.id === 'pii'   ? stats.pii :
                     f.id === 'clean' ? stats.clean : stats.withCols}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Result count */}
        {!catalogLoading && (
          <div style={{ padding: '0 24px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length === catalogTables.length
              ? `Showing all ${catalogTables.length} tables`
              : `${filtered.length} of ${catalogTables.length} tables`
            }
            {catalogSearch && ` matching "${catalogSearch}"`}
          </div>
        )}
      </div>

      {/* ── Scrollable table list ─────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px 24px',
      }}>
        {catalogLoading ? (
          /* Skeleton */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                height: 64, borderRadius: 10,
                background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-card) 50%, var(--bg-elevated) 75%)',
                backgroundSize: '1000px 100%',
                animation: 'shimmer 1.5s infinite linear',
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <Database size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {catalogTables.length === 0 ? 'No tables found' : 'No results match your search'}
            </div>
            <div style={{ fontSize: 12 }}>
              {catalogTables.length === 0
                ? 'Load a repository with SQL files to populate the catalog'
                : 'Try adjusting your search term or filter'
              }
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(t => (
              <TableCard
                key={t.name}
                table={t}
                expanded={expandedTables[t.name] || false}
                onToggleExpand={handleToggleExpand}
                checkResult={checkResults[t.name]}
                onSetCheckResult={handleSetCheckResult}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}