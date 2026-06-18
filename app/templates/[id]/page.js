'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { ArrowLeft, Upload, Trash2, Save } from 'lucide-react'

export const dynamic = 'force-dynamic'

const EXAMPLES_BUCKET = 'template-examples'

export default function TemplateDetailPage() {
  const router = useRouter()
  const params = useParams()
  const templateId = params.id

  const [template, setTemplate] = useState(null)
  const [examples, setExamples] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const [instructions, setInstructions] = useState('')
  const [savingInstructions, setSavingInstructions] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: t, error: tErr } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (tErr) {
      console.error('Ошибка загрузки шаблона:', tErr)
      setLoading(false)
      return
    }
    setTemplate(t)
    setInstructions(t.prompt_instructions || '')

    const { data: ex, error: exErr } = await supabase
      .from('template_examples')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })

    if (exErr) {
      console.error('Ошибка загрузки эталонов:', exErr)
    } else {
      setExamples(ex || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (templateId) load()
  }, [templateId])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const safeName = `${templateId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(EXAMPLES_BUCKET)
        .upload(safeName, file)
      if (upErr) throw upErr

      const emptyValues = {}
      ;(template?.fields || []).forEach(f => { emptyValues[f] = '' })

      const { error: insErr } = await supabase
        .from('template_examples')
        .insert({
          template_id: templateId,
          file_path: safeName,
          filename: file.name,
          values: emptyValues,
        })
      if (insErr) throw insErr

      await load()
    } catch (err) {
      console.error('Ошибка загрузки эталона:', err)
      alert('Ошибка при загрузке: ' + err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDeleteExample = async (example) => {
    if (!confirm('Удалить этот эталон?')) return
    try {
      await supabase.storage.from(EXAMPLES_BUCKET).remove([example.file_path])
      const { error } = await supabase.from('template_examples').delete().eq('id', example.id)
      if (error) throw error
      await load()
    } catch (err) {
      console.error('Ошибка удаления эталона:', err)
      alert('Ошибка при удалении: ' + err.message)
    }
  }

  const updateExampleValue = (exampleId, field, value) => {
    setExamples(prev => prev.map(ex =>
      ex.id === exampleId ? { ...ex, values: { ...ex.values, [field]: value } } : ex
    ))
  }

  const saveExampleValues = async (example) => {
    try {
      const { error } = await supabase
        .from('template_examples')
        .update({ values: example.values })
        .eq('id', example.id)
      if (error) throw error
    } catch (err) {
      console.error('Ошибка сохранения значений:', err)
      alert('Ошибка при сохранении: ' + err.message)
    }
  }

  const saveInstructions = async () => {
    setSavingInstructions(true)
    try {
      const { error } = await supabase
        .from('document_templates')
        .update({ prompt_instructions: instructions, updated_at: new Date().toISOString() })
        .eq('id', templateId)
      if (error) throw error
    } catch (err) {
      console.error('Ошибка сохранения инструкций:', err)
      alert('Ошибка при сохранении: ' + err.message)
    } finally {
      setSavingInstructions(false)
    }
  }

  const getPublicUrl = (path) => {
    const { data } = supabase.storage.from(EXAMPLES_BUCKET).getPublicUrl(path)
    return data?.publicUrl
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px', color: '#9CA6A0', fontSize: 14 }}>
        Загрузка...
      </div>
    )
  }

  if (!template) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px', color: '#9CA6A0', fontSize: 14 }}>
        Шаблон не найден
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
      <button
        onClick={() => router.push('/templates')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18,
          background: 'none', border: 'none', color: '#9CA6A0', fontSize: 13, cursor: 'pointer', padding: 0,
        }}
      >
        <ArrowLeft size={15} /> Все шаблоны
      </button>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>{template.name}</div>
        {template.description && (
          <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2 }}>{template.description}</div>
        )}
      </div>

      <div style={{
        background: 'white', borderRadius: 16, padding: 18, marginBottom: 20,
        boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16201A', marginBottom: 8 }}>Поля распознавания</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(template.fields || []).map(f => (
            <span key={f} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 999,
              background: '#F0F2F0', color: '#3A453E', fontWeight: 500,
            }}>{f}</span>
          ))}
          {(!template.fields || template.fields.length === 0) && (
            <span style={{ fontSize: 12.5, color: '#9CA6A0' }}>Поля не заданы</span>
          )}
        </div>
      </div>

      <div style={{
        background: 'white', borderRadius: 16, padding: 18, marginBottom: 28,
        boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16201A', marginBottom: 8 }}>
          Инструкции для промпта по этому типу документа
        </div>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Например: VIN находится в строке «Идентификационный номер (VIN)», ИНН записан в отдельных клетках по одной цифре в каждой..."
          rows={5}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: '1.5px solid #E5E9E6', fontSize: 13.5, marginBottom: 12,
            boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={saveInstructions}
          disabled={savingInstructions}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 9,
            background: '#16201A', color: 'white', border: 'none',
            fontSize: 13, fontWeight: 700, cursor: savingInstructions ? 'default' : 'pointer',
            opacity: savingInstructions ? 0.6 : 1,
          }}
        >
          <Save size={14} /> {savingInstructions ? 'Сохранение...' : 'Сохранить инструкции'}
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
      }}>
        <p style={{
          fontSize: 11, fontWeight: 600, color: '#9CA6A0',
          textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0,
        }}>
          Эталонные примеры ({examples.length})
        </p>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: uploading ? 'default' : 'pointer',
          padding: '8px 14px', borderRadius: 9, background: '#ECF6EF', color: '#1C6B41',
          fontSize: 13, fontWeight: 700, opacity: uploading ? 0.6 : 1,
        }}>
          <Upload size={14} /> {uploading ? 'Загрузка...' : 'Загрузить эталон'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {examples.length === 0 ? (
        <div style={{
          border: '1.5px dashed #DCE4DF', borderRadius: 16, padding: 32,
          textAlign: 'center', color: '#9CA6A0', fontSize: 13.5,
        }}>
          Загрузите первый эталонный пример этого типа документа
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {examples.map(ex => (
            <div key={ex.id} style={{
              background: 'white', borderRadius: 16, padding: 16,
              boxShadow: '0 1px 2px rgba(22,32,26,0.04), 0 0 0 1px rgba(22,32,26,0.04)',
              display: 'flex', gap: 16,
            }}>
              <img
                src={getPublicUrl(ex.file_path)}
                alt={ex.filename}
                style={{
                  width: 120, height: 120, objectFit: 'cover', borderRadius: 10,
                  background: '#F0F2F0', flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#16201A' }}>{ex.filename}</span>
                  <Trash2
                    size={15}
                    color="#C0392B"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleDeleteExample(ex)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(template.fields || []).map(field => (
                    <div key={field}>
                      <label style={{ fontSize: 11, color: '#9CA6A0', display: 'block', marginBottom: 3 }}>{field}</label>
                      <input
                        value={ex.values?.[field] || ''}
                        onChange={e => updateExampleValue(ex.id, field, e.target.value)}
                        onBlur={() => saveExampleValues(ex)}
                        style={{
                          width: '100%', padding: '6px 9px', borderRadius: 8,
                          border: '1.5px solid #E5E9E6', fontSize: 12.5,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
