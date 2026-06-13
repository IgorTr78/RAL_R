'use client'
import { useRouter } from 'next/navigation'
import { FileText, ChevronRight, RefreshCw, Trash2 } from 'lucide-react'

const STATUS_MAP = {
  pending:    { label: 'Ожидание',   bg: '#ECF6EF', color: '#1C6B41',  dot: '#1C6B41' },
  processing: { label: 'Обработка',  bg: '#EBF0FE', color: '#3052D6',  dot: '#3052D6' },
  done:       { label: 'Готово',     bg: '#ECF6EF', color: '#14532D',  dot: '#1C6B41' },
  partial:    { label: 'Частично',   bg: '#FEF6E0', color: '#92400E',  dot: '#EAB308' },
  failed:     { label: 'Ошибка',     bg: '#FDEEEE', color: '#C0392B',  dot: '#DC2626' },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: s.bg, color: s.color,
      padding: '5px 12px', borderRadius: 999,
      fontSize: 12, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

export default function TaskList({ tasks = [], onRefresh, onDelete }) {
  const router = useRouter()

  return (
    <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 24px', borderBottom: '1.5px solid #F0F2F0',
      }}>
        <span style={{ fontSize: 15.5, fontWeight: 800, color: '#16201A', letterSpacing: '-0.01em' }}>История загрузок</span>
        <button onClick={onRefresh} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, color: '#16201A', background: '#F6F7F6',
          border: 'none', borderRadius: 10,
          padding: '7px 14px', cursor: 'pointer', fontWeight: 700,
        }}>
          <RefreshCw size={13} /> Обновить
        </button>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA6A0', fontSize: 14 }}>
          Загрузок пока нет — загрузите первый документ выше
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#FAFBFA' }}>
              {['#', 'Файл', 'Дата', 'Документов', 'Статус', 'Действие', ''].map(h => (
                <th key={h} style={{
                  padding: '12px 24px', textAlign: 'left',
                  fontSize: 11, fontWeight: 700, color: '#9CA6A0',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  borderBottom: '1.5px solid #F0F2F0',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => (
              <tr key={task.id} style={{ borderBottom: '1.5px solid #F6F7F6' }}>
                <td style={{ padding: '14px 24px', color: '#9CA6A0', fontWeight: 600 }}>{i + 1}</td>
                <td style={{ padding: '14px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{
                      background: '#ECF6EF', borderRadius: 10, width: 34, height: 34,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText size={16} color="#1C6B41" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#16201A' }}>{task.filename}</div>
                      <div style={{ fontSize: 11, color: '#9CA6A0', fontWeight: 500 }}>{task.size}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 24px', color: '#6B7572', fontWeight: 500 }}>{task.created_at}</td>
                <td style={{ padding: '14px 24px', color: '#16201A', fontWeight: 600 }}>{task.doc_count}</td>
                <td style={{ padding: '14px 24px' }}><StatusBadge status={task.status} /></td>
                <td style={{ padding: '14px 24px' }}>
                  {task.status === 'done' || task.status === 'partial' ? (
                    <button
                      onClick={() => router.push(`/results/${task.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 12.5, padding: '7px 16px', borderRadius: 10,
                        border: 'none', color: 'white',
                        background: '#16201A', cursor: 'pointer', fontWeight: 700,
                      }}
                    >
                      Результаты <ChevronRight size={13} />
                    </button>
                  ) : task.status === 'failed' ? (
                    <span style={{ fontSize: 12, color: '#C0392B', fontWeight: 600 }}>Ошибка чтения</span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9CA6A0' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '14px 24px' }}>
                  <button
                    onClick={() => {
                      if (confirm(`Удалить задачу "${task.filename}"? Это действие необратимо.`)) {
                        onDelete && onDelete(task.id)
                      }
                    }}
                    title="Удалить"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 30, height: 30, borderRadius: 10,
                      border: 'none', color: '#C0392B',
                      background: '#FDEEEE', cursor: 'pointer',
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
