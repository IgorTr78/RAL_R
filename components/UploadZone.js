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
          border: `1.5px dashed ${dragging ? '#1C6B41' : '#DCE4DF'}`,
          borderRadius: 20,
          padding: '48px 24px',
          textAlign: 'center',
          background: dragging ? '#ECF6EF' : 'white',
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginBottom: 12,
          boxShadow: dragging ? '0 0 0 4px #ECF6EF' : 'none',
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
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, #ECF6EF 0%, #DCEFE2 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px', color: '#1C6B41',
        }}>
          <Upload size={26} strokeWidth={2.2} />
        </div>
        <p style={{ fontSize: 15.5, fontWeight: 700, color: '#16201A', marginBottom: 5, letterSpacing: '-0.01em' }}>
          Перетащите файл сюда или нажмите для выбора
        </p>
        <p style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500 }}>
          PDF, JPEG, PNG, TIFF — до 20 МБ
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 12, fontSize: 14,
            background: '#16201A', color: 'white', border: 'none',
            cursor: 'pointer', fontWeight: 700, letterSpacing: '-0.01em',
          }}
        >
          <File size={16} /> Выбрать файл
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); archiveRef.current.click() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 12, fontSize: 14,
            background: 'white', color: '#16201A',
            border: '1.5px solid #E5E9E6',
            cursor: 'pointer', fontWeight: 700, letterSpacing: '-0.01em',
          }}
        >
          <FileArchive size={16} /> Загрузить архив (ZIP)
        </button>
        <input
          ref={archiveRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {selectedFiles.length > 0 && (
        <div style={{
          marginTop: 12, padding: '11px 16px',
          background: '#ECF6EF', borderRadius: 12,
          fontSize: 13, color: '#14532D', fontWeight: 600,
        }}>
          ✓ Выбрано файлов: {selectedFiles.length} — {selectedFiles.map(f => f.name).join(', ')}
        </div>
      )}
    </div>
  )
}
