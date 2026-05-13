import { useCallback } from 'react'
import { streamChat } from '../services/api'

export function useChat(messages, setMessages, loading, setLoading) {
  const sendMessage = useCallback(async (text, history, onProgress) => {
    if (!text.trim() || loading) return
    setLoading(true)

    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', content: text }])

    const msgId = `a_${Date.now()}_${Math.random().toString(36).slice(2)}`
    setMessages(prev => [...prev, {
      id: msgId, role: 'assistant', content: '', streaming: true, sources: [],
      tokenCount: 0, startTime: Date.now()
    }])

    try {
      let full = ''
      let tokenCount = 0
      const startTime = Date.now()

      for await (const chunk of streamChat(text, history)) {
        if (chunk.token) {
          full += chunk.token
          tokenCount++
          const elapsed = (Date.now() - startTime) / 1000
          const tokensPerSec = elapsed > 0 ? Math.round(tokenCount / elapsed) : 0

          onProgress?.({ tokenCount, elapsed: elapsed.toFixed(1), tokensPerSec })

          setMessages(prev =>
            prev.map(m => m.id === msgId
              ? { ...m, content: full, tokenCount, elapsed, tokensPerSec }
              : m
            )
          )
        }
        if (chunk.done)  break
        if (chunk.error) throw new Error(chunk.error)
      }
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, streaming: false } : m)
      )
    } catch (e) {
      setMessages(prev =>
        prev.map(m => m.id === msgId
          ? { ...m, content: `Error: ${e.message || e}`, streaming: false, error: true }
          : m
        )
      )
    } finally {
      setLoading(false)
      onProgress?.(null)
    }
  }, [loading, setMessages, setLoading])

  return { sendMessage }
}