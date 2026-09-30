// =============================================================================
// Telemedicine Dashboard - single-page analytics
//
// Four sections over one fetched dataset:
//   1. Hero KPI row  - visits by service / total cost / top payer
//   2. Monthly trend - visits and cost, comparable across the selected range
//   3. Payer mix     - table with proportion bars and inline row expansion
//   4. Telehealth cost trend - icode 3002416 only
//
// One query per date range. Everything else - totals, series, deltas, modal
// contents, CSV - is derived client-side from those rows, so drilling in never
// refetches and never reloads the page.
// =============================================================================

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronRight,
  Coins,
  Download,
  HeartPulse,
  LineChart as LineChartIcon,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';

import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { useQuery } from '@/hooks/useQuery';
import { executeSqlViaApiQueued } from '@/services/bmsSession';
import {
  TELEHEALTH_ICODE,
  aggregateByMonth,
  aggregateByPttype,
  aggregateByServiceType,
  buildFetchWindow,
  buildTelemedParams,
  buildTelemedSql,
  distinctVisits,
  formatPatientLabel,
  normalizeTelemedRows,
  percentChange,
  shiftRange,
  toCsv,
  totalCost,
  totalVisits,
} from '@/services/telemed';
import type { MonthPoint, PttypePoint, TelemedRow } from '@/services/telemed';
import {
  ChangeBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  RangeFilter,
  SectionCard,
  SortableHeader,
  StatTile,
  resolvePreset,
  useTableSort,
} from '@/components/telemed/primitives';
import type { DateRange, RangePresetId } from '@/components/telemed/primitives';
import { DetailModal } from '@/components/telemed/DetailModal';
import type { DetailRecord } from '@/components/telemed/DetailModal';
import type { ConnectionConfig, SqlApiResponse } from '@/types';
import {
  NO_VALUE,
  downloadTextFile,
  formatBaht,
  formatNumber,
  formatPercent,
  formatThaiDate,
  formatThaiRange,
} from '@/utils/format';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PRESET: RangePresetId = '30d';
const RECENT_LIMIT = 20;
const EXPAND_LIMIT = 25;
const TREND_ITEM_HEIGHT = 288;

/** Which detail modal is open, if any. */
type DetailTarget =
  | { kind: 'visits' }
  | { kind: 'cost' }
  | { kind: 'top-pttype' }
  | { kind: 'month'; point: MonthPoint }
  | { kind: 'telehealth-cost' }
  | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Keep only rows whose `vstdate` falls inside `[start, end]` (inclusive). */
function withinRange(rows: readonly TelemedRow[], start: string, end: string): TelemedRow[] {
  return rows.filter((r) => r.vstdate >= start && r.vstdate <= end);
}

/** Newest first, used for every "recent records" list. */
function byNewest(a: TelemedRow, b: TelemedRow): number {
  const key = (r: TelemedRow) => `${r.vstdate} ${r.vsttime}`;
  return key(b).localeCompare(key(a));
}

/** Turn visits into modal rows. `vn` alone can repeat across services. */
function toRecords(rows: readonly TelemedRow[]): DetailRecord[] {
  return rows.slice(0, RECENT_LIMIT).map((r, i) => ({
    id: `rec-${i}`,
    primary: formatPatientLabel(r),
    secondary: [r.vn, r.serviceName, r.pttypeName].filter(Boolean).join(' · '),
    date: r.vstdate,
    time: r.vsttime,
    amount: r.sumPrice,
  }));
}

/** Narrow a Recharts click payload down to a month point. */
function pickMonth(entry: unknown): MonthPoint | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const payload = (entry as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as Partial<MonthPoint>;
  return typeof candidate.month === 'string' && typeof candidate.label === 'string'
    ? (candidate as MonthPoint)
    : null;
}

/** `2026-09` -> `2026-08`. */
function monthBefore(month: string): string {
  const [year, rawMonth] = month.split('-').map(Number);
  const m = rawMonth - 1;
  return m === 0 ? `${year - 1}-12` : `${year}-${String(m).padStart(2, '0')}`;
}

/** Turn a thrown error into an actionable Thai message. */
function errorMessage(error: Error | null): string {
  if (!error) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  if (/unauthorized|expired/i.test(error.message)) {
    return 'เซสชันหมดอายุ กรุณาเชื่อมต่อใหม่แล้วลองอีกครั้ง';
  }
  if (/timed out/i.test(error.message)) {
    return 'คำขอนานเกินไป กรุณาลองใหม่หรือเลือกช่วงวันที่ให้แคบลง';
  }
  if (/unable to connect/i.test(error.message)) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่';
  }
  return error.message;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TelemedDashboard() {
  const { connectionConfig, marketplaceToken } = useBmsSessionContext();

  const [preset, setPreset] = useState<RangePresetId>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(() => resolvePreset(DEFAULT_PRESET));
  const [expandedPttype, setExpandedPttype] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());

  // Resolve a preset whenever it changes. "Today" therefore means the day the
  // page was opened, not a date frozen at module load.
  useEffect(() => {
    setRange((prev) =>
      preset === 'custom' && prev.start !== '' ? prev : resolvePreset(preset),
    );
  }, [preset]);

  const hasRange = range.start !== '' && range.end !== '';

  // Previous, equal-length window for the period-over-period deltas.
  const previous = useMemo(
    () => (hasRange ? shiftRange(range.start, range.end) : null),
    [hasRange, range.start, range.end],
  );

  // One fetch window covering both the 12-month trend and the prior period.
  const fetchWindow = useMemo(() => {
    if (!hasRange || !previous) return null;
    const trend = buildFetchWindow(range.start, range.end);
    return {
      start: trend.fetchStart < previous.prevStart ? trend.fetchStart : previous.prevStart,
      end: trend.fetchEnd > previous.prevEnd ? trend.fetchEnd : previous.prevEnd,
    };
  }, [hasRange, previous, range.start, range.end]);

  const windowKey = fetchWindow ? `${fetchWindow.start}..${fetchWindow.end}` : '';

  const { data, error, isLoading, isError, execute, reset } = useQuery<TelemedRow[]>({
    queryFn: async () => {
      if (!connectionConfig || !fetchWindow) return [];
      const response: SqlApiResponse = await executeSqlViaApiQueued(
        buildTelemedSql(),
        connectionConfig,
        buildTelemedParams(fetchWindow.start, fetchWindow.end),
        marketplaceToken,
      );
      if (response.MessageCode !== 200) {
        throw new Error(response.Message || 'ไม่สามารถดึงข้อมูลได้');
      }
      return normalizeTelemedRows(response.data ?? []);
    },
  });

  useEffect(() => {
    if (!connectionConfig || !windowKey) return;
    void execute();
  }, [connectionConfig, windowKey, execute]);

  const allRows = useMemo(() => data ?? [], [data]);

  // --- Derived views (all client-side, no refetch) -------------------------

  const rangeRows = useMemo(
    () => (hasRange ? withinRange(allRows, range.start, range.end) : []),
    [allRows, hasRange, range.start, range.end],
  );
  const prevRows = useMemo(
    () => (previous ? withinRange(allRows, previous.prevStart, previous.prevEnd) : []),
    [allRows, previous],
  );

  const trend = useMemo(() => aggregateByMonth(allRows), [allRows]);
  const telehealthTrend = useMemo(
    () => aggregateByMonth(allRows, (r) => r.icode === TELEHEALTH_ICODE),
    [allRows],
  );

  const visits = useMemo(() => totalVisits(rangeRows), [rangeRows]);
  const cost = useMemo(() => totalCost(rangeRows), [rangeRows]);
  const visitsByService = useMemo(() => aggregateByServiceType(rangeRows), [rangeRows]);
  const pttypeRows = useMemo(() => aggregateByPttype(rangeRows), [rangeRows]);
  const patientCount = useMemo(
    () => new Set(rangeRows.map((r) => r.hn)).size,
    [rangeRows],
  );

  const prevVisits = useMemo(() => totalVisits(prevRows), [prevRows]);
  const prevCost = useMemo(() => totalCost(prevRows), [prevRows]);

  const topPttype = pttypeRows[0] ?? null;
  const prevTopPttypeVisits = useMemo(() => {
    if (!topPttype) return 0;
    return (
      aggregateByPttype(prevRows).find((p) => p.pttypeName === topPttype.pttypeName)
        ?.visits ?? 0
    );
  }, [prevRows, topPttype]);

  const visitChange = percentChange(visits, prevVisits);
  const costChange = percentChange(cost, prevCost);

  // Telehealth cost inside the selected range only.
  const telehealthCostInRange = useMemo(
    () =>
      telehealthTrend
        .filter((p) => p.month >= range.start.slice(0, 7) && p.month <= range.end.slice(0, 7))
        .reduce((sum, p) => sum + p.cost, 0),
    [telehealthTrend, range.start, range.end],
  );

  // --- Sorting for the payer table ----------------------------------------

  const sort = useTableSort<'pttypeName' | 'visits' | 'percent'>('visits');
  const { sort: sortState, toggle: toggleSort, apply: applySort } = sort;

  const sortedPttype = useMemo(
    () =>
      applySort(pttypeRows, {
        pttypeName: (r: PttypePoint) => r.pttypeName,
        visits: (r: PttypePoint) => r.visits,
        percent: (r: PttypePoint) => r.percent,
      }),
    [pttypeRows, applySort, sortState],
  );

  // Expanded row contents, keyed off the open payer.
  const expandedVisits = useMemo(() => {
    if (!expandedPttype) return [];
    return distinctVisits(
      rangeRows.filter((r) => r.pttypeName === expandedPttype),
    ).sort(byNewest);
  }, [expandedPttype, rangeRows]);

  // --- CSV ----------------------------------------------------------------

  const exportRows = useCallback(
    (rows: readonly TelemedRow[], name: string) => {
      downloadTextFile(`telemed-${name}-${range.start}_${range.end}.csv`, toCsv(rows));
    },
    [range.start, range.end],
  );

  const resetFilter = useCallback(() => {
    setPreset(DEFAULT_PRESET);
    setDetail(null);
    setExpandedPttype(null);
  }, []);

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const refresh = useCallback(() => {
    reset();
    void execute();
  }, [reset, execute]);

  // --- Render flags -------------------------------------------------------

  const failed = isError;
  const loading = isLoading;
  const empty = !loading && !failed && hasRange && visits === 0;
  const rangeLabel = hasRange ? formatThaiRange(range.start, range.end) : '';

  const visitsRecords = useMemo(
    () => toRecords(distinctVisits(rangeRows).sort(byNewest)),
    [rangeRows],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      {/* Header ------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Telemed Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ภาพรวมบริการ Telemedicine · 3 รหัสบริการ (3002416, 3002487, 3002488)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <RangeFilter
            preset={preset}
            range={range}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            title="ดึงข้อมูลใหม่"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={() => exportRows(rangeRows, 'all')}
            disabled={rangeRows.length === 0}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </header>

      {/* Status ------------------------------------------------------------ */}
      {failed && (
        <SectionCard title="เกิดข้อผิดพลาด" pattern="waves">
          <ErrorState message={errorMessage(error)} onRetry={refresh} />
        </SectionCard>
      )}

      {loading && (
        <SectionCard title="กำลังโหลดข้อมูล" pattern="waves">
          <LoadingState />
        </SectionCard>
      )}

      {empty && (
        <SectionCard title="ไม่พบข้อมูล" pattern="dots">
          <EmptyState
            title="ไม่พบบริการ Telemedicine ในช่วงที่เลือก"
            message={`ช่วง ${rangeLabel} ไม่มีรายการบริการ Telemed เลย`}
            hint="ลองขยายช่วงวันที่ หรือเลือก «ปีนี้» เพื่อดูภาพรวมที่กว้างขึ้น"
            onReset={resetFilter}
          />
        </SectionCard>
      )}

      {/* Content ----------------------------------------------------------- */}
      {!failed && !loading && !empty && (
        <>
          {/* 1. Hero ------------------------------------------------------ */}
          <SectionCard
            title="ภาพรวมช่วงที่เลือก"
            description={rangeLabel}
            icon={<Video className="h-4 w-4" />}
            pattern="pulse"
          >
            <div className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {/* Visits by service */}
              <StatTile
                label="จำนวน Visit ทั้งหมด"
                value={formatNumber(visits)}
                unit="visit"
                icon={<Users className="h-3.5 w-3.5" />}
                onClick={() => setDetail({ kind: 'visits' })}
                sub={
                  <div className="space-y-2">
                    <ChangeBadge change={visitChange} />
                    <ul className="space-y-1 pt-1">
                      {visitsByService.map((s) => (
                        <li
                          key={s.icode}
                          className="flex items-baseline justify-between gap-3 text-xs"
                        >
                          <span className="truncate">{s.serviceName}</span>
                          <span className="shrink-0 tabular-nums">
                            {formatNumber(s.visits)} · {formatPercent(s.percent)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                }
              />

              {/* Total cost */}
              <StatTile
                label="ยอดค่ารวม"
                value={formatNumber(cost)}
                unit="บาท"
                icon={<Coins className="h-3.5 w-3.5" />}
                onClick={() => setDetail({ kind: 'cost' })}
                sub={<ChangeBadge change={costChange} />}
              />

              {/* Top payer */}
              <StatTile
                label="สิทธิที่ใช้มากที่สุด"
                value={topPttype ? topPttype.pttypeName : NO_VALUE}
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                onClick={() => setDetail({ kind: 'top-pttype' })}
                sub={
                  topPttype ? (
                    <span className="tabular-nums">
                      {formatNumber(topPttype.visits)} visit ·{' '}
                      {formatPercent(topPttype.percent)} ของทั้งหมด
                    </span>
                  ) : (
                    <span>ไม่มีข้อมูล</span>
                  )
                }
              />
            </div>

            <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              ตัวเลขทั้งหมดนับ <span className="font-medium">visit ที่ไม่ซ้ำ</span> (VN)
              ไม่ใช่จำนวนรายการยา · คลิกการ์ดเพื่อดูที่มาและรายละเอียด
            </p>
          </SectionCard>

          {/* 2. Monthly trend -------------------------------------------- */}
          <SectionCard
            title="แนวโน้มรายเดือน"
            description="จำนวน visit และยอดค่ารวม แยกตามเดือน · คลิกแท่งเพื่อดูรายละเอียดเดือนนั้น"
            icon={<TrendingUp className="h-4 w-4" />}
            pattern="grid"
            aside={
              <div className="flex items-center gap-1">
                {(
                  [
                    { key: 'visits', label: 'จำนวน visit', dot: 'bg-chart-1' },
                    { key: 'cost', label: 'ยอดเงิน', dot: 'bg-chart-2' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSeries(s.key)}
                    aria-pressed={!hiddenSeries.has(s.key)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      hiddenSeries.has(s.key)
                        ? 'border-border text-muted-foreground/60'
                        : 'border-border text-foreground'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${s.dot} ${
                        hiddenSeries.has(s.key) ? 'opacity-30' : ''
                      }`}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
            }
          >
            {trend.length === 0 ? (
              <EmptyState
                title="ยังไม่มีข้อมูลรายเดือน"
                message="ไม่พบรายการในช่วง 12 เดือนที่ผ่านมา"
              />
            ) : (
              <div className="w-full" style={{ height: TREND_ITEM_HEIGHT }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="visits"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v: number) => formatNumber(v)}
                    />
                    <YAxis
                      yAxisId="cost"
                      orientation="right"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => `${formatNumber(v / 1000)}k`}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid hsl(var(--border))',
                        fontSize: 12,
                      }}
                      formatter={(value, name) =>
                        name === 'cost'
                          ? [formatBaht(Number(value)), 'ยอดเงิน']
                          : [formatNumber(Number(value)), 'จำนวน visit']
                      }
                    />
                    {!hiddenSeries.has('visits') && (
                      <Bar
                        yAxisId="visits"
                        dataKey="visits"
                        fill="hsl(var(--chart-1))"
                        fillOpacity={0.65}
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(entry: unknown) => {
                          const point = pickMonth(entry);
                          if (point) setDetail({ kind: 'month', point });
                        }}
                      />
                    )}
                    {!hiddenSeries.has('cost') && (
                      <Line
                        yAxisId="cost"
                        type="monotone"
                        dataKey="cost"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {/* 3 + 4. Payer mix and telehealth cost ------------------------- */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Payer mix */}
            <SectionCard
              title="สัดส่วนตามสิทธิการรักษา"
              description="เรียงจากมากไปน้อย · คลิกแถวเพื่อกางรายชื่อ visit"
              icon={<ShieldCheck className="h-4 w-4" />}
              pattern="dots"
              aside={
                <button
                  type="button"
                  onClick={() => exportRows(rangeRows, 'pttype')}
                  className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  CSV
                </button>
              }
            >
              {pttypeRows.length === 0 ? (
                <EmptyState title="ไม่มีข้อมูลสิทธิ" message="ไม่พบรายการในช่วงที่เลือก" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border/60 text-xs">
                      <tr>
                        <SortableHeader
                          label="สิทธิการรักษา"
                          columnKey="pttypeName"
                          sort={sortState}
                          onToggle={toggleSort}
                          align="left"
                        />
                        <SortableHeader
                          label="Visit"
                          columnKey="visits"
                          sort={sortState}
                          onToggle={toggleSort}
                        />
                        <SortableHeader
                          label="สัดส่วน"
                          columnKey="percent"
                          sort={sortState}
                          onToggle={toggleSort}
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {sortedPttype.map((row) => {
                        const isOpen = expandedPttype === row.pttypeName;

                        return (
                          <Fragment key={row.pttypeName}>
                            <tr
                              onClick={() => setExpandedPttype(isOpen ? null : row.pttypeName)}
                              className="cursor-pointer transition-colors hover:bg-muted/40"
                            >
                              <td className="px-4 py-2.5">
                                <span className="flex items-center gap-1.5">
                                  <ChevronRight
                                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                                      isOpen ? 'rotate-90' : ''
                                    }`}
                                  />
                                  <span className="truncate">{row.pttypeName}</span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {formatNumber(row.visits)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                {formatPercent(row.percent)}
                              </td>
                            </tr>

                            <tr>
                              <td colSpan={3} className="px-4 pb-3 pt-0">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full bg-primary/45"
                                    style={{ width: `${Math.min(100, row.percent)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>

                            {isOpen && (
                              <tr>
                                <td colSpan={3} className="bg-muted/20 px-4 py-3">
                                  <ul className="space-y-1.5">
                                    {expandedVisits.slice(0, EXPAND_LIMIT).map((v, i) => (
                                      <li
                                        key={`${v.vn}-${i}`}
                                        className="flex items-baseline justify-between gap-3 text-xs"
                                      >
                                        <span className="truncate">
                                          {formatPatientLabel(v)}
                                          <span className="ml-1.5 text-muted-foreground">
                                            {v.serviceName}
                                          </span>
                                        </span>
                                        <span className="shrink-0 tabular-nums text-muted-foreground">
                                          {formatThaiDate(v.vstdate)} · {formatBaht(v.sumPrice)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                  {expandedVisits.length > EXPAND_LIMIT && (
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      แสดง {EXPAND_LIMIT} จาก{' '}
                                      {formatNumber(expandedVisits.length)} รายการ ·
                                      ดาวน์โหลด CSV เพื่อดูทั้งหมด
                                    </p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Telehealth cost trend */}
            <SectionCard
              title="แนวโน้มค่ารักษา Telehealth"
              description="เฉพาะรหัสบริการ 3002416 · คลิกแท่งเพื่อดูรายละเอียด"
              icon={<LineChartIcon className="h-4 w-4" />}
              pattern="waves"
              onClick={() => setDetail({ kind: 'telehealth-cost' })}
            >
              {telehealthTrend.length === 0 ? (
                <EmptyState
                  title="ไม่มีข้อมูลค่าใช้จ่าย"
                  message="ไม่พบรายการของบริการ 3002416 ในช่วง 12 เดือนที่ผ่านมา"
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={telehealthTrend}
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                        tickFormatter={(v: number) => `${formatNumber(v / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid hsl(var(--border))',
                          fontSize: 12,
                        }}
                        formatter={(value) => [formatBaht(Number(value)), 'ยอดเงิน']}
                      />
                      <Bar
                        dataKey="cost"
                        fill="hsl(var(--chart-3))"
                        fillOpacity={0.5}
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(entry: unknown) => {
                          const point = pickMonth(entry);
                          if (point) setDetail({ kind: 'month', point });
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        stroke="hsl(var(--chart-3))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className="mt-3 text-xs text-muted-foreground">
                ยอดรวมบริการนี้ในช่วงที่เลือก:{' '}
                <span className="font-medium text-foreground">
                  {formatBaht(telehealthCostInRange)}
                </span>
              </p>
            </SectionCard>
          </div>

          {/* Footer note -------------------------------------------------- */}
          <p className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
            <HeartPulse className="h-3.5 w-3.5" />
            ข้อมูลอ่านอย่างเดียวจาก HOSxP · ชื่อผู้ป่วยและ HN แสดงตามที่บันทึกในฐานข้อมูล
          </p>
        </>
      )}

      {/* Modals ------------------------------------------------------------ */}

      {/* Visits */}
      <DetailModal
        open={detail?.kind === 'visits'}
        onOpenChange={(open) => !open && setDetail(null)}
        title="จำนวน Visit ทั้งหมด — ที่มาและรายละเอียด"
        derivation="นับ VN ที่ไม่ซ้ำจาก opitemrece ที่มี icode ตรงกับ 3 รหัสบริการ Telemedicine ภายในช่วงวันที่ที่เลือก ถ้า VN เดียวมีหลายรายการจะนับเป็น 1 visit"
        headline={formatNumber(visits)}
        headlineUnit="visit"
        headlineSub={
          <span>
            {rangeLabel} · ผู้ป่วยไม่ซ้ำ {formatNumber(patientCount)} ราย
          </span>
        }
        trend={trend}
        trendMetric="visits"
        comparisons={[
          { label: 'Visit ช่วงนี้', current: visits, previous: prevVisits },
          { label: 'ยอดเงินช่วงนี้', current: cost, previous: prevCost, format: formatBaht },
        ]}
        records={visitsRecords}
        onExportCsv={() => exportRows(rangeRows, 'visits')}
        onResetFilter={resetFilter}
      >
        {visitsByService.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              แยกตามประเภทบริการ
            </h3>
            <ul className="space-y-2.5">
              {visitsByService.map((s) => (
                <li key={s.icode}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">
                      {s.serviceName}
                      <span className="ml-1.5 text-xs text-muted-foreground">({s.icode})</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatNumber(s.visits)} · {formatPercent(s.percent)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/45"
                      style={{ width: `${Math.min(100, s.percent)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DetailModal>

      {/* Cost */}
      <DetailModal
        open={detail?.kind === 'cost'}
        onOpenChange={(open) => !open && setDetail(null)}
        title="ยอดค่ารวม — ที่มาและรายละเอียด"
        derivation="ผลรวมของ sum_price ทุกรายการ (opitemrece) ของ 3 รหัสบริการ Telemedicine ในช่วงวันที่ที่เลือก"
        headline={formatNumber(cost)}
        headlineUnit="บาท"
        headlineSub={
          <span>เฉลี่ย {formatBaht(visits > 0 ? cost / visits : 0)} ต่อ visit</span>
        }
        trend={trend}
        trendMetric="cost"
        comparisons={[
          { label: 'ยอดเงินช่วงนี้', current: cost, previous: prevCost, format: formatBaht },
          { label: 'Visit ช่วงนี้', current: visits, previous: prevVisits },
        ]}
        records={toRecords(rangeRows.filter((r) => r.sumPrice > 0).sort(byNewest))}
        onExportCsv={() => exportRows(rangeRows, 'cost')}
        onResetFilter={resetFilter}
      >
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">ยอดเงินแยกตามสิทธิ</h3>
          <ul className="space-y-2.5">
            {pttypeRows.slice(0, 8).map((p) => (
              <li key={p.pttypeName}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{p.pttypeName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatBaht(p.cost)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/45"
                    style={{ width: `${Math.min(100, p.percent)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </DetailModal>

      {/* Top payer */}
      <DetailModal
        open={detail?.kind === 'top-pttype'}
        onOpenChange={(open) => !open && setDetail(null)}
        title="สิทธิที่ใช้มากที่สุด — ที่มาและรายละเอียด"
        derivation="นับจำนวน visit แยกตามสิทธิการรักษา (pttype) แล้วเรียงจากมากไปน้อย ตัวเลขที่แสดงคือสิทธิอันดับหนึ่งและสัดส่วนเทียบกับ visit ทั้งหมด"
        headline={topPttype ? topPttype.pttypeName : NO_VALUE}
        headlineSub={
          topPttype ? (
            <span>
              {formatNumber(topPttype.visits)} visit · {formatPercent(topPttype.percent)}{' '}
              ของทั้งหมด
            </span>
          ) : undefined
        }
        trend={trend}
        comparisons={
          topPttype
            ? [
                {
                  label: `${topPttype.pttypeName} ช่วงนี้`,
                  current: topPttype.visits,
                  previous: prevTopPttypeVisits,
                },
              ]
            : undefined
        }
        records={
          topPttype
            ? toRecords(
                distinctVisits(
                  rangeRows.filter((r) => r.pttypeName === topPttype.pttypeName),
                ).sort(byNewest),
              )
            : undefined
        }
        onExportCsv={() => exportRows(rangeRows, 'pttype')}
        onResetFilter={resetFilter}
      >
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            สิทธิทั้งหมดในช่วงนี้
          </h3>
          <ul className="space-y-2.5">
            {pttypeRows.map((p) => (
              <li key={p.pttypeName}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{p.pttypeName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatNumber(p.visits)} · {formatPercent(p.percent)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/45"
                    style={{ width: `${Math.min(100, p.percent)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </DetailModal>

      {/* Month */}
      <DetailModal
        open={detail?.kind === 'month'}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detail?.kind === 'month' ? `เดือน ${detail.point.label}` : 'รายละเอียดเดือน'}
        derivation="ข้อมูลของเดือนที่คลิก แยกจากรายการทั้งหมดที่ดึงมาแล้ว (ไม่มีการดึงข้อมูลใหม่)"
        headline={detail?.kind === 'month' ? formatNumber(detail.point.visits) : NO_VALUE}
        headlineUnit="visit"
        headlineSub={
          detail?.kind === 'month' ? (
            <span>ยอดเงิน {formatBaht(detail.point.cost)}</span>
          ) : undefined
        }
        trend={trend}
        comparisons={
          detail?.kind === 'month'
            ? [
                {
                  label: 'Visit เดือนนี้',
                  current: detail.point.visits,
                  previous:
                    trend.find((p) => p.month === monthBefore(detail.point.month))?.visits ?? 0,
                },
              ]
            : undefined
        }
        records={
          detail?.kind === 'month'
            ? toRecords(
                distinctVisits(
                  rangeRows.filter((r) => r.vstdate.slice(0, 7) === detail.point.month),
                ).sort(byNewest),
              )
            : undefined
        }
        onExportCsv={() => {
          if (detail?.kind !== 'month') return;
          exportRows(
            rangeRows.filter((r) => r.vstdate.slice(0, 7) === detail.point.month),
            `month-${detail.point.month}`,
          );
        }}
        onResetFilter={resetFilter}
      />

      {/* Telehealth cost */}
      <DetailModal
        open={detail?.kind === 'telehealth-cost'}
        onOpenChange={(open) => !open && setDetail(null)}
        title="ค่ารักษา Telehealth (3002416) — ที่มาและรายละเอียด"
        derivation="ผลรวม sum_price เฉพาะรายการที่ icode = 3002416 เท่านั้น ใช้ดูแนวโน้มค่าใช้จ่ายของบริการนี้โดยเฉพาะ"
        headline={formatBaht(telehealthTrend.reduce((sum, p) => sum + p.cost, 0))}
        headlineSub={<span>รวม 12 เดือนที่ดึงมา</span>}
        trend={telehealthTrend}
        trendMetric="cost"
        onExportCsv={() =>
          exportRows(
            rangeRows.filter((r) => r.icode === TELEHEALTH_ICODE),
            'telehealth-cost',
          )
        }
        onResetFilter={resetFilter}
      />
    </div>
  );
}

/** Re-exported for the page's own preset resolution. */
export type { ConnectionConfig };
