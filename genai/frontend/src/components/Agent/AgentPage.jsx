import { useState, useEffect } from 'react'
import { triggerCheck, getTables, getMcpTools } from '../../services/api'
import { Zap, CheckCircle, XCircle, ChevronDown, Database } from 'lucide-react'

function QualityResult({ result }) {
  if (!result) return null
  const totalNulls = Object.values(result.null_counts || {}).reduce((a,b) => a+b, 0)
  return (
    <div style={{ animation:'fadeIn 0.3s ease' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'12px 16px', background: result.passed ? '#22c55e10' : '#ff3d5a10', borderRadius:'var(--radius-md)', border:`1px solid ${result.passed ? '#22c55e30' : '#ff3d5a30'}` }}>
        {result.passed ? <CheckCircle size={18} color="var(--neon-green)" /> : <XCircle size={18} color="var(--neon-red)" />}
        <div>
          <div style={{ fontWeight:700, color: result.passed ? 'var(--neon-green)' : 'var(--neon-red)' }}>
            {result.passed ? 'All Checks Passed' : 'Quality Issues Found'}
          </div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>
            Quality Score: <strong>{result.quality_score}%</strong> · {result.total_rows?.toLocaleString()} rows
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
        {[
          { label:'Total Rows',  value:result.total_rows?.toLocaleString(), icon:'📊' },
          { label:'Null Cells',  value:totalNulls, icon:'⚠️', warn: totalNulls > 0 },
          { label:'Duplicates',  value:result.duplicate_rows, icon:'🔁', warn: result.duplicate_rows > 0 },
        ].map(({ label, value, icon, warn }) => (
          <div key={label} style={{ background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', padding:'12px 14px', border:`1px solid ${warn ? '#ff6b3530' : 'var(--border)'}` }}>
            <div style={{ fontSize:18, marginBottom:6 }}>{icon}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:700, color: warn ? 'var(--neon-orange)' : 'var(--text-primary)', fontFamily:'var(--font-mono)', marginTop:2 }}>{value}</div>
          </div>
        ))}
      </div>

      {Object.keys(result.null_counts || {}).length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:8, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Null Counts by Column</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {Object.entries(result.null_counts).map(([col, cnt]) => (
              <div key={col} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, width:160, flexShrink:0, color:'var(--text-secondary)' }}>{col}</span>
                <div style={{ flex:1, height:6, background:'var(--bg-elevated)', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(100, (cnt/result.total_rows)*100*20)}%`, background: cnt > 0 ? 'var(--neon-orange)' : 'var(--neon-green)', borderRadius:99, transition:'width 0.5s ease' }} />
                </div>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: cnt > 0 ? 'var(--neon-orange)' : 'var(--text-muted)', width:40, textAlign:'right' }}>{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.schema_mismatches?.length > 0 && (
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--neon-red)', marginBottom:8, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Schema Mismatches</div>
          {result.schema_mismatches.map((m,i) => (
            <div key={i} style={{ padding:'8px 12px', background:'#ff3d5a10', border:'1px solid #ff3d5a20', borderRadius:6, fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-primary)', marginBottom:4 }}>
              <strong>{m.column}</strong>: expected <span style={{color:'var(--neon-green)'}}>{m.expected_type}</span> → got <span style={{color:'var(--neon-red)'}}>{m.actual_type}</span> ({m.rows_affected} rows)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentPage() {
  const [tables, setTables]     = useState([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [mcpTools, setMcpTools] = useState([])
  const [history, setHistory]   = useState([])

  useEffect(() => {
    getTables().then(r => setTables(r.data?.tables || [])).catch(() => {})
    getMcpTools().then(r => setMcpTools(r.data?.tools || [])).catch(() => {})
    const handler = e => { setSelected(e.detail); setResult(null) }
    window.addEventListener('triggerCheck', handler)
    return () => window.removeEventListener('triggerCheck', handler)
  }, [])

  const handleTrigger = async () => {
    if (!selected) return
    setLoading(true); setResult(null)
    try {
      const res = await triggerCheck(selected)
      setResult(res.data)
      setHistory(h => [{ table:selected, score:res.data.quality_score, passed:res.data.passed, at:new Date().toLocaleTimeString() }, ...h.slice(0,9)])
    } catch (e) {
      setResult({ error: String(e) })
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)' }}>
        <h2 style={{ fontSize:18, fontWeight:700 }}>Agent Actions</h2>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>MCP-compatible agentic tools</p>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:20 }}>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:'var(--neon-cyan)15', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Zap size={18} color="var(--neon-cyan)" />
            </div>
            <div>
              <div style={{ fontWeight:700 }}>trigger_data_quality_check</div>
              <div style={{ fontSize:11, color:'var(--text-secondary)' }}>Run null, duplicate & schema validation on any table</div>
            </div>
          </div>

          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ flex:1, position:'relative' }}>
              <select value={selected} onChange={e => { setSelected(e.target.value); setResult(null) }} style={{
                width:'100%', padding:'9px 14px', appearance:'none',
                background:'var(--bg-elevated)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-sm)', color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize:13, fontFamily:'var(--font-mono)', outline:'none',
              }}>
                <option value="">Select a table...</option>
                {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                {tables.length === 0 && <option value="demo_orders">demo_orders</option>}
              </select>
              <ChevronDown size={14} color="var(--text-secondary)" style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
            </div>
            <button onClick={handleTrigger} disabled={(!selected && tables.length > 0) || loading} style={{
              padding:'9px 20px',
              background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))',
              border:'none', borderRadius:'var(--radius-sm)',
              color: loading ? 'var(--text-secondary)' : '#050810',
              fontWeight:700, fontSize:13,
              display:'flex', alignItems:'center', gap:8,
              opacity: ((!selected && tables.length > 0) || loading) ? 0.5 : 1,
            }}>
              {loading ? <div style={{ width:14, height:14, border:'2px solid var(--text-muted)', borderTop:'2px solid var(--text-primary)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} /> : <Zap size={14} />}
              {loading ? 'Running...' : 'Trigger Check'}
            </button>
          </div>
          <QualityResult result={result} />
        </div>

        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'20px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
            <Database size={16} color="var(--neon-blue)" />MCP Tool Definitions
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(mcpTools.length > 0 ? mcpTools : [
              { name:'get_tables',           description:'Retrieve all tables from the data catalog' },
              { name:'get_lineage',          description:'Get the data lineage DAG showing table-level dependencies' },
              { name:'get_health',           description:'Get current pipeline health status and SLO adherence' },
              { name:'trigger_quality_check',description:'Run data quality checks: nulls, duplicates, schema mismatches' },
            ]).map(t => (
              <div key={t.name} style={{ padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
                <code style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--neon-cyan)', flexShrink:0, marginTop:1 }}>{t.name}</code>
                <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{t.description}</span>
              </div>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:'20px' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Check History</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {history.map((h,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
                  {h.passed ? <CheckCircle size={14} color="var(--neon-green)" /> : <XCircle size={14} color="var(--neon-red)" />}
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:12, flex:1 }}>{h.table}</span>
                  <span style={{ fontSize:12, color: h.passed ? 'var(--neon-green)' : 'var(--neon-red)' }}>{h.score}%</span>
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>{h.at}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
