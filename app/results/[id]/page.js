'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ResultsTable from '../../../components/ResultsTable'
import { supabase } from '../../../lib/supabaseClient'
import { ScanText, ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ResultsPage({ params }) {
  const router = useRouter()
  const { id } = params

  const [task, setTask] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single()

      if (taskError) {
        setError(taskError.message)
        setLoading(false)
        return
      }

      const { data: docsData, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .eq('task_id', id)
        .order('created_at', { ascending: true })

      if (docsError) {
        setError(docsError.message)
        setLoading(false)
        return
      }

      setTask(taskData)
      setRows(docsData.map(d => ({
        id: d.id,
        filename: d.filename,
        size: d.file_size ? (d.file_size / 1024).toFixed(0) + ' КБ' : '—',
        confidence: d.confidence ?? 0,
        status: d.status,
        values: d.values || {},
        file_path: d.file_path,
      })))
      setLoading(false)
    }

    load()
  }, [id])

  const taskFields = task?.fields || []
  const displayFields = taskFields.includes('Вид документа')
    ? taskFields
    : ['Вид документа', ...taskFields]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: '#16201A', cursor: 'pointer',
              border: 'none', borderRadius: 12,
              padding: '9px 16px', background: '#F6F7F6', fontWeight: 700,
            }}
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              background: 'linear-gradient(135deg, #1C6B41 0%, #14532D 100%)',
              borderRadius: 13, width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', boxShadow: '0 4px 12px rgba(20,83,45,0.25)',
            }}>
              <ScanText size={22} color="white" />
              <div style={{
                position: 'absolute', top: -4, right: -4, width: 14, height: 14,
                borderRadius: '50%', background: '#EAB308', border: '2.5px solid #F6F7F6',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>
                Результаты распознавания
              </div>
              <div style={{ fontSize: 13, color: '#9CA6A0', marginTop: 2, fontWeight: 500 }}>
                {task ? `${task.filename} · ${task.doc_count} документов · ${new Date(task.created_at).toLocaleDateString('ru-RU')}` : '...'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA6A0' }}>Загрузка...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#C0392B' }}>Ошибка: {error}</div>
      ) : (
        <ResultsTable
          fields={displayFields}
          rows={rows}
          taskName={task?.filename || 'results'}
          taskId={id}
        />
      )}
    </div>
  )
}
