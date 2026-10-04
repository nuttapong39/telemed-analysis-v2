// =============================================================================
// Telemedicine Dashboard - fiscal-year service summary
//
// Sections, top to bottom:
//   1. Hero          - heading, fiscal year, illustration
//   2. Toolbar       - fiscal-year picker, refresh, CSV
//   3. Service cards - all services, then one per TELMED service (read from
//                      the data, ordered by code): visits + amount, each
//                      against the same months of the prior fiscal year
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
  TOTAL_KEY,
  buildFiscalSeries,
  buildTelemedFetchParams,
  buildTelemedMonthlySql,
  buildTelemedMonthlyTotalSql,
  csvFilename,
  deriveServices,
  elapsedMonths,
  emptyMetrics,
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
import type { Metrics, MonthlyServiceRow, MonthlyTotalRow } from '@/services/telemed';
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
import { TOTAL_VISUAL, withVisuals } from '@/components/telemed/serviceTheme';
import type { ServiceEntry } from '@/components/telemed/serviceTheme';
import type { SqlApiResponse } from '@/types';
import { downloadTextFile, formatNumber } from '@/utils/format';

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

/** Plain-language explanation of where a card's numbers come from. */
function derivationFor(service: ServiceEntry | null, year: Metrics): string {
  const visits = service
    ? `นับ VN ที่ไม่ซ้ำของรหัส ${service.icode} (รหัสมาตรฐาน ${service.standardCode || 'TELMED'}) ในแต่ละเดือน`
    : 'Visit นับ VN ที่ไม่ซ้ำในแต่ละเดือนจากทุกรหัสที่ตั้งรหัสมาตรฐาน TELMED (visit ที่มีหลายรหัสนับครั้งเดียว)';
  const amount = service
    ? 'จำนวนเงินคือผลรวม sum_price ของรายการรหัสนี้'
    : 'จำนวนเงินคือผลรวม sum_price ของทุกรายการ';
  const parts = [visits, amount, 'รายการไม่คิดเงินคือรายการที่ unitprice = 0'];
  if (year.noVnRows > 0) {
    parts.push(
      `ปีงบนี้มี ${formatNumber(year.noVnRows)} รายการที่ไม่มี VN จึงนับ Visit จาก HN + วันที่รับบริการแทน`,
    );
  }
  return parts.join(' · ');
}

const TOTAL_LABEL = 'รวมทุกบริการ';

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
  /** {@link TOTAL_KEY} or an icode; `null` while the modal is closed. */
  const [detail, setDetail] = useState<string | null>(null);

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
  // Services from both fetched fiscal years, so each year has the same keys.
  const services = useMemo(() => withVisuals(deriveServices(rows)), [rows]);

  const series = useMemo(
    () => buildFiscalSeries(rows, totals, services, fiscalYear, today),
    [rows, totals, services, fiscalYear, today],
  );
  const previousSeries = useMemo(
    () => buildFiscalSeries(rows, totals, services, fiscalYear - 1, today),
    [rows, totals, services, fiscalYear, today],
  );
  const yearSummary = useMemo(() => summarizeSeries(series), [series]);

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

  const selectService = useCallback((icode: string) => setDetail(icode), []);

  // --- Render flags -------------------------------------------------------

  const hasYearData = series.some((p) => p.total.itemRows > 0);
  const empty = !isLoading && !isError && data !== null && !hasYearData;
  const ready = !isLoading && !isError && data !== null && hasYearData;
  const canGoBack = options.includes(fiscalYear - 1);

  const totalDescription = `ทุกรหัสที่ตั้งรหัสมาตรฐาน TELMED (${formatNumber(services.length)} รหัส)`;
  const none = emptyMetrics();

  const cards = [
    {
      key: TOTAL_KEY,
      visual: TOTAL_VISUAL,
      featured: true,
      label: TOTAL_LABEL,
      description: totalDescription,
      now: current.total,
      before: previous.total,
    },
    ...services.map((s) => ({
      key: s.icode,
      visual: s.visual,
      featured: false,
      label: s.name,
      description: `รหัส ${s.icode}`,
      now: current.services[s.icode] ?? none,
      before: previous.services[s.icode] ?? none,
    })),
  ];

  const detailService = services.find((s) => s.icode === detail) ?? null;

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
                : 'ไม่พบรายการบริการ Telemedicine ในช่วงนี้'
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
                key={c.key}
                visual={c.visual}
                featured={c.featured}
                label={c.label}
                description={c.description}
                visits={c.now.visits}
                amount={c.now.amount}
                visitChange={percentChange(c.now.visits, c.before.visits)}
                amountChange={percentChange(c.now.amount, c.before.amount)}
                compareLabel={compareLabel}
                onClick={() => setDetail(c.key)}
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
              services={services}
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
            <MonthlyTable series={series} services={services} />
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
          selection={detailService ? detailService.icode : TOTAL_KEY}
          visual={detailService ? detailService.visual : TOTAL_VISUAL}
          title={detailService ? detailService.name : TOTAL_LABEL}
          description={detailService ? `รหัส ${detailService.icode}` : totalDescription}
          derivation={derivationFor(
            detailService,
            detailService ? (yearSummary.services[detailService.icode] ?? none) : yearSummary.total,
          )}
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
