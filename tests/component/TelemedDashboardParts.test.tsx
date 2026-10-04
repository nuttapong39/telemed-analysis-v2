// =============================================================================
// Telemedicine Dashboard — hero, service cards, fiscal-year picker, month table
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TelemedHero } from '@/components/telemed/TelemedHero'
import { ServiceCard } from '@/components/telemed/ServiceCard'
import { MonthlyTable } from '@/components/telemed/MonthlyTable'
import { FiscalYearSelect } from '@/components/telemed/primitives'
import { buildFiscalSeries } from '@/services/telemed'
import type { MonthlyServiceRow } from '@/services/telemed'

function row(overrides: Partial<MonthlyServiceRow> = {}): MonthlyServiceRow {
  return {
    month: '2025-10',
    standardCode: 'TELMED',
    icode: '3002416',
    serviceName: 'Telehealth',
    visitTypeCode: '01',
    itemRows: 10,
    visits: 8,
    qty: 10,
    amount: 1000,
    zeroPriceRows: 2,
    noVnRows: 0,
    ...overrides,
  }
}

describe('TelemedHero', () => {
  it('shows the fiscal year and its date span under the page heading', () => {
    render(<TelemedHero fiscalYear={2569} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'ภาพรวมบริการ Telemedicine' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/ปีงบประมาณ 2569/)).toBeInTheDocument()
    expect(screen.getByText(/1 ต\.ค\. 2568 – 30 ก\.ย\. 2569/)).toBeInTheDocument()
  })

  it('keeps the illustration out of the accessibility tree', () => {
    const { container } = render(<TelemedHero fiscalYear={2569} />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))
  })
})

describe('ServiceCard', () => {
  const base = {
    tone: 'b2b' as const,
    label: 'B2B',
    description: 'บริการร่วมกับ รพ.สต.',
    visits: 1234,
    amount: 56789,
    visitChange: 15,
    amountChange: -2.5,
    compareLabel: 'เทียบปีงบ 2568',
  }

  it('shows the service, its visits and its amount', () => {
    render(<ServiceCard {...base} onClick={() => {}} />)
    const card = screen.getByRole('button', { name: /B2B/ })
    expect(within(card).getByText('บริการร่วมกับ รพ.สต.')).toBeInTheDocument()
    expect(within(card).getByText('1,234')).toBeInTheDocument()
    expect(within(card).getByText('56,789')).toBeInTheDocument()
  })

  it('shows a signed year-over-year change for each figure', () => {
    render(<ServiceCard {...base} onClick={() => {}} />)
    expect(screen.getByText('+15%')).toBeInTheDocument()
    expect(screen.getByText('-2.5%')).toBeInTheDocument()
    expect(screen.getAllByText('เทียบปีงบ 2568').length).toBeGreaterThan(0)
  })

  it('says there is no baseline instead of showing a percentage', () => {
    render(
      <ServiceCard {...base} visitChange={null} amountChange={null} onClick={() => {}} />,
    )
    expect(screen.getAllByText('ไม่มีข้อมูลปีงบก่อน')).toHaveLength(2)
  })

  it('opens the drill-down when clicked', () => {
    const onClick = vi.fn()
    render(<ServiceCard {...base} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /B2B/ }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('FiscalYearSelect', () => {
  it('offers the given fiscal years and reports the chosen one as a number', () => {
    const onChange = vi.fn()
    render(<FiscalYearSelect value={2569} options={[2569, 2568, 2567]} onChange={onChange} />)
    const select = screen.getByLabelText('ปีงบประมาณ')
    expect(within(select).getAllByRole('option')).toHaveLength(3)
    fireEvent.change(select, { target: { value: '2568' } })
    expect(onChange).toHaveBeenCalledWith(2568)
  })
})

describe('MonthlyTable', () => {
  const series = buildFiscalSeries(
    [
      row({ month: '2025-10', icode: '3002487', visits: 3, amount: 300 }),
      row({ month: '2025-10', icode: '3002416', visits: 5, amount: 500 }),
    ],
    [],
    2570,
    new Date(2026, 9, 15),
  )

  it('lists all twelve fiscal months plus a total row', () => {
    render(<MonthlyTable series={series} />)
    const rows = screen.getAllByRole('row')
    // header + 12 months + total
    expect(rows).toHaveLength(14)
    expect(screen.getByText('ต.ค. 69')).toBeInTheDocument()
    expect(screen.getByText('ก.ย. 70')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'รวม' })).toBeInTheDocument()
  })

  it('orders the service columns B2B, B2C, Telehealth, then total', () => {
    render(<MonthlyTable series={series} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['เดือน', 'B2B', 'B2C', 'Telehealth', 'รวม'])
  })

  it('marks months that have not started yet', () => {
    render(<MonthlyTable series={series} />)
    const future = screen.getByText('ก.ย. 70').closest('tr')
    expect(future).toHaveAttribute('data-future', 'true')
  })
})
