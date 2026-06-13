'use client'
import { useState, useEffect } from 'react'
import UploadZone from '../components/UploadZone'
import ParametersForm from '../components/ParametersForm'
import TaskList from '../components/TaskList'
import { supabase } from '../lib/supabaseClient'
import { ScanText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
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

  const loadTasks = async () => {
    setLoadingTasks(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Ошибка загрузки задач:', error)
    } else {
      const mapped = data.map(t => ({
        id: t.id,
        filename: t.filename,
        size: t.file_size ? (t.file_size / 1024).toFixed(0) + ' КБ' : '—',
        created_at: new Date(t.created_at).toLocaleDateString('ru-RU'),
        doc_count: t.doc_count,
        status: t.status,
      }))
      setTasks(mapped)
    }
    setLoadingTasks(false)
  }

  useEffect(() => {
    loadTasks()
    loadStats()
  }, [])

  const handleRecognize = async (fields, model) => {
    if (files.length === 0) {
      alert('Сначала выберите файл для загрузки')
      return
    }
    setLoading(true)

    try {
      const file = files[0]
      const ext = file.name.split('.').pop()
      const safeName = `${Date.now()}.${ext}`
      const filePath = safeName

      // 1. Загружаем файл в Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 2. Создаём запись задачи в БД
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          filename: file.name,
          file_size: file.size,
          doc_count: files.length,
          status: 'pending',
          fields: fields,
          model: model || 'gpt-4o-mini',
        })
        .select()
        .single()

      if (taskError) throw taskError

      // 3. Создаём запись документа, связанную с задачей
      const { error: docError } = await supabase
        .from('documents')
        .insert({
          task_id: taskData.id,
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          status: 'pending',
        })

      if (docError) throw docError

      // 4. Обновляем список задач
      await loadTasks()
      await loadStats()
      setFiles([])
    } catch (err) {
      console.error('Ошибка:', err)
      alert('Ошибка при загрузке: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (taskId) => {
    try {
      // 1. Находим документы задачи, чтобы удалить файлы из Storage
      const { data: docs } = await supabase
        .from('documents')
        .select('file_path')
        .eq('task_id', taskId)

      if (docs && docs.length > 0) {
        const paths = docs.map(d => d.file_path)
        await supabase.storage.from('documents').remove(paths)
      }

      // 2. Удаляем задачу (документы удалятся автоматически по cascade)
      const { error } = await supabase.from('tasks').delete().eq('id', taskId)
      if (error) throw error

      // 3. Обновляем список
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
        marginBottom: 32, paddingBottom: 16, borderBottom: '0.5px solid #d6e8d0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: '#3B6D11', borderRadius: 10, padding: '7px 9px',
            display: 'flex', alignItems: 'center',
          }}>
            <ScanText size={20} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2e1a' }}>DocRecognizer</div>
            <div style={{ fontSize: 12, color: '#8aaa8a' }}>Распознавание документов</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Всего документов', value: stats.total, color: '#1a2e1a' },
          { label: 'Распознано успешно', value: stats.ok, color: '#3B6D11' },
          { label: 'Требуют проверки', value: stats.warning, color: '#854F0B' },
          { label: 'Ошибки', value: stats.error, color: '#A32D2D' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'white', borderRadius: 12,
            padding: '16px 20px', border: '0.5px solid #d6e8d0',
          }}>
            <div style={{ fontSize: 12, color: '#6b8f6b', marginBottom: 6, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#6b8f6b',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      }}>
        Загрузка документов
      </p>

      <UploadZone onFilesSelected={setFiles} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: '8px 0 20px', color: '#b0c8b0', fontSize: 12,
      }}>
        <div style={{ flex: 1, height: 0.5, background: '#d6e8d0' }} />
        параметры распознавания
        <div style={{ flex: 1, height: 0.5, background: '#d6e8d0' }} />
      </div>

      <ParametersForm onSubmit={handleRecognize} loading={loading} />

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#6b8f6b',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      }}>
        История загрузок
      </p>

      {loadingTasks ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#8aaa8a', fontSize: 14 }}>
          Загрузка...
        </div>
      ) : (
        <TaskList tasks={tasks} onRefresh={loadTasks} onDelete={handleDelete} />
      )}
    </div>
  )
}
