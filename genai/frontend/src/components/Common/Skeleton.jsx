export function SkeletonLine({ width = '100%', height = 16, style = {} }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 4, ...style }} />
}
export function SkeletonCard({ lines = 3 }) {
  return (
    <div style={{ padding: 16, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SkeletonLine width="60%" height={18} />
      {Array.from({ length: lines }).map((_, i) => <SkeletonLine key={i} width={`${70 + Math.random() * 25}%`} />)}
    </div>
  )
}
