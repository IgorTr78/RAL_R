'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

export const dynamic = 'force-dynamic'

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState([])
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: docsData, error: docsErr }, { data: tasksData, error: tasksErr }] = await Promise.all([
        supabase.from('documents').select('status, confidence, model, source, created_at'),
        supabase.from('tasks').select('status, created_at, model'),
      ])
      if (docsErr) console.error('Ошибка загрузки документов:', docsErr)
      if (tasksErr) console.error('Ошибка загрузки задач:', tasksErr)
      setDocs(docsData || [])
      setTasks(tasksData || [])
      setLoading(false)
    }
    load()
  }, [])

  const total = docs.length
  const ok = docs.filter(d => d.status === 'ok').length
  const warning = docs.filter(d => d.status === 'warning').length
  const error = docs.filter(d => d.status === 'error').length
  const pending = docs.filter(d => d.status === 'pending' || d.status === 'processing').length

  const withConfidence = docs.filter(d => typeof d.confidence === 'number')
  const avgConfidence = withConfidence.length
    ? (withConfidence.reduce((sum, d) => sum + d.confidence, 0) / withConfidence.length)
    : null

  const byModel = {}
  docs.forEach(d => {
    const m = d.model || 'не указана'
    if (!byModel[m]) byModel[m] = { total: 0, ok: 0 }
    byModel[m].total += 1
    if (d.status === 'ok') byModel[m].ok += 1
  })

  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const partialTasks = tasks.filter(t => t.status === 'partial').length
  const failedTasks = tasks.filter(t => t.status === 'failed').length

  const cardStyle = {
    background: 'white', borderRadius: 18, padding: '20px 22px',
    boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
  }
  const labelStyle = { fontSize: 12.5, color: '#9CA6A0', marginBottom: 10, fontWeight: 600 }
  const valueStyle = (color) => ({ fontSize: 30, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.03em' })

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px', color: '#9CA6A0', fontSize: 14 }}>
        Загрузка...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>Статистика</div>
        <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2 }}>Сводные показатели по всем обработанным документам</div>
      </div>

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#9CA6A0',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      }}>
        Документы
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Всего документов</div>
          <div style={valueStyle('#16201A')}>{total}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Распознано успешно</div>
          <div style={valueStyle('#1C6B41')}>{ok}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Требуют проверки</div>
          <div style={valueStyle('#92400E')}>{warning}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Ошибки</div>
          <div style={valueStyle('#C0392B')}>{error}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>В очереди / обработке</div>
          <div style={valueStyle('#16201A')}>{pending}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Средняя уверенность</div>
          <div style={valueStyle('#16201A')}>
            {avgConfidence !== null ? `${(avgConfidence * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Доля успешных</div>
          <div style={valueStyle('#1C6B41')}>
            {total > 0 ? `${((ok / total) * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#9CA6A0',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      }}>
        Задачи
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Всего задач</div>
          <div style={valueStyle('#16201A')}>{totalTasks}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Завершены</div>
          <div style={valueStyle('#1C6B41')}>{doneTasks}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Частично</div>
          <div style={valueStyle('#92400E')}>{partialTasks}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Провалены</div>
          <div style={valueStyle('#C0392B')}>{failedTasks}</div>
        </div>
      </div>

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#9CA6A0',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      }}>
        По моделям распознавания
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(byModel).map(([model, stat]) => (
          <div key={model} style={{
            ...cardStyle, padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#16201A' }}>{model}</span>
            <span style={{ fontSize: 13, color: '#9CA6A0' }}>
              {stat.ok}/{stat.total} успешно ({stat.total > 0 ? ((stat.ok / stat.total) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        ))}
        {Object.keys(byModel).length === 0 && (
          <div style={{ color: '#9CA6A0', fontSize: 13.5 }}>Данных пока нет</div>
        )}
      </div>
    </div>
  )
}
