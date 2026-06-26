'use client'
import { useState, useEffect } from 'react'
import { ScanText, X, Loader2, ChevronDown, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const PRESET_TEMPLATES = [
  {
    id: 'inn',
    name: 'Свидетельство ИНН',
    fields: ['ФИО', 'Номер ИНН', 'Номер документа', 'Дата выдачи'],
  },
  {
    id: 'passport',
    name: 'Паспорт РФ',
    fields: ['ФИО', 'Серия и номер паспорта', 'Дата выдачи', 'Кем выдан', 'Дата рождения'],
  },
  {
    id: 'sts',
    name: 'СТС (авто)',
    fields: ['ФИО', 'VIN', 'Марка и модель', 'Гос. номер', 'Дата выдачи'],
  },
  {
    id: 'contract',
    name: 'Договор',
    fields: ['Номер договора', 'Дата договора', 'Стороны договора', 'Сумма', 'Срок действия'],
  },
  {
    id: 'invoice',
    name: 'Счёт',
    fields: ['Номер счёта', 'Дата документа', 'Поставщик', 'Сумма без НДС', 'Сумма НДС', 'Итого'],
  },
  {
    id: 'cert',
    name: 'Сертификат соответствия',
    fields: ['Название документа', 'Номер сертификата', 'Номер документа', 'Срок действия'],
  },
  {
    id: 'balance',
    name: 'Бухгалтерский баланс',
    fields: ['Вид документа', 'ИНН', 'Отчётная дата', 'Период', 'Организация', 'Таблица показателей'],
  },
  {
    id: 'leasing_act',
    name: 'Акт приёма-передачи лизинга',
    fields: ['Тип документа', 'Дата документа', 'Номер договора'],
  },
  {
    id: 'leasing_transfer',
    name: 'Опись при передаче лизингополучателю',
    fields: ['Тип документа', 'Дата документа', 'Номер договора'],
  },
  {
    id: 'leasing_accept',
    name: 'Опись при приёмке от поставщика',
    fields: ['Тип документа', 'Дата документа', 'Номер договора'],
  },
]

const MODELS = [
  { id: 'gpt-4o-mini',    label: 'GPT-4o mini',    desc: 'быстро и дёшево',    badge: 'эконом',   badgeBg: '#EAB308', badgeText: '#16201A' },
  { id: 'gpt-4o',         label: 'GPT-4o',          desc: 'точнее, дороже',     badge: 'точный',   badgeBg: '#ECEFEC', badgeText: '#9CA6A0' },
  { id: 'GigaChat-2-Pro', label: 'GigaChat 2 Pro',  desc: 'Сбер, рус. язык',   badge: 'рус',      badgeBg: '#ECF6EF', badgeText: '#1C6B41' },
  { id: 'GigaChat-2-Max', label: 'GigaChat 2 Max',  desc: 'Сбер, максимум',    badge: 'рус макс', badgeBg: '#ECF6EF', badgeText: '#1C6B41' },
  { id: 'qwen-vl-plus',   label: 'Qwen VL Plus',   desc: 'Alibaba, тест',     badge: 'тест',     badgeBg: '#EBF0FE', badgeText: '#3052D6' },
]

export default function ParametersForm({ onSubmit, loading, files = [] }) {
  const [selectedFields, setSelectedFields] = useState([])
  const [customField, setCustomField] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [savedTemplates, setSavedTemplates] = useState([])
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)

  useEffect(() => {
    supabase
      .from('document_templates')
      .select('id, name, fields')
      .order('created_at', { ascending: false })
      .then(({ data }) => setSavedTemplates(data || []))
      .catch(() => {})
  }, [])

  const allTemplates = [
    ...PRESET_TEMPLATES,
    ...savedTemplates.map(t => ({ id: t.id, name: t.name, fields: t.fields || [] })),
  ]

  const applyTemplate = (tpl) => {
    setActiveTemplate(tpl.id)
    setSelectedFields(tpl.fields)
    setShowTemplateDropdown(false)
  }

  const toggleField = (field) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    )
    setActiveTemplate(null)
  }

  const addCustomField = () => {
    const f = customField.trim()
    if (!f || selectedFields.includes(f)) return
    setSelectedFields(prev => [...prev, f])
    setCustomField('')
    setActiveTemplate(null)
  }

  const removeField = (field) => {
    setSelectedFields(prev => prev.filter(f => f !== field))
    setActiveTemplate(null)
  }

  const handleSubmit = () => {
    if (selectedFields.length === 0) return
    if (onSubmit) onSubmit(selectedFields, model, activeTemplateObj?.name || null)
  }

  const totalSizeMB = files.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024)
  const isLargeUpload = totalSizeMB > 5
  const activeTemplateObj = allTemplates.find(t => t.id === activeTemplate)

  return (
    <div style={{
      background: 'white', borderRadius: 20, padding: 26, marginBottom: 32,
      boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 20 }}>
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

      {/* Выбор шаблона */}
      <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA6A0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Шаблон документа
      </p>
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <button
          onClick={() => setShowTemplateDropdown(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 12, border: '1.5px solid #E5E9E6',
            background: 'white', cursor: 'pointer', fontSize: 14,
            color: activeTemplateObj ? '#16201A' : '#9CA6A0',
            fontWeight: activeTemplateObj ? 600 : 400,
          }}
        >
          <span>{activeTemplateObj ? activeTemplateObj.name : 'Выбрать шаблон...'}</span>
          <ChevronDown size={16} color="#9CA6A0" style={{ transform: showTemplateDropdown ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        </button>

        {showTemplateDropdown && (
          <div style={{
            position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 20,
            background: 'white', borderRadius: 12, border: '1.5px solid #E5E9E6',
            boxShadow: '0 8px 24px rgba(22,32,26,0.10)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
          }}>
            {allTemplates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 14px', border: 'none',
                  background: activeTemplate === tpl.id ? '#ECF6EF' : 'white',
                  cursor: 'pointer', fontSize: 14, color: '#16201A', fontWeight: 500, textAlign: 'left',
                }}
                onMouseEnter={e => { if (activeTemplate !== tpl.id) e.currentTarget.style.background = '#F6F7F6' }}
                onMouseLeave={e => { if (activeTemplate !== tpl.id) e.currentTarget.style.background = 'white' }}
              >
                <span>{tpl.name}</span>
                <span style={{ fontSize: 12, color: '#9CA6A0' }}>{tpl.fields.length} полей</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Чекбоксы выбранных полей */}
      {selectedFields.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA6A0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Поля для извлечения
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {selectedFields.map(field => (
              <div
                key={field}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 10, background: '#F6F7F6',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5, background: '#1C6B41',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Check size={11} color="white" strokeWidth={3} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#16201A', flex: 1 }}>{field}</span>
                <button
                  onClick={() => removeField(field)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <X size={14} color="#9CA6A0" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Добавить своё поле */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={customField}
          onChange={e => setCustomField(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustomField()}
          placeholder="Добавить своё поле..."
          style={{
            flex: 1, padding: '9px 13px', borderRadius: 10,
            border: '1.5px solid #E5E9E6', fontSize: 14, color: '#16201A',
            fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={addCustomField}
          disabled={!customField.trim()}
          style={{
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: customField.trim() ? '#ECF6EF' : '#F6F7F6',
            color: customField.trim() ? '#1C6B41' : '#9CA6A0',
            fontSize: 13, fontWeight: 700, cursor: customField.trim() ? 'pointer' : 'default',
          }}
        >
          + Добавить
        </button>
      </div>

      {/* Выбор модели */}
      <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA6A0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Модель распознавания
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {MODELS.map(m => (
          <button
            key={m.id}
            onClick={() => setModel(m.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
              padding: '12px 16px', borderRadius: 13, flex: '1 1 140px',
              border: model === m.id ? '1.5px solid #1C6B41' : '1.5px solid #ECEFEC',
              background: model === m.id ? '#ECF6EF' : 'white',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#16201A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', letterSpacing: '-0.01em' }}>
              {m.label}
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 7, background: m.badgeBg, color: m.badgeText }}>
                {m.badge}
              </span>
            </span>
            <span style={{ fontSize: 12, color: '#9CA6A0', fontWeight: 500 }}>{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleSubmit}
          disabled={loading || selectedFields.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 22px', borderRadius: 12, fontSize: 14,
            background: loading || selectedFields.length === 0 ? '#B8C2BC' : 'linear-gradient(135deg, #1C6B41 0%, #14532D 100%)',
            color: 'white', border: 'none',
            cursor: loading || selectedFields.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 700, transition: 'background 0.2s',
            boxShadow: loading || selectedFields.length === 0 ? 'none' : '0 4px 12px rgba(20,83,45,0.22)',
            letterSpacing: '-0.01em',
          }}
        >
          {loading ? <Loader2 size={15} /> : <ScanText size={15} />}
          {loading ? 'Загрузка файлов...' : 'Распознать'}
        </button>
        <button
          onClick={() => { setSelectedFields([]); setActiveTemplate(null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 18px', borderRadius: 12, fontSize: 14,
            background: '#F6F7F6', color: '#6B7572', border: 'none',
            cursor: 'pointer', fontWeight: 700,
          }}
        >
          <X size={14} /> Очистить
        </button>
      </div>

      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 12, padding: '10px 14px',
          background: '#EBF0FE', borderRadius: 10,
          fontSize: 12.5, color: '#3052D6', fontWeight: 600,
        }}>
          <Loader2 size={14} />
          {isLargeUpload ? `Загружаем файлы (~${totalSizeMB.toFixed(1)} МБ)...` : 'Загружаем файлы...'}
        </div>
      )}
    </div>
  )
}
