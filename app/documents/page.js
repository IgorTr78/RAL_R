'use client'
import AllDocumentsList from '../../components/AllDocumentsList'

export const dynamic = 'force-dynamic'

export default function DocumentsPage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>Все документы</div>
        <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2 }}>Сводная таблица всех распознанных документов</div>
      </div>

      <AllDocumentsList />
    </div>
  )
}
