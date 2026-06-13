'use client'
import { useState } from 'react'
import { ScanText, X } from 'lucide-react'

export default function ParametersForm({ onSubmit, loading }) {
  const [params, setParams] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')

  const MODELS = [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', desc: 'быстро и дёшево', price: '~$0.0003 / документ' },
    { id: 'gpt-4o',      label: 'GPT-4o',      desc: 'точнее, дороже', price: '~$0.005 / документ' },
  ]

  const handleSubmit = () => {
    const fields = params
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
    if (fields.length === 0) return
    if (onSubmit) onSubmit(fields, model)
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: 20,
      padding: 26,
      marginBottom: 32,
      boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 18 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: '#ECF6EF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ScanText size={17} color="#1C6B41" />
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#16201A', letterSpacing: '-0.01em' }}>
          Параметры распознавания
        </span>
      </div>

      <p style={{ fontSize: 13, color: '#6B7572', marginBottom: 11, fontWeight: 500 }}>
        Введите поля для извлечения — каждое с новой строки:
      </p>

      <textarea
        value={params}
        onChange={(e) => setParams(e.target.value)}
        placeholder={'Номер счёта\nДата документа\nПоставщик\nСумма без НДС\nСумма НДС'}
        rows={6}
        style={{
          width: '100%',
          border: '1.5px solid #ECEFEC',
          borderRadius: 14,
          padding: '12px 16px',
          fontSize: 14,
          color: '#16201A',
          resize: 'vertical',
          fontFamily: 'inherit',
          fontWeight: 500,
          lineHeight: 1.8,
        }}
      />

      <p style={{ fontSize: 12.5, color: '#9CA6A0', marginTop: 8, marginBottom: 18, fontWeight: 500 }}>
        Каждая строка станет отдельной колонкой в таблице результатов
      </p>

      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 11, color: '#9CA6A0', marginBottom: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Модель распознавания
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {MODELS.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                padding: '12px 16px', borderRadius: 13, flex: '1 1 160px',
                border: model === m.id ? '1.5px solid #1C6B41' : '1.5px solid #ECEFEC',
                background: model === m.id ? '#ECF6EF' : 'white',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 800, color: '#16201A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', letterSpacing: '-0.01em' }}>
                {m.label}
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 7,
                  background: i === 0 ? '#EAB308' : '#ECEFEC',
                  color: i === 0 ? '#16201A' : '#9CA6A0',
                }}>
                  {i === 0 ? 'эконом' : 'точный'}
                </span>
              </span>
              <span style={{ fontSize: 12, color: '#9CA6A0', fontWeight: 500 }}>{m.desc} · {m.price}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={loading || !params.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 22px', borderRadius: 12, fontSize: 14,
            background: loading || !params.trim() ? '#B8C2BC' : 'linear-gradient(135deg, #1C6B41 0%, #14532D 100%)',
            color: 'white', border: 'none',
            cursor: loading || !params.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 700, transition: 'background 0.2s',
            boxShadow: loading || !params.trim() ? 'none' : '0 4px 12px rgba(20,83,45,0.22)',
            letterSpacing: '-0.01em',
          }}
        >
          <ScanText size={15} />
          {loading ? 'Распознавание...' : 'Распознать'}
        </button>
        <button
          onClick={() => setParams('')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 18px', borderRadius: 12, fontSize: 14,
            background: '#F6F7F6', color: '#6B7572',
            border: 'none',
            cursor: 'pointer', fontWeight: 700,
          }}
        >
          <X size={14} /> Очистить
        </button>
      </div>
    </div>
  )
}
