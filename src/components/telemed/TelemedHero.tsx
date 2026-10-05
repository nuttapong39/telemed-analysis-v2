// =============================================================================
// Telemedicine Dashboard - hero banner
//
// Page heading, the fiscal year being viewed and a telemedicine illustration.
// The only surface that carries a background pattern (a faint ECG trace).
// The illustration is hidden on phones so the figures reach the top sooner.
// =============================================================================

import { useId } from 'react';
import { Stethoscope } from 'lucide-react';
import { TelemedIllustration } from '@/components/telemed/TelemedIllustration';
import { fiscalYearRange } from '@/services/telemed';
import { formatThaiDate } from '@/utils/format';

export function TelemedHero({ fiscalYear }: { fiscalYear: number }) {
  const { start, end } = fiscalYearRange(fiscalYear);
  const pattern = `hero-ecg-${useId().replace(/:/g, '')}`;

  return (
    <section className="surface animate-rise-in relative isolate overflow-hidden bg-linear-to-br from-white via-white to-teal-50/60">
      {/* Faint ECG trace behind the text */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-primary">
        <defs>
          <pattern id={pattern} width="160" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M0 50 H48 L56 30 L66 66 L74 40 L80 50 H160"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.07"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${pattern})`} />
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-sky-200/30 blur-3xl"
      />

      <div className="grid items-center gap-6 px-6 py-7 sm:grid-cols-[1fr_auto] sm:px-8 sm:py-8">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-white/80 px-3 py-1 text-xs font-medium text-teal-700 backdrop-blur">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
            Telemedicine · HOSxP
          </span>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            ภาพรวมบริการ Telemedicine
          </h1>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-medium text-primary">ปีงบประมาณ {fiscalYear}</span>
            <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
            <span>
              {formatThaiDate(start)} – {formatThaiDate(end)}
            </span>
          </p>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            ติดตามจำนวน Visit และยอดเงินรายเดือนของทุกบริการที่ตั้งรหัสมาตรฐาน TELMED
            เทียบกับปีงบประมาณก่อนหน้า
          </p>
        </div>

        <TelemedIllustration className="hidden h-auto w-[300px] sm:block lg:w-[340px]" />
      </div>
    </section>
  );
}
