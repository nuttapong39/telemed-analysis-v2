// =============================================================================
// Telemedicine Dashboard - fiscal-year service summary
//
// Sections, top to bottom:
//   1. Hero          - heading, fiscal year, illustration
//   2. Toolbar       - fiscal-year picker, refresh, CSV
//   3. Service cards - all services, B2B, B2C, Telehealth: visits + amount,
//                      each against the same months of the prior fiscal year
//   4. Monthly trend - stacked bars by service, prior year as a dashed line
//   5. Month table   - fiscal months × services
//
// One fetch per fiscal year (it covers the prior year too). Everything else —
// series, year-to-date sums, deltas, modal contents, CSV — is derived
// client-side from those monthly summary rows.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw, Table2 } from 'lucide-react';

import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { useQuery } from '@/hooks/useQuery';
import { executeSqlViaApiQueued } from '@/services/bmsSession';
import {
  TELEMED_SERVICES,
  buildFiscalSeries,
  buildTelemedFetchParams,
  buildTelemedMonthlySql,
  buildTelemedMonthlyTotalSql,
  csvFilename,
  elapsedMonths,
  fiscalMonthLabel,
  fiscalMonths,
  fiscalYearOf,
  fiscalYearOptions,
  normalizeMonthlyRows,
  normalizeMonthlyTotals,
  percentChange,
  summarizeSeries,
  toMonthlyCsv,
} from '@/services/telemed';
import type { MonthlyServiceRow, MonthlyTotalRow, ServiceKey } from '@/services/telemed';
import {
  EmptyState,
  ErrorState,
  FiscalYearSelect,
  LoadingState,
  SectionCard,
  SegmentedToggle,
  ToolbarButton,
} from '@/components/telemed/primitives';
import { TelemedHero } from '@/components/telemed/TelemedHero';
import { ServiceCard } from '@/components/telemed/ServiceCard';
import { MonthlyTrendChart } from '@/components/telemed/MonthlyTrendChart';
import type { TrendMetric } from '@/components/telemed/MonthlyTrendChart';
import { MonthlyTable } from '@/components/telemed/MonthlyTable';
import { DetailModal } from '@/components/telemed/DetailModal';
import type { ServiceTone } from '@/components/telemed/serviceTheme';
import type { SqlApiResponse } from '@/types';
import { downloadTextFile } from '@/utils/format';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TelemedData {
  rows: MonthlyServiceRow[];
  totals: MonthlyTotalRow[];
}

/** Throw a readable error when the API answers but not with success. */
function ensureOk(response: SqlApiResponse): SqlApiResponse {
  if (response.MessageCode !== 200) {
    throw new Error(response.Message || 'ไม่สามารถดึงข้อมูลได้');
  }
  return response;
}

/** Turn a thrown error into an actionable Thai message. */
function errorMessage(error: Error | null): string {
  if (!error) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  if (/unauthorized|expired/i.test(error.message)) {
    return 'เซสชันหมดอายุ กรุณาเชื่อมต่อใหม่แล้วลองอีกครั้ง';
  }
  if (/timed out/i.test(error.message)) {
    return 'คำขอนานเกินไป กรุณาลองใหม่อีกครั้ง';
  }
  if (/unable to connect/i.test(error.message)) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
  }
  return error.message;
}

const DERIVATION: Record<ServiceTone, string> = {
  total:
    'Visit นับ VN ที่ไม่ซ้ำในแต่ละเดือนจากทั้ง 3 บริการ (visit ที่มีหลายรหัสนับครั้งเดียว) · จำนวนเงินคือผลรวม sum_price ของทุกรายการ · รายการไม่คิดเงินคือรายการที่ unitprice = 0',
  b2b: 'นับ VN ที่ไม่ซ้ำของรหัส 3002487 ในแต่ละเดือน · จำนวนเงินคือผลรวม sum_price ของรายการรหัสนี้ · รายการไม่คิดเงินคือรายการที่ unitprice = 0',
  b2c: 'นับ VN ที่ไม่ซ้ำของรหัส 3002488 ในแต่ละเดือน · จำนวนเงินคือผลรวม sum_price ของรายการรหัสนี้ · รายการไม่คิดเงินคือรายการที่ unitprice = 0',
  telehealth:
    'นับ VN ที่ไม่ซ้ำของรหัส 3002416 ในแต่ละเดือน · จำนวนเงินคือผลรวม sum_price ของรายการรหัสนี้ · รายการไม่คิดเงินคือรายการที่ unitprice = 0',
};

const TOTAL_CARD = {
  label: 'รวมทุกบริการ',
  description: 'B2B · B2C · Telehealth',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TelemedDashboard() {
  const { connectionConfig, marketplaceToken } = useBmsSessionContext();

  // "Today" is fixed when the page opens, so the default fiscal year and the
  // year-to-date window do not shift under the viewer mid-session.
  const [today] = useState(() => new Date());
  const currentFiscalYear = fiscalYearOf(today);
  const options = useMemo(() => fiscalYearOptions(currentFiscalYear), [currentFiscalYear]);

  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear);
  const [metric, setMetric] = useState<TrendMetric>('visits');
  const [detail, setDetail] = useState<ServiceTone | null>(null);

  const { data, error, isLoading, isError, execute } = useQuery<TelemedData>({
    queryFn: async () => {
      if (!connectionConfig) return { rows: [], totals: [] };
      const params = buildTelemedFetchParams(fiscalYear);
      const [monthly, totals] = await Promise.all([
        executeSqlViaApiQueued(buildTelemedMonthlySql(), connectionConfig, params, marketplaceToken),
        executeSqlViaApiQueued(buildTelemedMonthlyTotalSql(), connectionConfig, params, marketplaceToken),
      ]);
      return {
        rows: normalizeMonthlyRows(ensureOk(monthly).data ?? []),
        totals: normalizeMonthlyTotals(ensureOk(totals).data ?? []),
      };
    },
  });

  useEffect(() => {
    if (!connectionConfig) return;
    void execute();
  }, [connectionConfig, fiscalYear, execute]);

  // --- Derived views (all client-side, no refetch) -------------------------

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totals = useMemo(() => data?.totals ?? [], [data]);

  const series = useMemo(
    () => buildFiscalSeries(rows, totals, fiscalYear, today),
    [rows, totals, fiscalYear, today],
  );
  const previousSeries = useMemo(
    () => buildFiscalSeries(rows, totals, fiscalYear - 1, today),
    [rows, totals, fiscalYear, today],
  );

  // Compare like with like: an in-progress year against the same months of
  // the year before, never against a full year.
  const monthCount = elapsedMonths(fiscalYear, today);
  const current = useMemo(() => summarizeSeries(series, monthCount), [series, monthCount]);
  const previous = useMemo(
    () => summarizeSeries(previousSeries, monthCount),
    [previousSeries, monthCount],
  );

  const compareLabel = useMemo(() => {
    if (monthCount >= 12) return `เทียบปีงบประมาณ ${fiscalYear - 1}`;
    const months = fiscalMonths(fiscalYear - 1);
    const first = fiscalMonthLabel(months[0]).split(' ')[0];
    const last = fiscalMonthLabel(months[Math.max(0, monthCount - 1)]).split(' ')[0];
    const span = monthCount <= 1 ? first : `${first}–${last}`;
    return `เทียบ ${span} ของปีงบประมาณ ${fiscalYear - 1}`;
  }, [fiscalYear, monthCount]);

  const exportCsv = useCallback(() => {
    downloadTextFile(csvFilename(fiscalYear), toMonthlyCsv(rows, fiscalYear));
  }, [rows, fiscalYear]);

  const selectService = useCallback((key: ServiceKey) => setDetail(key), []);

  // --- Render flags -------------------------------------------------------

  const hasYearData = series.some((p) => p.total.itemRows > 0);
  const empty = !isLoading && !isError && data !== null && !hasYearData;
  const ready = !isLoading && !isError && data !== null && hasYearData;
  const canGoBack = options.includes(fiscalYear - 1);

  const cards: Array<{
    tone: ServiceTone;
    label: string;
    description: string;
    now: { visits: number; amount: number };
    before: { visits: number; amount: number };
  }> = [
    { tone: 'total', ...TOTAL_CARD, now: current.total, before: previous.total },
    ...TELEMED_SERVICES.map((s) => ({
      tone: s.key,
      label: s.label,
      description: s.description,
      now: current.services[s.key],
      before: previous.services[s.key],
    })),
  ];

  const detailMeta =
    detail === 'total' ? TOTAL_CARD : (TELEMED_SERVICES.find((s) => s.key === detail) ?? TOTAL_CARD);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      {/* 1. Hero ----------------------------------------------------------- */}
      <TelemedHero fiscalYear={fiscalYear} />

      {/* 2. Toolbar -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiscalYearSelect
          value={fiscalYear}
          options={options}
          onChange={setFiscalYear}
          disabled={isLoading}
        />
        <div className="flex items-center gap-2">
          <ToolbarButton onClick={() => void execute()} disabled={isLoading} title="ดึงข้อมูลใหม่">
            <RefreshCw className={isLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            รีเฟรช
          </ToolbarButton>
          <ToolbarButton onClick={exportCsv} disabled={!ready} title={csvFilename(fiscalYear)}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </ToolbarButton>
        </div>
      </div>

      {/* Status ------------------------------------------------------------ */}
      {isError && (
        <SectionCard title="เกิดข้อผิดพลาด">
          <ErrorState message={errorMessage(error)} onRetry={() => void execute()} />
        </SectionCard>
      )}

      {isLoading && (
        <SectionCard title="กำลังโหลดข้อมูล" description={`ปีงบประมาณ ${fiscalYear}`}>
          <LoadingState message="กำลังสรุปข้อมูลรายเดือน..." />
        </SectionCard>
      )}

      {empty && (
        <SectionCard title="ไม่พบข้อมูล">
          <EmptyState
            title={`ยังไม่มีบริการ Telemedicine ในปีงบประมาณ ${fiscalYear}`}
            message={
              fiscalYear === currentFiscalYear
                ? 'ปีงบประมาณนี้เพิ่งเริ่มต้น ข้อมูลจะปรากฏเมื่อมีการบันทึกบริการ'
                : 'ไม่พบรายการของทั้ง 3 บริการในช่วงนี้'
            }
            action={
              canGoBack
                ? { label: `ดูปีงบประมาณ ${fiscalYear - 1}`, onClick: () => setFiscalYear(fiscalYear - 1) }
                : undefined
            }
          />
        </SectionCard>
      )}

      {/* Content ----------------------------------------------------------- */}
      {ready && (
        <>
          {/* 3. Service cards ---------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <ServiceCard
                key={c.tone}
                tone={c.tone}
                label={c.label}
                description={c.description}
                visits={c.now.visits}
                amount={c.now.amount}
                visitChange={percentChange(c.now.visits, c.before.visits)}
                amountChange={percentChange(c.now.amount, c.before.amount)}
                compareLabel={compareLabel}
                onClick={() => setDetail(c.tone)}
              />
            ))}
          </div>

          {/* 4. Monthly trend ---------------------------------------------- */}
          <SectionCard
            title="แนวโน้มรายเดือน"
            description="แยกตามบริการ · คลิกแท่งเพื่อดูรายละเอียดของบริการนั้น"
            icon={<BarChart3 className="h-5 w-5" />}
            aside={
              <SegmentedToggle
                label="ตัวชี้วัดของกราฟ"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'visits', label: 'Visit' },
                  { value: 'amount', label: 'ยอดเงิน' },
                ]}
              />
            }
          >
            <MonthlyTrendChart
              series={series}
              previousSeries={previousSeries}
              previousFiscalYear={fiscalYear - 1}
              metric={metric}
              onSelectService={selectService}
            />
          </SectionCard>

          {/* 5. Month table ------------------------------------------------ */}
          <SectionCard
            title="สรุปรายเดือน"
            description="Visit (ตัวหนา) และจำนวนเงินเป็นบาท (ตัวเล็ก) ของแต่ละบริการ"
            icon={<Table2 className="h-5 w-5" />}
            aside={
              <ToolbarButton onClick={exportCsv} className="px-2.5 py-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                {csvFilename(fiscalYear)}
              </ToolbarButton>
            }
          >
            <MonthlyTable series={series} />
          </SectionCard>

          <p className="pb-2 text-center text-xs text-muted-foreground">
            ข้อมูลสรุปรายเดือนแบบอ่านอย่างเดียวจาก HOSxP · ไม่มีข้อมูลรายบุคคลของผู้ป่วย
          </p>
        </>
      )}

      {/* Detail modal ------------------------------------------------------ */}
      {detail !== null && (
        <DetailModal
          open
          onOpenChange={(open) => !open && setDetail(null)}
          tone={detail}
          title={detailMeta.label}
          description={detailMeta.description}
          derivation={DERIVATION[detail]}
          series={series}
          previousSeries={previousSeries}
          fiscalYear={fiscalYear}
          monthCount={monthCount}
          compareLabel={compareLabel}
        />
      )}
    </div>
  );
}
