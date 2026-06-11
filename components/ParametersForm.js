'use client'
import { useState } from 'react'
import { ScanText, X } from 'lucide-react'

export default function ParametersForm({ onSubmit, loading }) {
  const [params, setParams] = useState('')

  const handleSubmit = () => {
    const fields = params
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
    if (fields.length === 0) return
    if (onSubmit) onSubmit(fields)
  }

  return (
    <div style={{
      background: 'white',
      border: '0.5px solid #d6e8d0',
      borderRadius: 14,
      padding: 24,
      marginBottom: 32,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <ScanText size={18} color="#3B6D11" />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a2e1a' }}>
          Параметры распознавания
        </span>
      </div>

      <p style={{ fontSize: 13, color: '#6b8f6b', marginBottom: 10 }}>
        Введите поля для извлечения — каждое с новой строки:
      </p>

      <textarea
        value={params}
        onChange={(e) => setParams(e.target.value)}
        placeholder={'Номер счёта\nДата документа\nПоставщик\nСумма без НДС\nСумма НДС'}
        rows={6}
        style={{
          width: '100%',
          border: '0.5px solid #d6e8d0',
          borderRadius: 9,
          padding: '10px 14px',
          fontSize: 14,
          color: '#2a3d2a',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.7,
        }}
      />

      <p style={{ fontSize: 12, color: '#aaa', marginTop: 6, marginBottom: 16 }}>
        Каждая строка станет отдельной колонкой в таблице результатов
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={loading || !params.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 9, fontSize: 14,
            background: loading || !params.trim() ? '#c0d4b8' : '#3B6D11',
            color: 'white', border: 'none',
            cursor: loading || !params.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 500, transition: 'background 0.2s',
          }}
        >
          <ScanText size={15} />
          {loading ? 'Распознавание...' : 'Распознать'}
        </button>
        <button
          onClick={() => setParams('')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 9, fontSize: 14,
            background: 'white', color: '#6b8f6b',
            border: '0.5px solid #d6e8d0',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          <X size={14} /> Очистить
        </button>
      </div>
    </div>
  )
}
