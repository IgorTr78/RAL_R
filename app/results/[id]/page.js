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
              fontSize: 13, color: '#3B6D11', cursor: 'pointer',
              border: '0.5px solid #3B6D11', borderRadius: 8,
              padding: '7px 14px', background: 'white', fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: '#3B6D11', borderRadius: 10, padding: '7px 9px',
              display: 'flex', alignItems: 'center',
            }}>
              <ScanText size={20} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2e1a' }}>
                Результаты распознавания
              </div>
              <div style={{ fontSize: 13, color: '#6b8f6b', marginTop: 2 }}>
                {task ? `${task.filename} · ${task.doc_count} документов · ${new Date(task.created_at).toLocaleDateString('ru-RU')}` : '...'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#8aaa8a' }}>Загрузка...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#A32D2D' }}>Ошибка: {error}</div>
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
