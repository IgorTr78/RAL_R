'use client'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#16201A', letterSpacing: '-0.02em' }}>Настройки</div>
        <div style={{ fontSize: 13, color: '#9CA6A0', fontWeight: 500, marginTop: 2 }}>Модели, ключи API, пороги confidence</div>
      </div>

      <div style={{
        border: '1.5px dashed #DCE4DF', borderRadius: 16, padding: 32,
        textAlign: 'center', color: '#9CA6A0', fontSize: 13.5,
      }}>
        Раздел в разработке
      </div>
    </div>
  )
}
