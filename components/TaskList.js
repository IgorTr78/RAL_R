'use client'
import { useRouter } from 'next/navigation'
import { FileText, ChevronRight, RefreshCw, Trash2 } from 'lucide-react'

const STATUS_MAP = {
  pending:    { label: 'Ожидание',   bg: '#f0f7ec', color: '#3B6D11',  dot: '#639922' },
  processing: { label: 'Обработка',  bg: '#E3F2FD', color: '#1565C0',  dot: '#378ADD' },
  done:       { label: 'Готово',     bg: '#eaf3de', color: '#27500A',  dot: '#639922' },
  partial:    { label: 'Частично',   bg: '#FFF8E1', color: '#854F0B',  dot: '#EF9F27' },
  failed:     { label: 'Ошибка',     bg: '#FFEBEE', color: '#A32D2D',  dot: '#E24B4A' },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: s.bg, color: s.color,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 500,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

export default function TaskList({ tasks = [], onRefresh, onDelete }) {
  const router = useRouter()

  return (
    <div style={{ background: 'white', border: '0.5px solid #d6e8d0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '0.5px solid #eaf3e4',
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a2e1a' }}>История загрузок</span>
        <button onClick={onRefresh} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: '#3B6D11', background: 'white',
          border: '0.5px solid #d6e8d0', borderRadius: 7,
          padding: '5px 10px', cursor: 'pointer',
        }}>
          <RefreshCw size={13} /> Обновить
        </button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8aaa8a', fontSize: 14 }}>
          Загрузок пока нет — загрузите первый документ выше
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f2f8ee' }}>
              {['#', 'Файл', 'Дата', 'Документов', 'Статус', 'Действие', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600, color: '#5a7a5a',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  borderBottom: '0.5px solid #e4f0de',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => (
              <tr key={task.id} style={{ borderBottom: '0.5px solid #f0f7ec' }}>
                <td style={{ padding: '11px 16px', color: '#8aaa8a' }}>{i + 1}</td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      background: '#eaf3de', borderRadius: 6,
                      padding: '4px 7px', display: 'flex', alignItems: 'center',
                    }}>
                      <FileText size={14} color="#3B6D11" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: '#1a2e1a' }}>{task.filename}</div>
                      <div style={{ fontSize: 11, color: '#8aaa8a' }}>{task.size}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '11px 16px', color: '#5a7a5a' }}>{task.created_at}</td>
                <td style={{ padding: '11px 16px', color: '#2a3d2a', fontWeight: 500 }}>{task.doc_count}</td>
                <td style={{ padding: '11px 16px' }}><StatusBadge status={task.status} /></td>
                <td style={{ padding: '11px 16px' }}>
                  {task.status === 'done' || task.status === 'partial' ? (
                    <button
                      onClick={() => router.push(`/results/${task.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 12, padding: '4px 12px', borderRadius: 6,
                        border: '0.5px solid #3B6D11', color: '#3B6D11',
                        background: 'white', cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      Результаты <ChevronRight size={13} />
                    </button>
                  ) : task.status === 'failed' ? (
                    <span style={{ fontSize: 12, color: '#A32D2D' }}>Ошибка чтения</span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#8aaa8a' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <button
                    onClick={() => {
                      if (confirm(`Удалить задачу "${task.filename}"? Это действие необратимо.`)) {
                        onDelete && onDelete(task.id)
                      }
                    }}
                    title="Удалить"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      border: '0.5px solid #f0d0d0', color: '#A32D2D',
                      background: 'white', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
