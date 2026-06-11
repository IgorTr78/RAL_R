'use client'
import { useState } from 'react'
import UploadZone from '@/components/UploadZone'
import ParametersForm from '@/components/ParametersForm'
import TaskList from '@/components/TaskList'
import { ScanText } from 'lucide-react'

const DEMO_TASKS = [
  { id: '3', filename: 'счета_декабрь.zip', size: '2.4 МБ', created_at: '11.06.2026', doc_count: 12, status: 'processing' },
  { id: '2', filename: 'акт_сверки.pdf',    size: '310 КБ', created_at: '10.06.2026', doc_count: 1,  status: 'done' },
  { id: '1', filename: 'договор.pdf',       size: '184 КБ', created_at: '09.06.2026', doc_count: 1,  status: 'failed' },
]

export default function HomePage() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState(DEMO_TASKS)

  const handleRecognize = async (fields) => {
    if (files.length === 0) {
      alert('Сначала выберите файл для загрузки')
      return
    }
    setLoading(true)
    await new Promise(r => setTimeout(r, 1500))
    const newTask = {
      id: String(Date.now()),
      filename: files[0].name,
      size: (files[0].size / 1024).toFixed(0) + ' КБ',
      created_at: new Date().toLocaleDateString('ru-RU'),
      doc_count: files.length,
      status: 'done',
    }
    setTasks(prev => [newTask, ...prev])
    setLoading(false)
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

      <TaskList tasks={tasks} onRefresh={() => {}} />
    </div>
  )
}
