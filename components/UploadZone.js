'use client'
import { useState, useRef } from 'react'
import { Upload, FileArchive, File } from 'lucide-react'

export default function UploadZone({ onFilesSelected }) {
  const [dragging, setDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const fileRef = useRef()
  const archiveRef = useRef()

  const handleFiles = (files) => {
    const arr = Array.from(files)
    setSelectedFiles(arr)
    if (onFilesSelected) onFilesSelected(arr)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="mb-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current.click()}
        style={{
          border: `2px dashed ${dragging ? '#3B6D11' : '#c0d4b8'}`,
          borderRadius: 14,
          padding: '40px 24px',
          textAlign: 'center',
          background: dragging ? '#eaf3de' : '#fafcf9',
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginBottom: 12,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ marginBottom: 12, color: '#3B6D11' }}>
          <Upload size={36} strokeWidth={1.5} style={{ margin: '0 auto' }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 500, color: '#2a3d2a', marginBottom: 4 }}>
          Перетащите файл сюда или нажмите для выбора
        </p>
        <p style={{ fontSize: 13, color: '#8aaa8a' }}>
          PDF, JPEG, PNG, TIFF — до 20 МБ
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 9, fontSize: 14,
            background: '#3B6D11', color: 'white', border: 'none',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          <File size={16} /> Выбрать файл
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); archiveRef.current.click() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 9, fontSize: 14,
            background: 'white', color: '#3B6D11',
            border: '1px solid #3B6D11',
            cursor: 'pointer', fontWeight: 500,
          }}
        >
          <FileArchive size={16} /> Загрузить архив (ZIP)
        </button>
        <input
          ref={archiveRef}
          type="file"
          accept=".zip,.rar"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {selectedFiles.length > 0 && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: '#eaf3de', borderRadius: 9,
          fontSize: 13, color: '#3B6D11', fontWeight: 500,
        }}>
          ✓ Выбрано файлов: {selectedFiles.length} — {selectedFiles.map(f => f.name).join(', ')}
        </div>
      )}
    </div>
  )
}
