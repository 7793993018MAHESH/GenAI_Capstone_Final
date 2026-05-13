import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { loadRepo, repoProgressStream } from '../../services/api'
import { GitBranch, Loader, CheckCircle, AlertCircle } from 'lucide-react'

/**
 * FIX: On successful repo load, reset catalog + lineage state so the UI
 * doesn't show stale data from the previous repo.
 * Previously setCatalogTables([]) was never called here, so switching repos
 * kept the old table list visible until the user manually refreshed.
 */
export default function Topbar() {
  const {
    setRepoLoaded, setRepoInfo, notify,
    setCatalogTables, setCatalogLoading,
    setExpandedTables, setCheckResults,
  } = useApp()

  const [url,      setUrl]      = useState('')
  const [branch,   setBranch]   = useState('main')
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState(null)
  const [progress, setProgress] = useState(null)

  const handleLoad = async () => {
    if (!url.trim()) return
    setLoading(true)
    setStatus(null)
    setProgress({ pct: 0, stage: 'starting', message: 'Connecting...', done: false })

    const evtSource = repoProgressStream(
      (data) => setProgress(data),
      ()     => {}
    )

    try {
      const res = await loadRepo(url.trim(), branch)
      evtSource.close()
      setProgress({ pct: 100, stage: 'done', message: 'Ingestion complete!', done: true })

      // ── FIX: wipe all stale frontend state from the previous repo ──
      setCatalogTables([])
      setCatalogLoading(true)   // forces CatalogPage to re-fetch on next visit
      setExpandedTables({})
      setCheckResults({})
      // ──────────────────────────────────────────────────────────────

      setRepoInfo(res.data)
      setRepoLoaded(true)
      setStatus('ok')
      notify(`Repo loaded: ${res.data.files_processed} files · ${res.data.chunks_indexed} chunks`, 'success')
    } catch (e) {
      evtSource.close()
      setStatus('error')
      setProgress(null)
      notify(typeof e === 'string' ? e : 'Failed to load repo', 'error')
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(null), 2500)
    }
  }

  const stageColor = {
    cloning:   'var(--neon-blue)',
    scanning:  'var(--neon-purple)',
    parsing:   'var(--neon-cyan)',
    embedding: 'var(--neon-orange)',
    saving:    'var(--neon-green)',
    done:      'var(--neon-green)',
  }[progress?.stage] || 'var(--neon-cyan)'

  return (
    <header style={{
      flexShrink: 0,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      position: 'relative',
    }}>
      <div style={{
        height: 60,
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 12,
      }}>
        <GitBranch size={16} color="var(--neon-cyan)" />
        <input
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoad()}
          placeholder="https://github.com/org/repo"
          style={{
            flex: 1, maxWidth: 420,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 12px', color: 'var(--text-primary)',
            fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
        <input
          value={branch} onChange={e => setBranch(e.target.value)}
          placeholder="main"
          style={{
            width: 80,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 10px', color: 'var(--text-primary)',
            fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
        <button onClick={handleLoad} disabled={loading || !url.trim()} style={{
          padding: '7px 18px',
          background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--neon-cyan), var(--neon-blue))',
          color: loading ? 'var(--text-secondary)' : '#050810',
          border: 'none', borderRadius: 'var(--radius-sm)',
          fontSize: 13, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 6,
          opacity: (!url.trim() || loading) ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}>
          {loading ? <Loader size={14} className="animate-spin" /> : null}
          {loading ? 'Loading...' : 'Load Repo'}
        </button>
        {status === 'ok'    && <CheckCircle size={18} color="var(--neon-green)" />}
        {status === 'error' && <AlertCircle size={18} color="var(--neon-red)"   />}

        {progress && !progress.done && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
          }}>
            <span style={{ color: stageColor, fontWeight: 700, textTransform: 'uppercase' }}>
              {progress.stage}
            </span>
            <span style={{ color: 'var(--neon-cyan)', fontWeight: 700, minWidth: 32 }}>
              {progress.pct}%
            </span>
            <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {progress.message}
            </span>
          </div>
        )}
      </div>

      {progress && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, background: 'var(--bg-elevated)',
        }}>
          <div style={{
            height: '100%',
            width: `${progress.pct}%`,
            background: `linear-gradient(90deg, ${stageColor}, var(--neon-blue))`,
            borderRadius: '0 99px 99px 0',
            transition: 'width 0.25s ease, background 0.4s ease',
            animation: progress.done ? 'none' : 'progressPulse 1.5s infinite',
          }} />
        </div>
      )}
    </header>
  )
}