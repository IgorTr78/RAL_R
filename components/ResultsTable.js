'use client'
import React, { useState, useEffect } from 'react'
import { FileText, Download, Loader2, Check, X as XIcon, Pencil, RefreshCw, ChevronDown, ImageOff } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const FILTERS = [
  { key: 'all',     label: 'Все' },
  { key: 'ok',      label: 'Готово' },
  { key: 'warning', label: 'Проверить' },
  { key: 'error',   label: 'Ошибки' },
]

function ConfBar({ value }) {
  const pct = Math.round(value)
  const color = pct >= 80 ? '#1C6B41' : pct >= 50 ? '#EAB308' : '#DC2626'
  const textColor = pct >= 80 ? '#1C6B41' : pct >= 50 ? '#92400E' : '#C0392B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 4, borderRadius: 2, background: '#e8f0e8' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, color: textColor }}>{pct}%</span>
    </div>
  )
}

function StatusDot({ status }) {
  if (status === 'pending' || status === 'processing') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: '#3052D6' }}>
        <Loader2 size={12} className="animate-spin" />
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

export default function ResultsTable({ fields = [], rows = [], taskName = '', taskId = null }) {
  const [filter, setFilter] = useState('all')
  const [localRows, setLocalRows] = useState(rows)
  const [editingId, setEditingId] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [previewUrls, setPreviewUrls] = useState({})
  const [previewLoading, setPreviewLoading] = useState(null)

  const RETRY_MODELS = [
    { id: 'gpt-4o-mini',    label: 'GPT-4o mini',     desc: 'быстро и дёшево' },
    { id: 'gpt-4o',         label: 'GPT-4o',           desc: 'точнее, дороже' },
    { id: 'GigaChat-2-Pro', label: 'GigaChat 2 Pro',  desc: 'Сбер, русский язык' },
    { id: 'GigaChat-2-Max', label: 'GigaChat 2 Max',  desc: 'Сбер, максимум' },
  ]

  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  const startEdit = (row) => {
    setEditingId(row.id)
    setEditValues({ ...(row.values || {}) })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditValues({})
  }

  const saveEdit = async (row) => {
    setSavingId(row.id)
    try {
      const { error } = await supabase
        .from('documents')
        .update({ values: editValues, status: 'ok', confidence: 100, error_message: null })
        .eq('id', row.id)

      if (error) throw error

      setLocalRows(prev => prev.map(r =>
        r.id === row.id
          ? { ...r, values: editValues, status: 'ok', confidence: 100 }
          : r
      ))
      setEditingId(null)
      setEditValues({})
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  const togglePreview = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(row.id)

    if (!previewUrls[row.id] && row.file_path) {
      setPreviewLoading(row.id)
      try {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(row.file_path, 3600)

        if (error) throw error
        setPreviewUrls(prev => ({ ...prev, [row.id]: data.signedUrl }))
      } catch (err) {
        setPreviewUrls(prev => ({ ...prev, [row.id]: 'error' }))
      } finally {
        setPreviewLoading(null)
      }
    }
  }

  const retryRecognition = async (row, model) => {
    try {
      setExpandedId(null)
      setLocalRows(prev => prev.map(r =>
        r.id === row.id ? { ...r, status: 'pending' } : r
      ))

      await supabase
        .from('documents')
        .update({ status: 'pending', error_message: null, model: model })
        .eq('id', row.id)

      if (taskId) {
        await supabase
          .from('tasks')
          .update({ status: 'pending' })
          .eq('id', taskId)
      }
    } catch (err) {
      alert('Ошибка запуска распознавания: ' + err.message)
    }
  }

  // Опрашиваем статус документов, которые сейчас в очереди/обработке
  useEffect(() => {
    const pendingIds = localRows
      .filter(r => r.status === 'pending' || r.status === 'processing')
      .map(r => r.id)

    if (pendingIds.length === 0) return

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .in('id', pendingIds)

      if (data) {
        setLocalRows(prev => prev.map(r => {
          const updated = data.find(d => d.id === r.id)
          if (updated && updated.status !== 'pending' && updated.status !== 'processing') {
            return {
              ...r,
              status: updated.status,
              confidence: updated.confidence ?? 0,
              values: updated.values || {},
            }
          }
          return r
        }))
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [localRows, taskId])

  const rowsData = localRows

  const filtered = filter === 'all' ? rowsData : rowsData.filter(r => r.status === filter)

  const exportCSV = () => {
    const header = ['Файл', ...fields, 'Уверенность', 'Статус'].join(',')
    const body = rowsData.map(r => [
      r.filename,
      ...fields.map(f => r.values?.[f] ?? ''),
      r.confidence,
      r.status,
    ].join(','))
    const csv = [header, ...body].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `results_${taskName}.csv`; a.click()
  }

  const statCounts = {
    total: rowsData.length,
    ok: rowsData.filter(r => r.status === 'ok').length,
    warning: rowsData.filter(r => r.status === 'warning').length,
    error: rowsData.filter(r => r.status === 'error').length,
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Всего документов', value: statCounts.total, color: '#16201A' },
          { label: 'Распознано успешно', value: statCounts.ok, color: '#1C6B41' },
          { label: 'Требуют проверки', value: statCounts.warning, color: '#92400E' },
          { label: 'Ошибки', value: statCounts.error, color: '#C0392B' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'white', borderRadius: 18,
            padding: '20px 22px',
            boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
          }}>
            <div style={{ fontSize: 12.5, color: '#9CA6A0', marginBottom: 10, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.value}</div>
          </div>
        ))}
      </div>

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
          <button onClick={exportCSV} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontSize: 13, padding: '9px 18px', borderRadius: 12,
            background: 'linear-gradient(135deg, #1C6B41 0%, #14532D 100%)', color: 'white', border: 'none',
            cursor: 'pointer', fontWeight: 700, letterSpacing: '-0.01em',
            boxShadow: '0 4px 12px rgba(20,83,45,0.22)',
          }}>
            <Download size={14} /> Экспорт CSV
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#FAFBFA' }}>
                {['#', 'Файл', ...fields, 'Уверенность', 'Статус', ''].map(h => (
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
              {filtered.map((row, i) => (
                <React.Fragment key={row.id}>
                <tr style={{
                  borderBottom: expandedId === row.id ? 'none' : '1.5px solid #F6F7F6',
                  background: row.status === 'error' ? '#FDF5F5'
                    : row.status === 'warning' ? '#FEFBF0'
                    : (row.status === 'pending' || row.status === 'processing') ? '#f0f7ff'
                    : 'white',
                }}>
                  <td style={{ padding: '11px 16px', color: '#9CA6A0' }}>{i + 1}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <div
                      onClick={() => togglePreview(row)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      title="Показать изображение документа"
                    >
                      <div style={{ background: '#ECF6EF', borderRadius: 6, padding: '4px 7px' }}>
                        <FileText size={14} color="#1C6B41" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, color: '#16201A', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {row.filename}
                          <ChevronDown
                            size={13}
                            color="#9CA6A0"
                            style={{
                              transition: 'transform 0.15s',
                              transform: expandedId === row.id ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA6A0' }}>{row.size}</div>
                      </div>
                    </div>
                  </td>
                  {fields.map(f => (
                    <td key={f} style={{ padding: '11px 16px', minWidth: 140 }}>
                      {editingId === row.id ? (
                        <input
                          value={editValues[f] ?? ''}
                          onChange={(e) => setEditValues(prev => ({ ...prev, [f]: e.target.value }))}
                          style={{
                            width: '100%', fontSize: 13, padding: '5px 8px',
                            border: '1.5px solid #1C6B41', borderRadius: 6,
                            color: '#16201A', fontFamily: 'inherit',
                          }}
                        />
                      ) : row.values?.[f] ? (
                        <span style={{ color: '#16201A' }}>{row.values[f]}</span>
                      ) : (
                        <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: 12 }}>не найдено</span>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '11px 16px' }}>
                    <ConfBar value={row.confidence ?? 0} />
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <StatusDot status={row.status} />
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    {row.status === 'pending' || row.status === 'processing' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9CA6A0' }}>
                        <Loader2 size={14} className="animate-spin" /> Подождите...
                      </span>
                    ) : editingId === row.id ? (
                      savingId === row.id ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9CA6A0' }}>
                          <Loader2 size={14} className="animate-spin" /> Сохранение...
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => saveEdit(row)}
                            title="Сохранить"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 28, height: 28, borderRadius: 6,
                              border: '1.5px solid #1C6B41', color: 'white',
                              background: '#1C6B41', cursor: 'pointer',
                            }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            title="Отмена"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 28, height: 28, borderRadius: 6,
                              border: '1.5px solid #E5E9E6', color: '#9CA6A0',
                              background: 'white', cursor: 'pointer',
                            }}
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      )
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => startEdit(row)}
                          title="Исправить вручную"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: 12, padding: '4px 10px', borderRadius: 6,
                            border: '1.5px solid #E5E9E6', color: '#1C6B41',
                            background: 'white', cursor: 'pointer', fontWeight: 500,
                          }}>
                          <Pencil size={12} />
                          {row.status === 'warning' || row.status === 'error' ? 'Исправить' : 'Изменить'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedId(expandedId === `retry-${row.id}` ? null : `retry-${row.id}`)
                          }}
                          title="Распознать заново с выбором модели"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, borderRadius: 6,
                            border: '1.5px solid #E5E9E6', color: '#1C6B41',
                            background: expandedId === `retry-${row.id}` ? '#ECF6EF' : 'white', cursor: 'pointer',
                          }}>
                          <RefreshCw size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {expandedId === row.id && (
                  <tr>
                    <td colSpan={fields.length + 5} style={{ padding: 0, borderBottom: '1.5px solid #F6F7F6', background: '#FAFBFA' }}>
                      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'center' }}>
                        {previewLoading === row.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9CA6A0', fontSize: 13, padding: '24px 0' }}>
                            <Loader2 size={16} className="animate-spin" /> Загрузка изображения...
                          </div>
                        ) : previewUrls[row.id] === 'error' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C0392B', fontSize: 13, padding: '24px 0' }}>
                            <ImageOff size={16} /> Не удалось загрузить изображение документа
                          </div>
                        ) : previewUrls[row.id] ? (
                          row.filename.toLowerCase().endsWith('.pdf') ? (
                            <iframe
                              src={previewUrls[row.id]}
                              style={{ width: '100%', maxWidth: 700, height: 500, border: '1.5px solid #ECEFEC', borderRadius: 12 }}
                              title={row.filename}
                            />
                          ) : (
                            <img
                              src={previewUrls[row.id]}
                              alt={row.filename}
                              style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 12, border: '1.5px solid #ECEFEC' }}
                            />
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )}
                {expandedId === `retry-${row.id}` && (
                  <tr>
                    <td colSpan={fields.length + 5} style={{ padding: 0, borderBottom: '1.5px solid #F6F7F6', background: '#FAFBFA' }}>
                      <div style={{ padding: '16px 24px' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#9CA6A0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                          Распознать заново с помощью
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {RETRY_MODELS.map(m => (
                            <button
                              key={m.id}
                              onClick={() => retryRecognition(row, m.id)}
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                                padding: '10px 16px', borderRadius: 12, flex: '1 1 160px',
                                border: '1.5px solid #ECEFEC', background: 'white',
                                cursor: 'pointer', textAlign: 'left',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1C6B41'; e.currentTarget.style.background = '#ECF6EF' }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ECEFEC'; e.currentTarget.style.background = 'white' }}
                            >
                              <span style={{ fontSize: 13.5, fontWeight: 800, color: '#16201A', letterSpacing: '-0.01em' }}>{m.label}</span>
                              <span style={{ fontSize: 12, color: '#9CA6A0', fontWeight: 500 }}>{m.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
