import './globals.css'
import Sidebar from '../components/Sidebar'

export const metadata = {
  title: 'Росагролизинг DocRecognizer — распознавание документов',
  description: 'Система распознавания и извлечения данных из документов',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar />
          <main style={{ flex: 1, minWidth: 0 }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
