/**
 * reportGenerator.js
 * ──────────────────
 * Generates DE Assistant reports in PDF, CSV, and JSON formats.
 * All logic runs in the browser — no backend required.
 *
 * Sections included:
 *  1. Summary stats (files, chunks, tables, lineage edges, SLO %)
 *  2. Data Catalog — all tables with columns and PII audit
 *  3. PII Risk Report — only tables with sensitive columns
 *  4. Data Lineage — all transformation edges
 *  5. Pipeline Health — DAG status, SLO adherence, failure counts
 */

import { getTables, getLineage, getSlo } from './api'

// ── helpers ──────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function safeFilename(ext) {
  const d = new Date().toISOString().slice(0, 10)
  return `de_report_${d}.${ext}`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── fetch all data ────────────────────────────────────────────────────────────

async function fetchAllData() {
  const [tablesRes, lineageRes, sloRes] = await Promise.all([
    getTables(),
    getLineage(),
    getSlo(),
  ])
  return {
    tables:  tablesRes.data?.tables  || [],
    lineage: lineageRes.data         || { nodes: [], edges: [] },
    slo:     sloRes.data             || {},
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export async function downloadJSON() {
  const { tables, lineage, slo } = await fetchAllData()

  const report = {
    meta: {
      generated_at:    timestamp(),
      tool:            'DE AI Assistant',
      format_version:  '1.0',
    },
    summary: {
      total_tables:     tables.length,
      pii_tables:       tables.filter(t => t.has_pii).length,
      clean_tables:     tables.filter(t => !t.has_pii).length,
      lineage_nodes:    lineage.nodes?.length || 0,
      lineage_edges:    lineage.edges?.length || 0,
      total_pipelines:  slo.total_pipelines  || 0,
      slo_passing:      slo.slo_passing      || 0,
      slo_percentage:   slo.slo_percentage   || 0,
    },
    data_catalog: tables.map(t => ({
      name:        t.name,
      source_file: t.source_file,
      has_pii:     t.has_pii,
      columns:     t.columns,
      pii_columns: t.pii_columns,
    })),
    pii_audit: tables
      .filter(t => t.has_pii)
      .map(t => ({
        table:       t.name,
        source_file: t.source_file,
        pii_columns: t.pii_columns,
      })),
    data_lineage: {
      nodes: lineage.nodes,
      edges: lineage.edges,
    },
    pipeline_health: {
      slo_percentage:     slo.slo_percentage,
      total_pipelines:    slo.total_pipelines,
      slo_passing:        slo.slo_passing,
      slo_failing:        slo.slo_failing,
      critical_pipelines: slo.critical_pipelines,
      pipelines:          slo.pipelines,
    },
  }

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  downloadBlob(blob, safeFilename('json'))
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT  (multi-sheet → multiple files zipped, or single file with sections)
// We produce ONE csv with clearly delimited sections (Excel/Sheets friendly).
// ─────────────────────────────────────────────────────────────────────────────

function csvRow(cells) {
  return cells.map(c => {
    const s = String(c ?? '').replace(/"/g, '""')
    return /[,"\n\r]/.test(s) ? `"${s}"` : s
  }).join(',')
}

function csvSection(title, headers, rows) {
  const lines = [
    `### ${title}`,
    csvRow(headers),
    ...rows.map(r => csvRow(r)),
    '',
  ]
  return lines.join('\n')
}

export async function downloadCSV() {
  const { tables, lineage, slo } = await fetchAllData()

  const sections = []

  // 1. Summary
  sections.push(csvSection(
    'SUMMARY',
    ['Metric', 'Value'],
    [
      ['Generated At',    timestamp()],
      ['Total Tables',    tables.length],
      ['PII Tables',      tables.filter(t => t.has_pii).length],
      ['Clean Tables',    tables.filter(t => !t.has_pii).length],
      ['Lineage Edges',   lineage.edges?.length || 0],
      ['Total Pipelines', slo.total_pipelines || 0],
      ['SLO %',           `${slo.slo_percentage || 0}%`],
      ['SLO Passing',     slo.slo_passing || 0],
      ['SLO Failing',     slo.slo_failing || 0],
    ]
  ))

  // 2. Data Catalog
  sections.push(csvSection(
    'DATA CATALOG',
    ['Table Name', 'Source File', 'Has PII', 'Column Count', 'Columns', 'PII Columns'],
    tables.map(t => [
      t.name,
      t.source_file,
      t.has_pii ? 'YES' : 'NO',
      t.columns.length,
      t.columns.join(' | '),
      t.pii_columns.map(p => `${p.column}(${p.pii_types.join('+')})`).join(' | '),
    ])
  ))

  // 3. PII Audit
  const piiTables = tables.filter(t => t.has_pii)
  sections.push(csvSection(
    'PII AUDIT',
    ['Table Name', 'Source File', 'PII Column', 'PII Types'],
    piiTables.flatMap(t =>
      t.pii_columns.map(p => [
        t.name,
        t.source_file,
        p.column,
        p.pii_types.join(', '),
      ])
    )
  ))

  // 4. Data Lineage
  sections.push(csvSection(
    'DATA LINEAGE',
    ['Source Table', 'Target Table', 'Transformation', 'File'],
    (lineage.edges || []).map(e => [e.source, e.target, e.transformation, e.file])
  ))

  // 5. Pipeline Health
  sections.push(csvSection(
    'PIPELINE HEALTH',
    ['DAG ID', 'Status', 'Last Run', 'Duration Actual(s)', 'Duration Expected(s)', 'SLO OK', 'Success Rate %', 'Failure Count', 'Last Error'],
    (slo.pipelines || []).map(p => [
      p.dag_id,
      p.status,
      p.last_run,
      p.duration_actual,
      p.duration_expected,
      p.slo_ok ? 'YES' : 'NO',
      p.success_rate,
      p.failure_count,
      p.last_error || '',
    ])
  ))

  const blob = new Blob([sections.join('\n')], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, safeFilename('csv'))
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT  (built with plain HTML → window.print trick — no library needed)
// Opens a styled print window the user saves as PDF via Ctrl+P / Cmd+P.
// ─────────────────────────────────────────────────────────────────────────────

function badge(text, color) {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${color}20;color:${color};border:1px solid ${color}40;">${text}</span>`
}

function htmlTable(headers, rows, colWidths = []) {
  const thStyle = 'padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;border-bottom:1px solid #e2e8f0;'
  const tdStyle = 'padding:8px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:top;word-break:break-word;'
  const ths = headers.map((h, i) => `<th style="${thStyle}${colWidths[i] ? `width:${colWidths[i]};` : ''}">${h}</th>`).join('')
  const trs = rows.map(row =>
    `<tr>${row.map(cell => `<td style="${tdStyle}">${cell}</td>`).join('')}</tr>`
  ).join('')
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:24px;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

function sectionHeader(title, icon) {
  return `<div style="display:flex;align-items:center;gap:10px;margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid #3d7cff20;">
    <span style="font-size:18px;">${icon}</span>
    <h2 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${title}</h2>
  </div>`
}

export async function downloadPDF() {
  const { tables, lineage, slo } = await fetchAllData()

  const piiTables  = tables.filter(t => t.has_pii)
  const now        = timestamp()
  const sloColor   = (slo.slo_percentage || 0) >= 90 ? '#22c55e' : (slo.slo_percentage || 0) >= 70 ? '#ff6b35' : '#ff3d5a'

  // ── Summary cards ─────────────────────────────────────────────────────────
  const summaryCards = [
    { label: 'Total Tables',     value: tables.length,             color: '#3d7cff' },
    { label: 'PII Tables',       value: piiTables.length,          color: '#ff6b35' },
    { label: 'Lineage Edges',    value: lineage.edges?.length || 0, color: '#a855f7' },
    { label: 'Total Pipelines',  value: slo.total_pipelines || 0,  color: '#00b4d8' },
    { label: 'SLO Passing',      value: slo.slo_passing || 0,      color: '#22c55e' },
    { label: 'SLO %',            value: `${slo.slo_percentage || 0}%`, color: sloColor },
  ].map(c => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;text-align:center;">
      <div style="font-size:26px;font-weight:700;color:${c.color};font-family:monospace;">${c.value}</div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">${c.label}</div>
    </div>`).join('')

  // ── Catalog table rows ────────────────────────────────────────────────────
  const catalogRows = tables.map(t => [
    `<strong style="font-family:monospace;font-size:12px;">${t.name}</strong>`,
    t.has_pii ? badge('PII', '#ff6b35') : badge('Clean', '#22c55e'),
    `<span style="font-size:11px;color:#64748b;">${t.source_file?.split('/').pop() || '—'}</span>`,
    String(t.columns.length),
    `<span style="font-size:11px;color:#475569;">${t.columns.slice(0, 6).join(', ')}${t.columns.length > 6 ? ` +${t.columns.length - 6} more` : ''}</span>`,
  ])

  // ── PII audit rows ────────────────────────────────────────────────────────
  const piiRows = piiTables.flatMap(t =>
    t.pii_columns.map(p => [
      `<strong style="font-family:monospace;font-size:12px;">${t.name}</strong>`,
      `<code style="font-size:11px;background:#fff7ed;padding:2px 6px;border-radius:4px;color:#c2410c;">${p.column}</code>`,
      p.pii_types.map(tp => badge(tp, '#ff6b35')).join(' '),
      `<span style="font-size:11px;color:#64748b;">${t.source_file}</span>`,
    ])
  )

  // ── Lineage rows ──────────────────────────────────────────────────────────
  const lineageRows = (lineage.edges || []).map(e => [
    `<code style="font-size:11px;background:#eff6ff;padding:2px 6px;border-radius:4px;color:#1d4ed8;">${e.source}</code>`,
    '→',
    `<code style="font-size:11px;background:#f0fdf4;padding:2px 6px;border-radius:4px;color:#15803d;">${e.target}</code>`,
    badge(e.transformation?.replace('_', ' ') || '—', '#3d7cff'),
    `<span style="font-size:11px;color:#64748b;">${e.file?.split('/').pop() || '—'}</span>`,
  ])

  // ── Health rows ───────────────────────────────────────────────────────────
  const statusColor = { success: '#22c55e', failed: '#ff3d5a', running: '#3d7cff' }
  const healthRows = (slo.pipelines || []).map(p => [
    `<strong style="font-family:monospace;font-size:11px;">${p.dag_id}</strong>`,
    badge(p.status, statusColor[p.status] || '#64748b'),
    p.slo_ok ? badge('OK', '#22c55e') : badge('BREACH', '#ff3d5a'),
    `${p.success_rate}%`,
    `${p.duration_actual}s / ${p.duration_expected}s`,
    p.failure_count,
    `<span style="font-size:10px;color:#64748b;">${new Date(p.last_run).toLocaleString()}</span>`,
  ])

  // ── Assemble HTML ─────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>DE Report — ${now}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: white; padding: 40px 48px; }
    @media print {
      body { padding: 20px 32px; }
      .no-print { display: none; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- Cover -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #3d7cff;">
    <div>
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#3d7cff;font-weight:600;margin-bottom:8px;">Data Engineering AI Assistant</div>
      <h1 style="font-size:28px;font-weight:700;color:#0f172a;margin-bottom:6px;">Pipeline & Catalog Report</h1>
      <div style="font-size:13px;color:#64748b;">Generated: ${now}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:32px;font-weight:700;color:${sloColor};font-family:monospace;">${slo.slo_percentage || 0}%</div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Overall SLO</div>
    </div>
  </div>

  <!-- Print button (hidden in PDF) -->
  <div class="no-print" style="margin-bottom:24px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#3d7cff;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
      ⬇ Save as PDF (Ctrl+P / Cmd+P)
    </button>
    <span style="font-size:12px;color:#64748b;margin-left:12px;">In the print dialog, choose "Save as PDF"</span>
  </div>

  <!-- Summary -->
  ${sectionHeader('Executive Summary', '📊')}
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:8px;">
    ${summaryCards}
  </div>

  <!-- Data Catalog -->
  ${sectionHeader('Data Catalog', '🗄️')}
  <p style="font-size:12px;color:#64748b;margin-bottom:12px;">${tables.length} tables discovered · ${piiTables.length} contain PII data</p>
  ${htmlTable(
    ['Table Name', 'PII Status', 'Source File', 'Columns', 'Schema Preview'],
    catalogRows,
    ['22%', '10%', '16%', '8%', '44%']
  )}

  <!-- PII Audit -->
  ${sectionHeader('PII Risk Audit', '🔐')}
  ${piiRows.length === 0
    ? '<p style="font-size:13px;color:#22c55e;padding:12px 0;">✅ No PII detected across all tables.</p>'
    : `<p style="font-size:12px;color:#64748b;margin-bottom:12px;">${piiRows.length} sensitive column(s) found across ${piiTables.length} table(s)</p>
       ${htmlTable(['Table', 'Column', 'PII Types', 'Source File'], piiRows, ['22%', '20%', '22%', '36%'])}`
  }

  <!-- Data Lineage -->
  ${sectionHeader('Data Lineage', '🔗')}
  <p style="font-size:12px;color:#64748b;margin-bottom:12px;">${lineage.edges?.length || 0} transformation edges across ${lineage.nodes?.length || 0} tables</p>
  ${lineageRows.length === 0
    ? '<p style="font-size:13px;color:#64748b;padding:12px 0;">No lineage edges found. Load a repo with INSERT INTO … SELECT statements.</p>'
    : htmlTable(['Source', '', 'Target', 'Type', 'File'], lineageRows, ['22%', '4%', '22%', '14%', '38%'])
  }

  <!-- Pipeline Health -->
  ${sectionHeader('Pipeline Health & SLO', '⚡')}
  <p style="font-size:12px;color:#64748b;margin-bottom:12px;">${slo.slo_passing || 0} of ${slo.total_pipelines || 0} pipelines meeting SLO targets</p>
  ${healthRows.length === 0
    ? '<p style="font-size:13px;color:#64748b;padding:12px 0;">No pipeline data available.</p>'
    : htmlTable(['DAG ID', 'Status', 'SLO', 'Success Rate', 'Duration', 'Failures', 'Last Run'], healthRows, ['22%', '9%', '8%', '10%', '14%', '8%', '29%'])
  }

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;">
    <span>DE AI Assistant · Powered by local Ollama LLM</span>
    <span>Report generated ${now}</span>
  </div>

</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this page and try again.')
    return
  }
  win.document.write(html)
  win.document.close()
  // Auto-trigger print dialog after styles settle
  win.addEventListener('load', () => setTimeout(() => win.print(), 400))
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function downloadReport(format) {
  if (format === 'pdf')  return downloadPDF()
  if (format === 'csv')  return downloadCSV()
  if (format === 'json') return downloadJSON()
  throw new Error(`Unknown format: ${format}`)
}