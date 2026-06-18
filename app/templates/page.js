'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { Plus, FileText, X } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newFields, setNewFields] = useState('')

  const loadTemplates = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('document_templates')
      .select('*, template_examples(count)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Ошибка загрузки шаблонов:', error)
    } else {
      setTemplates(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) {
      alert('Укажите название типа документа')
      return
    }
    const fieldsList = newFields
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean)

    setCreating(true)
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .insert({
          name: newName.trim(),
          description: newDescription.trim() || null,
          fields: fieldsList,
        })
        .select()
        .single()

      if (error) throw error

      setShowCreate(false)
      setNewName('')
      setNewDescription('')
      setNewFields('')
      await loadTemplates()
      router.push(`/templates/${data.id}`)
    } catch (err) {
      console.error('Ошибка создания шаблона:', err)
      alert('Ошибка при создании: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 28,
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>Шаблоны документов</div>
          <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2, maxWidth: 480 }}>
            Эталонные примеры и правильные значения полей для каждого типа документа повышают точность распознавания
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA6A0', fontSize: 14 }}>
          Загрузка...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => router.push(`/templates/${t.id}`)}
              style={{
                background: 'white', borderRadius: 16,
                padding: '18px 18px',
                boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, background: '#ECF6EF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileText size={17} color="#1C6B41" />
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: '#16201A' }}>{t.name}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#9CA6A0', marginBottom: 4 }}>
                {(t.template_examples?.[0]?.count ?? 0)} эталона · {(t.fields?.length ?? 0)} полей
              </div>
            </div>
          ))}

          <div
            onClick={() => setShowCreate(true)}
            style={{
              border: '1.5px dashed #DCE4DF', borderRadius: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, color: '#9CA6A0', minHeight: 96, cursor: 'pointer',
            }}
          >
            <Plus size={20} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Добавить шаблон</span>
          </div>
        </div>
      )}

      {!loading && templates.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9CA6A0', fontSize: 13.5, marginTop: 16 }}>
          Шаблонов пока нет — добавьте первый тип документа
        </div>
      )}

      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(22,32,26,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 18, padding: 24,
              width: 440, maxWidth: '90vw',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#16201A' }}>Новый шаблон документа</span>
              <X size={18} color="#9CA6A0" style={{ cursor: 'pointer' }} onClick={() => setShowCreate(false)} />
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A453E', display: 'block', marginBottom: 6 }}>
              Название типа документа
            </label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Например: Свидетельство ИНН"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid #E5E9E6', fontSize: 14, marginBottom: 14,
                boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A453E', display: 'block', marginBottom: 6 }}>
              Описание (необязательно)
            </label>
            <input
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Короткое описание документа"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid #E5E9E6', fontSize: 14, marginBottom: 14,
                boxSizing: 'border-box',
              }}
            />

            <label style={{ fontSize: 12, fontWeight: 600, color: '#3A453E', display: 'block', marginBottom: 6 }}>
              Поля для распознавания (каждое с новой строки)
            </label>
            <textarea
              value={newFields}
              onChange={e => setNewFields(e.target.value)}
              placeholder={'ИНН\nНаименование организации\nДата выдачи'}
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid #E5E9E6', fontSize: 14, marginBottom: 18,
                boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
              }}
            />

            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10,
                background: '#16201A', color: 'white', border: 'none',
                fontSize: 14, fontWeight: 700, cursor: creating ? 'default' : 'pointer',
                opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? 'Создание...' : 'Создать шаблон'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
