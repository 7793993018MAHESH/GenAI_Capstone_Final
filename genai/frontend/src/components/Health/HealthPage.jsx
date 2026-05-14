import { useState, useEffect } from 'react'
import { getSlo } from '../../services/api'
import { AlertTriangle, RefreshCw, CheckCircle, XCircle, Tag, User, Clock, List } from 'lucide-react'
import { SkeletonCard } from '../Common/Skeleton'

function SloGauge({ value }) {
  const color = value >= 90 ? '#22c55e' : value >= 70 ? '#ff6b35' : '#ff3d5a'
  const r = 36, circ = 2 * Math.PI * r, dash = (value / 100) * circ
  return (
    <div style={{ position:'relative', width:90, height:90 }}>
      <svg width="90" height="90" style={{ transform:'rotate(-90deg)' }}>
        <circle cx="45" cy="45" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="6" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition:'stroke-dasharray 0.8s ease, stroke 0.3s' }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:18, color }}>{value}%</span>
        <span style={{ fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>SLO</span>
      </div>
    </div>
  )
}

function PipelineRow({ p }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = {
    success: 'var(--neon-green)',
    failed:  'var(--neon-red)',
    running: 'var(--neon-cyan)',
    unknown: 'var(--text-muted)',
  }[p.status] || 'var(--text-muted)'

  const sloBar = Math.min(100, (p.duration_expected / Math.max(p.duration_actual, 1)) * 100)
  const hasRichData = p.is_real && (p.tasks?.length > 0 || p.schedule || p.owners?.length > 0 || p.tags?.length > 0)

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${p.slo_ok ? (p.is_real ? '#00f5c420' : 'var(--border)') : '#ff3d5a30'}`,
      animation: 'fadeIn 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <div style={{
            width: 8, height: 8, borderRadius:'50%',
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}80`,
            flexShrink: 0,
            ...(p.status === 'running' ? { animation:'pulse-glow 1.5s infinite' } : {}),
          }} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:700, flex:1 }}>{p.dag_id}</span>

          {/* Real vs Demo badge */}
          {p.is_real ? (
            <span style={{
              display:'inline-flex', alignItems:'center', gap:4,
              padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700,
              fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em',
              background:'#00f5c415', color:'var(--neon-cyan)', border:'1px solid #00f5c430',
            }}>
              ● LIVE
            </span>
          ) : (
            <span style={{
              display:'inline-flex', alignItems:'center', gap:4,
              padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:600,
              fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em',
              background:'var(--bg-elevated)', color:'var(--text-muted)', border:'1px solid var(--border)',
            }}>
              DEMO
            </span>
          )}

          <span className={`badge badge-${
            p.status === 'success' ? 'success' :
            p.status === 'failed'  ? 'error'   :
            p.status === 'running' ? 'running'  : 'info'
          }`}>{p.status}</span>
          {!p.slo_ok && (
            <span className="badge badge-warning">
              <AlertTriangle size={9} /> SLO
            </span>
          )}
          {/* Expand toggle for real DAGs with extra data */}
          {hasRichData && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background:'var(--bg-elevated)', border:'1px solid var(--border)',
                borderRadius:6, padding:'2px 8px', cursor:'pointer',
                fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)',
              }}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>

        {/* Description for real DAGs */}
        {p.is_real && p.description && (
          <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:8, fontStyle:'italic' }}>
            {p.description}
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
          {[
            ['Success Rate', `${p.success_rate}%`],
            ['Last Run', new Date(p.last_run).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})],
            ['Failures', p.failure_count],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>{label}</div>
              <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:600, marginTop:2 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* SLO bar */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginBottom:4 }}>
            <span>Duration SLO</span>
            <span style={{ fontFamily:'var(--font-mono)' }}>{p.duration_actual}s / {p.duration_expected}s</span>
          </div>
          <div style={{ height:4, background:'var(--bg-elevated)', borderRadius:99, overflow:'hidden' }}>
            <div style={{
              height:'100%', width:`${sloBar}%`,
              background: p.slo_ok ? 'var(--neon-green)' : 'var(--neon-red)',
              borderRadius:99, transition:'width 0.6s ease',
            }} />
          </div>
        </div>

        {/* Error */}
        {p.last_error && (
          <div style={{ marginTop:8, padding:'6px 10px', background:'#ff3d5a10', border:'1px solid #ff3d5a20', borderRadius:6, fontSize:11, color:'var(--neon-red)', fontFamily:'var(--font-mono)' }}>
            ⚠ {p.last_error}
          </div>
        )}
      </div>

      {/* Expanded: real DAG metadata */}
      {expanded && hasRichData && (
        <div style={{
          borderTop:'1px solid var(--border)',
          padding:'12px 16px',
          background:'var(--bg-elevated)',
          display:'flex', flexDirection:'column', gap:10,
          animation:'fadeIn 0.15s ease',
        }}>
          {/* Schedule */}
          {p.schedule && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Clock size={12} color="var(--neon-cyan)" />
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em', minWidth:70 }}>Schedule</span>
              <code style={{ fontSize:12, color:'var(--neon-cyan)', background:'var(--bg-card)', padding:'1px 8px', borderRadius:4 }}>
                {p.schedule}
              </code>
            </div>
          )}

          {/* Owners */}
          {p.owners?.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <User size={12} color="var(--neon-blue)" />
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em', minWidth:70 }}>Owners</span>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {p.owners.map(o => (
                  <span key={o} style={{ fontSize:11, padding:'1px 8px', background:'#3d7cff15', color:'var(--neon-blue)', border:'1px solid #3d7cff30', borderRadius:99, fontFamily:'var(--font-mono)' }}>
                    {o}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {p.tags?.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <Tag size={12} color="var(--neon-purple)" />
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em', minWidth:70 }}>Tags</span>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {p.tags.map(t => (
                  <span key={t} style={{ fontSize:11, padding:'1px 8px', background:'#a855f715', color:'var(--neon-purple)', border:'1px solid #a855f730', borderRadius:99, fontFamily:'var(--font-mono)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          {p.tasks?.length > 0 && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <List size={12} color="var(--neon-orange)" />
                <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                  Tasks ({p.tasks.length})
                </span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {p.tasks.map((task, i) => (
                  <span key={i} style={{
                    fontSize:11, padding:'2px 10px',
                    background:'#ff6b3510', color:'var(--neon-orange)',
                    border:'1px solid #ff6b3530', borderRadius:99,
                    fontFamily:'var(--font-mono)',
                  }}>
                    {task}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source file */}
          {p.source_file && (
            <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:2 }}>
              📄 {p.source_file}
              {p.catchup !== undefined && (
                <span style={{ marginLeft:12 }}>
                  catchup: <span style={{ color: p.catchup ? 'var(--neon-orange)' : 'var(--neon-green)' }}>
                    {p.catchup ? 'true' : 'false'}
                  </span>
                </span>
              )}
              {p.max_active_runs && (
                <span style={{ marginLeft:12 }}>
                  max_active_runs: <span style={{ color:'var(--neon-cyan)' }}>{p.max_active_runs}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function HealthPage() {
  const [slo,     setSlo]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  const fetchSlo = async () => {
    setLoading(true)
    try { const res = await getSlo(); setSlo(res.data) } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => { fetchSlo() }, [])

  const pipelines = slo?.pipelines || []
  const filtered  = pipelines.filter(p =>
    filter === 'all'    ? true :
    filter === 'failed' ? p.status === 'failed' :
    filter === 'slo'    ? !p.slo_ok :
    filter === 'ok'     ? (p.status === 'success' && p.slo_ok) :
    filter === 'real'   ? p.is_real : true
  )

  const realCount = pipelines.filter(p => p.is_real).length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Header */}
      <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:700 }}>Pipeline Health</h2>
          <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>
            SLO adherence & failure monitoring
            {slo?.has_real_data && (
              <span style={{ marginLeft:10, color:'var(--neon-cyan)', fontFamily:'var(--font-mono)', fontSize:11 }}>
                ● {realCount} real DAG{realCount !== 1 ? 's' : ''} from repo
              </span>
            )}
            {slo && !slo.has_real_data && (
              <span style={{ marginLeft:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:11 }}>
                (demo data — load a repo with Airflow DAGs to see real pipelines)
              </span>
            )}
          </p>
        </div>
        <button onClick={fetchSlo} style={{ padding:'6px 12px', background:'transparent', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', color:'var(--text-secondary)', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stats row */}
      {!loading && slo && (
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
          <SloGauge value={slo.slo_percentage} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, flex:1 }}>
            {[
              { label:'Total Pipelines', value:slo.total_pipelines,             color:'var(--text-primary)' },
              { label:'SLO Passing',     value:slo.slo_passing,                 color:'var(--neon-green)'  },
              { label:'SLO Failing',     value:slo.slo_failing,                 color:slo.slo_failing > 0 ? 'var(--neon-red)' : 'var(--text-muted)' },
              { label:'Real DAGs',       value:slo.real_dag_count ?? 0,         color:'var(--neon-cyan)'   },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', padding:'10px 14px', border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>{label}</div>
                <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'var(--font-mono)', marginTop:2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ padding:'12px 24px', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}>
        {[
          { id:'all',    label:'All' },
          { id:'real',   label:'Real DAGs' },
          { id:'failed', label:'Failed' },
          { id:'slo',    label:'SLO Breach' },
          { id:'ok',     label:'Healthy' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding:'5px 14px', borderRadius:99, fontSize:11, fontFamily:'var(--font-mono)',
            textTransform:'uppercase', letterSpacing:'0.05em',
            background: filter === f.id ? 'var(--neon-cyan)15' : 'transparent',
            border: `1px solid ${filter === f.id ? 'var(--neon-cyan)40' : 'var(--border)'}`,
            color:   filter === f.id ? 'var(--neon-cyan)' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Pipeline list */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:10 }}>
        {loading
          ? Array.from({length:4}).map((_,i) => <SkeletonCard key={i} lines={3} />)
          : filtered.length === 0
          ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'var(--text-muted)' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
              <div style={{ fontWeight:600, marginBottom:6 }}>No pipelines match this filter</div>
              {filter === 'real' && (
                <div style={{ fontSize:12 }}>
                  Load a GitHub repo containing Airflow DAG files to see real pipeline data
                </div>
              )}
            </div>
          )
          : filtered.map(p => <PipelineRow key={p.dag_id} p={p} />)
        }
      </div>
    </div>
  )
}