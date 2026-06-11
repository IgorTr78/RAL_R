import './globals.css'

export const metadata = {
  title: 'DocRecognizer — распознавание документов',
  description: 'Система распознавания и извлечения данных из документов',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
