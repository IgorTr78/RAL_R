'use client'
import { useState, useEffect } from 'react'
import { FileText, Download, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'

const FILTERS = [
  { key: 'all',     label: 'Все' },
  { key: 'ok',      label: 'Готово' },
  { key: 'warning', label: 'Проверить' },
  { key: 'error',   label: 'Ошибки' },
]

const SOURCE_LABELS = {
  'веб-форма': { label: 'Веб-форма', bg: '#ECF6EF', color: '#1C6B41' },
  'почта':     { label: 'Почта',     bg: '#EBF0FE', color: '#3052D6' },
  'api':       { label: 'API',       bg: '#FEF6E0', color: '#92400E' },
}

function SourceBadge({ source }) {
  const s = SOURCE_LABELS[source] || { label: source || 'Веб-форма', bg: '#F0F2F0', color: '#6B7572' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function StatusDot({ status }) {
  if (status === 'pending' || status === 'processing') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#3052D6' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3052D6', display: 'inline-block' }} />
        {status === 'pending' ? 'В очереди' : 'Обработка'}
      </span>
    )
  }
  const map = {
    ok:      { dot: '#1C6B41', label: 'Готово' },
    warning: { dot: '#EAB308', label: 'Проверить' },
    error:   { dot: '#DC2626', label: 'Ошибка' },
  }
  const s = map[status] || map.ok
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function ConfBar({ value }) {
  const pct = Math.round(value || 0)
  const color = pct >= 80 ? '#1C6B41' : pct >= 50 ? '#EAB308' : '#DC2626'
  const textColor = pct >= 80 ? '#1C6B41' : pct >= 50 ? '#92400E' : '#C0392B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 4, borderRadius: 2, background: '#e8f0e8' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: textColor }}>{pct}%</span>
    </div>
  )
}

export default function AllDocumentsList() {
  const [rows, setRows] = useState([])
  const [allFields, setAllFields] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const router = useRouter()

  const load = async () => {
    setLoading(true)

    const { data: docs, error } = await supabase
      .from('documents')
      .select('*, tasks!inner(id, filename, fields, created_at)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Ошибка загрузки документов:', error)
      setLoading(false)
      return
    }

    // Собираем объединённый набор колонок (полей) по всем документам,
    // сохраняя порядок появления
    const fieldSet = []
    for (const d of docs) {
      const taskFields = d.tasks?.fields || []
      for (const f of taskFields) {
        if (!fieldSet.includes(f)) fieldSet.push(f)
      }
    }

    setAllFields(fieldSet)
    setRows(docs.map(d => ({
      id: d.id,
      taskId: d.task_id,
      filename: d.filename,
      size: d.file_size ? (d.file_size / 1024).toFixed(0) + ' КБ' : '—',
      confidence: d.confidence ?? 0,
      status: d.status,
      values: d.values || {},
      source: d.source || 'веб-форма',
      created_at: d.created_at,
    })))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Автообновление, если есть документы в очереди/обработке
  useEffect(() => {
    const hasActive = rows.some(r => r.status === 'pending' || r.status === 'processing')
    if (!hasActive) return
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [rows])

  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        filtered.forEach(r => next.delete(r.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach(r => next.add(r.id))
      return next
    })
  }

  const exportCSV = () => {
    const headers = ['Файл', ...allFields, 'Источник', 'Уверенность', 'Статус']
    const csvRows = [headers.join(',')]

    const rowsToExport = selectedIds.size > 0
      ? filtered.filter(r => selectedIds.has(r.id))
      : filtered

    for (const row of rowsToExport) {
      const cells = [
        row.filename,
        ...allFields.map(f => row.values[f] || ''),
        row.source,
        row.confidence + '%',
        row.status,
      ]
      csvRows.push(cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'все_документы.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ marginTop: 28 }}>
      <p style={{
        fontSize: 12, fontWeight: 700, color: '#9CA6A0',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
      }}>
        Все документы
      </p>

      <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: '1.5px solid #F0F2F0', flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                fontSize: 12.5, padding: '7px 16px', borderRadius: 999, cursor: 'pointer',
                fontWeight: 700, border: 'none',
                background: filter === f.key ? '#16201A' : '#F6F7F6',
                color: filter === f.key ? 'white' : '#6B7572',
              }}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, color: '#16201A', background: '#F6F7F6',
              border: 'none', borderRadius: 10,
              padding: '7px 14px', cursor: 'pointer', fontWeight: 700,
            }}>
              <RefreshCw size={13} /> Обновить
            </button>
            <button onClick={exportCSV} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, padding: '9px 18px', borderRadius: 12,
              background: 'linear-gradient(135deg, #1C6B41 0%, #14532D 100%)', color: 'white', border: 'none',
              cursor: 'pointer', fontWeight: 700, letterSpacing: '-0.01em',
              boxShadow: '0 4px 12px rgba(20,83,45,0.22)',
            }}>
              <Download size={14} />
              {selectedIds.size > 0 ? `Экспорт CSV (${selectedIds.size})` : 'Экспорт CSV'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA6A0', fontSize: 14 }}>
            Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA6A0', fontSize: 14 }}>
            Документов пока нет
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#FAFBFA' }}>
                  <th style={{
                    padding: '12px 16px', textAlign: 'left', width: 1,
                    borderBottom: '1.5px solid #F0F2F0',
                  }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1C6B41' }}
                    />
                  </th>
                  {['Файл', ...allFields, 'Источник', 'Уверенность', 'Статус', ''].map(h => (
                    <th key={h} style={{
                      padding: '12px 24px', textAlign: 'left',
                      fontSize: 11, fontWeight: 700, color: '#9CA6A0',
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      borderBottom: '1.5px solid #F0F2F0', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} style={{
                    borderBottom: '1.5px solid #F6F7F6',
                    background: selectedIds.has(row.id) ? '#ECF6EF'
                      : row.status === 'error' ? '#FDF5F5'
                      : row.status === 'warning' ? '#FEFBF0'
                      : (row.status === 'pending' || row.status === 'processing') ? '#f0f7ff'
                      : 'white',
                  }}>
                    <td style={{ padding: '11px 16px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1C6B41' }}
                      />
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: '#ECF6EF', borderRadius: 6, padding: '4px 7px' }}>
                          <FileText size={14} color="#1C6B41" />
                        </div>
                        <div>
                          <div
                            onClick={() => router.push(`/results/${row.taskId}`)}
                            style={{ fontWeight: 700, color: '#16201A', cursor: 'pointer' }}
                            title="Открыть результаты задачи"
                          >
                            {row.filename}
                          </div>
                          <div style={{ fontSize: 11, color: '#9CA6A0' }}>{row.size}</div>
                        </div>
                      </div>
                    </td>
                    {allFields.map(f => (
                      <td key={f} style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                        {row.values[f] || <span style={{ color: '#C4CCC8', fontStyle: 'italic' }}>не найдено</span>}
                      </td>
                    ))}
                    <td style={{ padding: '11px 16px' }}><SourceBadge source={row.source} /></td>
                    <td style={{ padding: '11px 16px' }}><ConfBar value={row.confidence} /></td>
                    <td style={{ padding: '11px 16px' }}><StatusDot status={row.status} /></td>
                    <td style={{ padding: '11px 16px' }}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
