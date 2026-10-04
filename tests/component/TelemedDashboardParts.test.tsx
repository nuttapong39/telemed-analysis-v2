// =============================================================================
// Telemedicine Dashboard — hero, service cards, fiscal-year picker, month table
// =============================================================================

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TelemedHero } from '@/components/telemed/TelemedHero'
import { ServiceCard } from '@/components/telemed/ServiceCard'
import { MonthlyTable } from '@/components/telemed/MonthlyTable'
import { FiscalYearSelect } from '@/components/telemed/primitives'
import { DetailModal } from '@/components/telemed/DetailModal'
import { TOTAL_VISUAL, serviceVisual, withVisuals } from '@/components/telemed/serviceTheme'
import { TOTAL_KEY, buildFiscalSeries, deriveServices } from '@/services/telemed'
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
    visual: serviceVisual(0),
    label: 'B2B',
    description: 'รหัส 3002487',
    visits: 1234,
    amount: 56789,
    visitChange: 15,
    amountChange: -2.5,
    compareLabel: 'เทียบปีงบ 2568',
  }

  it('shows the service, its visits and its amount', () => {
    render(<ServiceCard {...base} onClick={() => {}} />)
    const card = screen.getByRole('button', { name: /B2B/ })
    expect(within(card).getByText('รหัส 3002487')).toBeInTheDocument()
    expect(within(card).getByText('1,234')).toBeInTheDocument()
    expect(within(card).getByText('56,789')).toBeInTheDocument()
  })

  it('keeps a long hospital-given name readable in full on hover', () => {
    const name = 'ค่าบริการการแพทย์ทางไกล (Telemedicine) ร่วมกับ รพ.สต. เครือข่าย'
    render(<ServiceCard {...base} label={name} onClick={() => {}} />)
    expect(screen.getByText(name)).toHaveAttribute('title', name)
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

describe('DetailModal', () => {
  const series = buildFiscalSeries([], [], [], 2569, new Date(2026, 8, 30))
  const base = {
    open: true,
    onOpenChange: () => {},
    selection: TOTAL_KEY,
    visual: TOTAL_VISUAL,
    title: 'รวมทุกบริการ',
    description: 'ทุกรหัสที่ตั้งรหัสมาตรฐาน TELMED (2 รหัส)',
    derivation: 'คำอธิบาย',
    series,
    previousSeries: series,
    fiscalYear: 2569,
    monthCount: 12,
    compareLabel: 'เทียบปีงบประมาณ 2568',
  }

  it('breaks the comparison window down by visit type', () => {
    render(
      <DetailModal
        {...base}
        visitTypes={[
          { code: '01', name: 'มาเอง', visits: 30, amount: 7500, share: 75, previousVisits: 20 },
          { code: '', name: 'ไม่ระบุ', visits: 10, amount: 2500, share: 25, previousVisits: 0 },
        ]}
      />,
    )
    const section = screen.getByRole('region', { name: 'แยกตามประเภทการมา' })
    const rows = within(section).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '30',
      '7,500',
      '75%',
      '20',
    ])
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('ไม่ระบุ')
  })

  it('says so when the window has no visits to break down', () => {
    render(<DetailModal {...base} visitTypes={[]} />)
    const section = screen.getByRole('region', { name: 'แยกตามประเภทการมา' })
    expect(within(section).getByText('ไม่มีรายการในช่วงที่เปรียบเทียบ')).toBeInTheDocument()
  })
})

describe('MonthlyTable', () => {
  const rows = [
    row({ month: '2026-10', icode: '3002487', serviceName: 'B2B', visits: 3, amount: 300 }),
    row({ month: '2026-10', icode: '3002416', serviceName: 'Telehealth', visits: 5, amount: 500 }),
  ]
  const services = withVisuals(deriveServices(rows))
  const series = buildFiscalSeries(rows, [], services, 2570, new Date(2026, 9, 15))

  it('lists all twelve fiscal months plus a total row', () => {
    render(<MonthlyTable series={series} services={services} />)
    const tableRows = screen.getAllByRole('row')
    // header + 12 months + total
    expect(tableRows).toHaveLength(14)
    expect(screen.getByText('ต.ค. 69')).toBeInTheDocument()
    expect(screen.getByText('ก.ย. 70')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'รวม' })).toBeInTheDocument()
  })

  it('has one column per service, ordered by code, then the total', () => {
    render(<MonthlyTable series={series} services={services} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['เดือน', 'Telehealth', 'B2B', 'รวม'])
  })

  it('works for a hospital with a single TELMED service', () => {
    const one = withVisuals([services[0]])
    render(<MonthlyTable series={buildFiscalSeries(rows, [], one, 2570, new Date(2026, 9, 15))} services={one} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['เดือน', 'Telehealth', 'รวม'])
  })

  it('marks months that have not started yet', () => {
    render(<MonthlyTable series={series} services={services} />)
    const future = screen.getByText('ก.ย. 70').closest('tr')
    expect(future).toHaveAttribute('data-future', 'true')
  })
})
