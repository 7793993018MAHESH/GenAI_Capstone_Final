import axios from 'axios'

const BASE = 'http://localhost:8000'

const api = axios.create({ baseURL: BASE, timeout: 120000 })

api.interceptors.response.use(
  r => r.data,
  e => Promise.reject(e?.response?.data?.message || e.message || 'Request failed')
)

export const loadRepo     = (repo_url, branch = 'main') => api.post('/load-repo', { repo_url, branch })
export const sendChat     = (message, history = [])     => api.post('/chat', { message, history })
export const getTables    = ()                          => api.get('/tables')
export const getLineage   = ()                          => api.get('/lineage')
export const getHealth    = ()                          => api.get('/health')
export const getSlo       = ()                          => api.get('/slo')
export const triggerCheck = (table_name)                => api.post('/trigger-check', { table_name })
export const getMcpTools  = ()                          => api.get('/mcp/tools')
export const checkOllamaHealth = () => api.get('/ollama-health')

export const uploadCsv = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/upload-csv', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
/**
 * FIX [10]: SSE helper for real-time repo ingestion progress.
 *
 * Opens an EventSource to /repo-progress and calls:
 *   onProgress(data) on every event  — data = { stage, pct, current, total, message, done }
 *   onDone()         when done=true
 *
 * Returns the EventSource so the caller can close it early if needed.
 *
 * Usage:
 *   const src = repoProgressStream(
 *     (data) => setProgress(data),
 *     ()     => console.log('done')
 *   )
 *   // later: src.close()
 */
export function repoProgressStream(onProgress, onDone) {
  const source = new EventSource(`${BASE}/repo-progress`)
  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onProgress(data)
      if (data.done) {
        source.close()
        onDone?.()
      }
    } catch (_) {}
  }
  source.onerror = () => source.close()
  return source
}

/** Async generator for streaming chat tokens (SSE) */
export async function* streamChat(message, history = []) {
  const resp = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = dec.decode(value).split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6))
        } catch (_) {}
      }
    }
  }
}
