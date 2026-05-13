import { useApp } from '../../context/AppContext'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'

const ICONS  = { success: CheckCircle, error: AlertCircle, info: Info }
const COLORS = { success: 'var(--neon-green)', error: 'var(--neon-red)', info: 'var(--neon-blue)' }

export default function Notification() {
  const { notification } = useApp()
  if (!notification) return null
  const Icon = ICONS[notification.type] || Info
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: 'var(--bg-elevated)', border: `1px solid ${COLORS[notification.type]}40`,
      borderRadius: 'var(--radius-md)', padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: `0 4px 24px ${COLORS[notification.type]}20`,
      animation: 'fadeIn 0.2s ease',
      maxWidth: 340,
    }}>
      <Icon size={16} color={COLORS[notification.type]} />
      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{notification.msg}</span>
    </div>
  )
}
