'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TaskList from '../components/TaskList'
import { supabase } from '../lib/supabaseClient'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const router = useRouter()
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [stats, setStats] = useState({ total: 0, ok: 0, warning: 0, error: 0 })

  const loadStats = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('status')

    if (error) {
      console.error('Ошибка загрузки статистики:', error)
      return
    }

    setStats({
      total: data.length,
      ok: data.filter(d => d.status === 'ok').length,
      warning: data.filter(d => d.status === 'warning').length,
      error: data.filter(d => d.status === 'error').length,
    })
  }

  const loadTasks = async (silent = false) => {
    if (!silent) setLoadingTasks(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8)

    let mapped = []
    if (error) {
      console.error('Ошибка загрузки задач:', error)
    } else {
      mapped = data.map(t => ({
        id: t.id,
        filename: t.filename,
        size: t.file_size ? (t.file_size / 1024).toFixed(0) + ' КБ' : '—',
        created_at: new Date(t.created_at).toLocaleDateString('ru-RU'),
        doc_count: t.doc_count,
        status: t.status,
      }))
      setTasks(mapped)
    }
    if (!silent) setLoadingTasks(false)
    return mapped
  }

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      await loadStats()
      const mapped = await loadTasks(true)
      setLoadingTasks(false)

      const hasActive = mapped.some(t => t.status === 'pending' || t.status === 'processing')
      if (!cancelled && hasActive) {
        setTimeout(tick, 5000)
      }
    }

    tick()
    return () => { cancelled = true }
  }, [])

  const handleDelete = async (taskId) => {
    try {
      const { data: docs } = await supabase
        .from('documents')
        .select('file_path')
        .eq('task_id', taskId)

      if (docs && docs.length > 0) {
        const paths = docs.map(d => d.file_path)
        await supabase.storage.from('documents').remove(paths)
      }

      const { error } = await supabase.from('tasks').delete().eq('id', taskId)
      if (error) throw error

      await loadTasks()
      await loadStats()
    } catch (err) {
      console.error('Ошибка удаления:', err)
      alert('Ошибка при удалении: ' + err.message)
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>Дашборд</div>
          <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2 }}>Обзор системы распознавания</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 600, color: '#1C6B41',
          background: '#ECF6EF', padding: '7px 14px', borderRadius: 999,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1C6B41', display: 'inline-block' }} />
          Система активна
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Всего документов', value: stats.total, color: '#16201A' },
          { label: 'Распознано успешно', value: stats.ok, color: '#1C6B41' },
          { label: 'Требуют проверки', value: stats.warning, color: '#92400E' },
          { label: 'Ошибки', value: stats.error, color: '#C0392B' },
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

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: '#9CA6A0',
          textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0,
        }}>
          Последние загрузки
        </p>
        <button
          onClick={() => router.push('/upload')}
          style={{
            fontSize: 13, fontWeight: 600, color: 'white',
            background: '#16201A', border: 'none', borderRadius: 9,
            padding: '8px 16px', cursor: 'pointer',
          }}
        >
          + Новая загрузка
        </button>
      </div>

      {loadingTasks ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA6A0', fontSize: 14 }}>
          Загрузка...
        </div>
      ) : (
        <TaskList tasks={tasks} onRefresh={loadTasks} onDelete={handleDelete} />
      )}
    </div>
  )
}
