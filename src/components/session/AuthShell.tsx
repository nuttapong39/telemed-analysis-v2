// =============================================================================
// Auth shell - shared frame for the login and session-expired screens
//
// Left (desktop only): brand, the telemedicine illustration and what the
// dashboard offers. Right: a white card holding the form passed in as children.
// =============================================================================

import type { ReactNode } from 'react';
import { CalendarRange, MonitorSmartphone, TableProperties } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { TelemedIllustration } from '@/components/telemed/TelemedIllustration';
import { cn } from '@/lib/utils';

const HIGHLIGHTS = [
  {
    icon: MonitorSmartphone,
    title: 'ทุกรหัส TELMED',
    description: 'อ่านจากรหัสมาตรฐาน สปสช.',
    tile: 'bg-teal-50 text-teal-600 ring-1 ring-teal-100',
  },
  {
    icon: CalendarRange,
    title: 'ตามปีงบประมาณ',
    description: 'เทียบกับปีงบก่อนหน้า',
    tile: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
  },
  {
    icon: TableProperties,
    title: 'ค้นหา · ส่งออก',
    description: 'ตารางรายละเอียดและ CSV',
    tile: 'bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100',
  },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel ------------------------------------------------------- */}
      <aside className="relative hidden overflow-hidden border-r border-border/60 bg-linear-to-br from-white via-teal-50/40 to-sky-50/60 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-teal-200/30 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <BrandMark size="md" />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight text-foreground">Telemed Analytics</p>
            <p className="text-xs text-muted-foreground">ระบบวิเคราะห์บริการ Telemedicine</p>
          </div>
        </div>

        <div className="relative">
          <TelemedIllustration className="mx-auto h-auto w-full max-w-md" />
          <h2 className="mt-8 text-3xl font-semibold leading-snug tracking-tight text-foreground">
            ดูภาพรวมบริการทางไกล
            <br />
            <span className="bg-linear-to-r from-teal-600 to-sky-500 bg-clip-text text-transparent">
              ครบทุกช่องทางในที่เดียว
            </span>
          </h2>
        </div>

        <ul className="relative grid grid-cols-3 gap-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, description, tile }) => (
            <li key={title} className="surface p-3.5">
              <span className={cn('grid h-9 w-9 place-items-center rounded-xl', tile)}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-2.5 text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs leading-snug text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </aside>

      {/* Form panel -------------------------------------------------------- */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size="md" />
            <p className="text-lg font-semibold tracking-tight text-foreground">Telemed Analytics</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Rounded error callout used by both session forms. */
export function AuthError({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3">
      <p className="text-sm font-semibold text-rose-700">{title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-rose-700/80">{message}</p>
    </div>
  );
}

/** Session-id input, labelled and monospaced. */
export function SessionIdField({
  id,
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="02FA45D1-91EF-4D6E-B341-ED1436343807"
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-border bg-white px-4 py-3 font-mono text-sm text-foreground shadow-[0_1px_2px_rgb(15_23_42/0.04)] outline-none transition placeholder:font-sans placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Full-width primary submit button. */
export function SubmitButton({
  disabled,
  children,
}: {
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-linear-to-r from-teal-600 to-teal-500 px-5 py-3 text-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_rgb(13_148_136/0.7)] transition hover:-translate-y-px hover:shadow-[0_12px_24px_-10px_rgb(13_148_136/0.7)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {children}
    </button>
  );
}
