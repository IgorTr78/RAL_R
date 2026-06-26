'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import UploadZone from '../../components/UploadZone'
import ParametersForm from '../../components/ParametersForm'
import { supabase } from '../../lib/supabaseClient'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)

  const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp']

  // Проверяет, выглядит ли имя файла "битым" (нечитаемые символы из-за проблем
  // с кодировкой кириллицы в ZIP-архивах с Windows/macOS)
  const isGarbledName = (name) => {
    return /\uFFFD|[\x00-\x08\x0E-\x1F]/.test(name)
  }

  // Распаковывает ZIP-файл в массив { name, blob } для поддерживаемых форматов
  const extractZip = async (zipFile) => {
    const zip = await JSZip.loadAsync(zipFile)
    const result = []
    let counter = 1

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      let name = path.split('/').pop()
      const ext = name.split('.').pop().toLowerCase()
      if (!ALLOWED_EXTS.includes(ext)) continue
      if (name.startsWith('.') || path.includes('__MACOSX')) continue

      if (isGarbledName(name)) {
        name = `документ_${counter}.${ext}`
      }
      counter++

      const blob = await entry.async('blob')
      result.push({ name, blob })
    }

    return result
  }

  const handleRecognize = async (fields, model, templateName) => {
    if (files.length === 0) {
      alert('Сначала выберите файл для загрузки')
      return
    }
    setLoading(true)

    try {
      const inputFile = files[0]
      const inputExt = inputFile.name.split('.').pop().toLowerCase()

      let documents = []
      let taskFilename = inputFile.name
      let taskFileSize = inputFile.size

      if (inputExt === 'zip') {
        const extracted = await extractZip(inputFile)
        if (extracted.length === 0) {
          throw new Error('В архиве не найдено поддерживаемых файлов (PDF, JPG, PNG, TIFF)')
        }
        documents = extracted.map(f => ({
          file: f.blob,
          name: f.name,
          size: f.blob.size,
        }))
      } else if (inputExt === 'rar') {
        throw new Error('Формат RAR пока не поддерживается. Используйте ZIP или загрузите файлы по одному.')
      } else {
        documents = [{ file: inputFile, name: inputFile.name, size: inputFile.size }]
      }

      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          filename: taskFilename,
          file_size: taskFileSize,
          doc_count: documents.length,
          status: 'pending',
          fields: fields,
          model: model || 'gpt-4o-mini',
          template_name: templateName || null,
        })
        .select()
        .single()

      if (taskError) throw taskError

      for (const doc of documents) {
        const ext = doc.name.split('.').pop()
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(safeName, doc.file)

        if (uploadError) throw uploadError

        const { error: docError } = await supabase
          .from('documents')
          .insert({
            task_id: taskData.id,
            filename: doc.name,
            file_path: safeName,
            file_size: doc.size,
            status: 'pending',
          })

        if (docError) throw docError
      }

      setFiles([])
      router.push('/')
    } catch (err) {
      console.error('[handleRecognize] Ошибка:', err)
      alert('Ошибка при загрузке: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>Загрузка</div>
        <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2 }}>Загрузите документ или ZIP-архив для распознавания</div>
      </div>

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#9CA6A0',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      }}>
        Загрузка документов
      </p>

      <UploadZone onFilesSelected={setFiles} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: '8px 0 20px', color: '#C4CCC8', fontSize: 12,
      }}>
        <div style={{ flex: 1, height: 0.5, background: '#E5E9E6' }} />
        параметры распознавания
        <div style={{ flex: 1, height: 0.5, background: '#E5E9E6' }} />
      </div>

      <ParametersForm onSubmit={handleRecognize} loading={loading} files={files} />
    </div>
  )
}
