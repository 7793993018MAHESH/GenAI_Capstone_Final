import { useApp } from '../../context/AppContext'
import { uploadCsv } from '../../services/api'
import { useState, useRef } from 'react'
import {
  AlertCircle, CheckCircle2, Info, AlertTriangle,
  BarChart2, Table2, Shield, Copy, RefreshCw,
} from 'lucide-react'

const SEVERITY_STYLE = {
  error:   { bg: '#ff3d5a12', border: '#ff3d5a40', color: '#ff3d5a', Icon: AlertCircle },
  warning: { bg: '#f59e0b12', border: '#f59e0b40', color: '#f59e0b', Icon: AlertTriangle },
  info:    { bg: '#3d7cff12', border: '#3d7cff40', color: '#3d7cff', Icon: Info },
  success: { bg: '#22c55e12', border: '#22c55e40', color: '#22c55e', Icon: CheckCircle2 },
}

function ScoreRing({ score }) {
  const r = 44, cx = 50, cy = 50
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - score / 100)
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ff3d5a'
  return (
    <svg width={110} height={110} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color}
        fontSize={18} fontWeight={700} fontFamily="var(--font-mono)">{score}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-muted)" fontSize={8}>SCORE</text>
    </svg>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, padding: '14px 18px', background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

function ColumnRow({ col }) {
  const [open, setOpen] = useState(false)
  const nullColor = col.null_pct > 10 ? '#ff3d5a' : col.null_pct > 5 ? '#f59e0b' : 'var(--text-secondary)'
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 80px 70px',
        padding: '10px 16px', cursor: 'pointer', gap: 8, alignItems: 'center',
        transition: 'background 0.1s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{col.name}</span>
          {col.is_pii && (
            <span style={{ fontSize: 9, padding: '1px 6px', background: '#f59e0b20', color: '#f59e0b', borderRadius: 4, border: '1px solid #f59e0b40', letterSpacing: '0.05em' }}>
              PII
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#3d7cff', fontFamily: 'var(--font-mono)' }}>{col.inferred_type}</span>
        <span style={{ fontSize: 12, color: nullColor, fontFamily: 'var(--font-mono)' }}>{col.null_pct}%</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{col.unique_count.toLocaleString()}</span>
        <span style={{ fontSize: 12, color: col.type_mismatches > 0 ? '#ff3d5a' : 'var(--neon-green)', fontFamily: 'var(--font-mono)' }}>
          {col.type_mismatches > 0 ? col.type_mismatches : '✓'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && col.numeric_stats && Object.keys(col.numeric_stats).length > 0 && (
        <div style={{ padding: '8px 16px 14px 24px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(col.numeric_stats).map(([k, v]) => (
            <div key={k} style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--neon-cyan)' }}>{k}</span>: {v}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DataQualityPage() {
  const { csvReport, setCsvReport, setActiveTab } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const handleFile = async (file) => {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const res = await uploadCsv(file)
      setCsvReport(res.data)
    } catch (e) {
      setError(typeof e === 'string' ? e : e?.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  if (!csvReport) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 70, height: 70, borderRadius: 18,
            background: 'linear-gradient(135deg, #00f5c420, #3d7cff20)',
            border: '1px solid #00f5c440',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Table2 size={32} color="var(--neon-cyan)" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>CSV Data Quality</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
            Upload a CSV file to get an instant data quality report — null analysis, type inference, duplicate detection, PII flagging, and a quality score.
          </p>

          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border-glow)', borderRadius: 14,
              padding: '40px 30px', cursor: 'pointer',
              background: 'var(--bg-elevated)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neon-cyan)'; e.currentTarget.style.background = '#00f5c408' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-glow)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
          >
            {loading ? (
              <div style={{ color: 'var(--neon-cyan)', fontSize: 14 }}>
                <RefreshCw size={20} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
                <br />Analysing…
              </div>
            ) : (
              <>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>Drop CSV here or click to browse</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Supports UTF-8 and Latin-1 encoded files</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          {error && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#ff3d5a10', border: '1px solid #ff3d5a40', borderRadius: 8, fontSize: 13, color: '#ff3d5a' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  const r = csvReport
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {r.filename}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
            Analysed {new Date(r.analyzed_at).toLocaleString()}
          </div>
        </div>
        <button onClick={() => { setCsvReport(null); fileRef.current && (fileRef.current.value = '') }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
        }}>
          <RefreshCw size={13} /> New File
        </button>
      </div>

      {/* Score + Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <ScoreRing score={r.quality_score} />
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>Quality Score</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {r.quality_score >= 90 ? 'Excellent' : r.quality_score >= 70 ? 'Needs attention' : 'Poor quality'}
            </div>
          </div>
        </div>
        <StatCard label="Total Rows" value={r.total_rows.toLocaleString()} />
        <StatCard label="Columns" value={r.total_columns} />
        <StatCard label="Null Cells" value={r.total_nulls.toLocaleString()} color={r.total_nulls > 0 ? '#f59e0b' : '#22c55e'} />
        <StatCard label="Duplicates" value={r.duplicate_rows} color={r.duplicate_rows > 0 ? '#ff3d5a' : '#22c55e'} />
        <StatCard label="PII Columns" value={r.columns.filter(c => c.is_pii).length}
          color={r.columns.some(c => c.is_pii) ? '#f59e0b' : '#22c55e'} />
      </div>

      {/* Issues */}
      {r.issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {r.issues.map((issue, i) => {
            const s = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.info
            const { Icon } = s
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8,
              }}>
                <Icon size={14} color={s.color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: s.color }}>{issue.message}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Column table */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 20,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 80px 70px',
          padding: '10px 16px', background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)', gap: 8,
        }}>
          {['Column', 'Type', 'Nulls %', 'Unique', 'Errors', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>{h}</span>
          ))}
        </div>
        {r.columns.map(col => <ColumnRow key={col.name} col={col} />)}
      </div>

      {/* Data preview */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={14} color="var(--neon-cyan)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Data Preview</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>(first 10 rows)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {r.columns.map(c => (
                  <th key={c.name} style={{
                    padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    color: c.is_pii ? '#f59e0b' : 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                  }}>
                    {c.name}{c.is_pii ? ' 🔒' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.preview.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {r.columns.map(c => (
                    <td key={c.name} style={{
                      padding: '7px 12px', color: row[c.name] === '' ? '#ff3d5a60' : 'var(--text-primary)',
                      whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {row[c.name] === '' ? 'NULL' : row[c.name]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
