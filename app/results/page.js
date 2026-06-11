'use client'
import { useRouter } from 'next/navigation'
import ResultsTable from '../../components/ResultsTable'
import { ScanText, ArrowLeft } from 'lucide-react'

const DEMO_FIELDS = ['Номер счёта', 'Дата документа', 'Поставщик', 'Сумма без НДС', 'Сумма НДС']

const DEMO_ROWS = [
  { id: '1', filename: 'schet_001.pdf', size: '184 КБ', confidence: 94, status: 'ok',
    values: { 'Номер счёта': 'СФ-2024/1138', 'Дата документа': '05.12.2024', 'Поставщик': 'ООО «Альфа Трейд»', 'Сумма без НДС': '84 500,00 ₽', 'Сумма НДС': '15 210,00 ₽' } },
  { id: '2', filename: 'schet_002.pdf', size: '210 КБ', confidence: 88, status: 'ok',
    values: { 'Номер счёта': 'СФ-2024/1139', 'Дата документа': '06.12.2024', 'Поставщик': 'ИП Борисов К.А.', 'Сумма без НДС': '32 000,00 ₽', 'Сумма НДС': '5 760,00 ₽' } },
  { id: '3', filename: 'schet_003.pdf', size: '97 КБ',  confidence: 58, status: 'warning',
    values: { 'Номер счёта': 'СФ-2024/1140', 'Дата документа': '07.12.2024', 'Поставщик': '', 'Сумма без НДС': '121 300,00 ₽', 'Сумма НДС': '' } },
  { id: '4', filename: 'schet_004.pdf', size: '156 КБ', confidence: 96, status: 'ok',
    values: { 'Номер счёта': 'СФ-2024/1141', 'Дата документа': '08.12.2024', 'Поставщик': 'ЗАО «ТехноПром»', 'Сумма без НДС': '67 800,00 ₽', 'Сумма НДС': '12 204,00 ₽' } },
  { id: '5', filename: 'schet_005.pdf', size: '43 КБ',  confidence: 12, status: 'error',
    values: { 'Номер счёта': '', 'Дата документа': '', 'Поставщик': '', 'Сумма без НДС': '', 'Сумма НДС': '' } },
  { id: '6', filename: 'schet_006.pdf', size: '198 КБ', confidence: 91, status: 'ok',
    values: { 'Номер счёта': 'СФ-2024/1143', 'Дата документа': '10.12.2024', 'Поставщик': 'ООО «СтройМаш»', 'Сумма без НДС': '245 000,00 ₽', 'Сумма НДС': '44 100,00 ₽' } },
]

export default function ResultsPage({ params }) {
  const router = useRouter()

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: '#3B6D11', cursor: 'pointer',
              border: '0.5px solid #3B6D11', borderRadius: 8,
              padding: '7px 14px', background: 'white', fontWeight: 500,
            }}
          >
            <ArrowLeft size={14} /> Назад
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: '#3B6D11', borderRadius: 10, padding: '7px 9px',
              display: 'flex', alignItems: 'center',
            }}>
              <ScanText size={20} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2e1a' }}>
                Результаты распознавания
              </div>
              <div style={{ fontSize: 13, color: '#6b8f6b', marginTop: 2 }}>
                счета_декабрь.zip · 6 документов · 11 июня 2026
              </div>
            </div>
          </div>
        </div>
      </div>

      <ResultsTable
        fields={DEMO_FIELDS}
        rows={DEMO_ROWS}
        taskName="schet_dekabr"
      />
    </div>
  )
}
