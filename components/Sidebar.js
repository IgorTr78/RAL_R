'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Upload, Files, LayoutTemplate, BarChart3, Settings, ScanText } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/upload', label: 'Загрузка', icon: Upload },
  { href: '/documents', label: 'Все документы', icon: Files },
  { href: '/templates', label: 'Шаблоны документов', icon: LayoutTemplate },
  { href: '/stats', label: 'Статистика', icon: BarChart3 },
  { href: '/settings', label: 'Настройки', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 230, flexShrink: 0,
      background: '#FAFBFA', borderRight: '1px solid #ECEFEC',
      minHeight: '100vh', padding: '20px 12px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px 22px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #1C6B41 0%, #14532D 100%)',
          borderRadius: 10, width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <ScanText size={16} color="white" />
          <div style={{
            position: 'absolute', top: -3, right: -3, width: 10, height: 10,
            borderRadius: '50%', background: '#EAB308', border: '2px solid #FAFBFA',
          }} />
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#16201A', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          Росагролизинг<br/>DocRecognizer
        </span>
      </div>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 9,
              fontSize: 13.5, fontWeight: active ? 600 : 500,
              color: active ? '#14532D' : '#3A453E',
              background: active ? '#E7F2EA' : 'transparent',
              textDecoration: 'none',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Icon size={17} strokeWidth={active ? 2.3 : 2} />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}
