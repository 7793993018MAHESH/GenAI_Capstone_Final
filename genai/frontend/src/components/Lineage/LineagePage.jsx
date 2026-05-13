import { useState, useEffect, useCallback } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  MarkerType, useReactFlow, ReactFlowProvider,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { getLineage } from '../../services/api'
import { GitBranch, RefreshCw, ZoomIn, Maximize2, ChevronRight, Database, X } from 'lucide-react'

// ─── Topological layout (no external deps) ──────────────────────────────────
function computeDAGLayout(rawNodes, rawEdges) {
  if (!rawNodes.length) return { nodes: [], edges: [] }

  const NODE_W = 180
  const NODE_H = 48
  const H_GAP  = 100
  const V_GAP  = 32

  // Build adjacency maps
  const inDegree  = {}
  const outMap    = {}
  rawNodes.forEach(n => { inDegree[n.id] = 0; outMap[n.id] = [] })
  rawEdges.forEach(e => {
    if (inDegree[e.target] !== undefined) inDegree[e.target]++
    if (outMap[e.source])                 outMap[e.source].push(e.target)
  })

  // BFS to assign levels (longest path from root)
  const level = {}
  const queue = rawNodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
  queue.forEach(id => { level[id] = 0 })

  const visited = new Set(queue)
  while (queue.length) {
    const curr = queue.shift()
    ;(outMap[curr] || []).forEach(next => {
      level[next] = Math.max(level[next] ?? 0, (level[curr] ?? 0) + 1)
      if (!visited.has(next)) { visited.add(next); queue.push(next) }
    })
  }
  // Any unvisited (isolated / cycle nodes) go to level 0
  rawNodes.forEach(n => { if (level[n.id] === undefined) level[n.id] = 0 })

  // Group nodes by level
  const byLevel = {}
  rawNodes.forEach(n => {
    const l = level[n.id] ?? 0
    if (!byLevel[l]) byLevel[l] = []
    byLevel[l].push(n.id)
  })

  // Compute x by level, y centered within level
  const positions = {}
  const maxCount  = Math.max(...Object.values(byLevel).map(a => a.length))
  Object.entries(byLevel).forEach(([lStr, ids]) => {
    const l       = parseInt(lStr)
    const x       = l * (NODE_W + H_GAP) + 60
    const totalH  = ids.length * (NODE_H + V_GAP) - V_GAP
    const startY  = (maxCount * (NODE_H + V_GAP) - totalH) / 2 + 40
    ids.forEach((id, i) => {
      positions[id] = { x, y: startY + i * (NODE_H + V_GAP) }
    })
  })

  // Classify nodes: source (no incoming), sink (no outgoing), intermediate
  const hasIncoming  = new Set(rawEdges.map(e => e.target))
  const hasOutgoing  = new Set(rawEdges.map(e => e.source))

  const flowNodes = rawNodes.map(n => {
    const isSource = !hasIncoming.has(n.id)
    const isSink   = !hasOutgoing.has(n.id)
    const nodeType = isSource ? 'source' : isSink ? 'sink' : 'intermediate'
    const colors   = {
      source:       { bg: '#0f2942', border: '#3d7cff', text: '#3d7cff' },
      intermediate: { bg: '#0f2226', border: '#00f5c4', text: '#00f5c4' },
      sink:         { bg: '#0f2918', border: '#22c55e', text: '#22c55e' },
    }
    const c = colors[nodeType]
    return {
      id:       n.id,
      type:     'default',
      data:     { label: n.label, nodeType },
      position: positions[n.id] ?? { x: 60, y: 60 },
      style: {
        background:  c.bg,
        border:      `1px solid ${c.border}`,
        borderRadius: 8,
        padding:     '8px 14px',
        color:       c.text,
        fontFamily:  "'Space Mono', monospace",
        fontSize:    12,
        fontWeight:  700,
        minWidth:    NODE_W,
        textAlign:   'center',
        boxShadow:   `0 0 12px ${c.border}30`,
      },
    }
  })

  const TRANSFORM_COLOR = {
    INSERT_SELECT: '#3d7cff',
    CTAS:          '#a855f7',
    JOIN:          '#ff6b35',
  }

  const flowEdges = rawEdges.map((e, i) => ({
    id:         `edge-${i}`,
    source:     e.source,
    target:     e.target,
    type:       'smoothstep',
    animated:   false,
    label:      e.transformation?.replace('_', ' '),
    markerEnd:  { type: MarkerType.ArrowClosed, color: TRANSFORM_COLOR[e.transformation] ?? '#00f5c4', width: 16, height: 16 },
    style:      { stroke: TRANSFORM_COLOR[e.transformation] ?? '#00f5c4', strokeWidth: 1.5 },
    labelStyle: { fill: '#64748b', fontSize: 9, fontFamily: "'Space Mono', monospace", fontWeight: 600 },
    labelBgStyle: { fill: '#0d1117', fillOpacity: 0.9 },
    labelBgPadding: [4, 4],
    labelBgBorderRadius: 4,
  }))

  return { nodes: flowNodes, edges: flowEdges }
}

// ─── Detail panel ────────────────────────────────────────────────────────────
function DetailPanel({ node, edges, onClose }) {
  if (!node) return null
  const inEdges  = edges.filter(e => e.target === node.id)
  const outEdges = edges.filter(e => e.source === node.id)
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 10,
      width: 260, background: 'var(--bg-elevated)',
      border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--neon-cyan)' }}>
          {node.id}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
        {node.data?.nodeType}
      </div>
      {inEdges.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Upstream sources</div>
          {inEdges.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: '#3d7cff', marginBottom: 2 }}>
              <ChevronRight size={10} /> {e.source}
            </div>
          ))}
        </div>
      )}
      {outEdges.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Downstream targets</div>
          {outEdges.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: '#22c55e', marginBottom: 2 }}>
              <ChevronRight size={10} /> {e.target}
            </div>
          ))}
        </div>
      )}
      {inEdges.length === 0 && outEdges.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Isolated node — no lineage edges</div>
      )}
    </div>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: '#3d7cff', label: 'Source table' },
    { color: '#00f5c4', label: 'Intermediate' },
    { color: '#22c55e', label: 'Sink / Output' },
  ]
  const edgeTypes = [
    { color: '#3d7cff', label: 'INSERT SELECT' },
    { color: '#a855f7', label: 'CTAS' },
    { color: '#ff6b35', label: 'JOIN' },
  ]
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 11,
      display: 'flex', gap: 20, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Nodes</div>
        {items.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.8 }} />
            {label}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>Edges</div>
        {edgeTypes.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <div style={{ width: 16, height: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Inner graph component (needs ReactFlowProvider context) ─────────────────
function LineageGraph({ rawNodes, rawEdges, loading, onNodeClick, selectedNode, setSelectedNode, rawEdgeData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!rawNodes.length) return
    const { nodes: ln, edges: le } = computeDAGLayout(rawNodes, rawEdges)
    setNodes(ln)
    setEdges(le)
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
  }, [rawNodes, rawEdges])

  const handleNodeClick = useCallback((_, node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  if (loading) return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-secondary)', background: 'var(--bg-base)' }}>
      <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTop: '2px solid var(--neon-cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>Building lineage graph...</span>
    </div>
  )

  if (!rawNodes.length) return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
      <GitBranch size={48} style={{ opacity: 0.2 }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No lineage data found</div>
        <div style={{ fontSize: 12 }}>Load a repo with SQL files containing CREATE TABLE + INSERT INTO statements</div>
      </div>
    </div>
  )

  return (
    <>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1} maxZoom={2}
        style={{ background: 'var(--bg-base)' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a2438" gap={24} size={1} variant="dots" />
        <Controls
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
          showInteractive={false}
        />
        <MiniMap
          nodeColor={n => {
            if (n.data?.nodeType === 'source')       return '#3d7cff'
            if (n.data?.nodeType === 'sink')         return '#22c55e'
            return '#00f5c4'
          }}
          maskColor="rgba(5,8,16,0.8)"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
        />
        <Panel position="bottom-left" style={{ margin: 12 }}>
          <Legend />
        </Panel>
      </ReactFlow>

      {/* Detail panel */}
      <DetailPanel
        node={selectedNode}
        edges={rawEdgeData}
        onClose={() => setSelectedNode(null)}
      />
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LineagePage() {
  const [rawNodes,    setRawNodes]    = useState([])
  const [rawEdges,    setRawEdges]    = useState([])
  const [rawEdgeData, setRawEdgeData] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [stats,       setStats]       = useState({ nodes: 0, edges: 0 })
  const [selectedNode, setSelectedNode] = useState(null)

  const fetchLineage = async () => {
    setLoading(true)
    setSelectedNode(null)
    try {
      const res  = await getLineage()
      const data = res.data || {}
      setRawNodes(data.nodes || [])
      setRawEdges(data.edges || [])
      setRawEdgeData(data.edges || [])
      setStats({ nodes: (data.nodes || []).length, edges: (data.edges || []).length })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLineage() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <GitBranch size={18} color="var(--neon-cyan)" />
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Data Lineage</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, marginTop: 2 }}>
              {loading ? 'Loading...' : `${stats.nodes} tables · ${stats.edges} transformation edges`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Node type summary chips */}
          {!loading && stats.nodes > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 8 }}>
              {[
                { color: '#3d7cff', label: 'Sources' },
                { color: '#00f5c4', label: 'Transforms' },
                { color: '#22c55e', label: 'Sinks' },
              ].map(({ color, label }) => (
                <span key={label} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 99,
                  background: `${color}15`, border: `1px solid ${color}40`,
                  color, fontFamily: 'var(--font-mono)',
                }}>{label}</span>
              ))}
            </div>
          )}
          <button onClick={fetchLineage} style={{
            padding: '6px 14px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text-secondary)', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ReactFlowProvider>
          <LineageGraph
            rawNodes={rawNodes} rawEdges={rawEdges}
            rawEdgeData={rawEdgeData}
            loading={loading}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}