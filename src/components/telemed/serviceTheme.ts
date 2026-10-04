// =============================================================================
// Telemedicine Dashboard - per-service icon and colour
//
// One place decides how each service looks, so cards, chart segments, table
// headers and modals can never drift apart.
//
// Services are read from the data, so a service's colour comes from its
// position in the icode-ordered service list. The eight categorical slots
// are a validated colour-blind-safe order (see `--svc-*` in index.css) and
// are never cycled: a ninth service and beyond share a neutral grey and fold
// into "อื่นๆ" in the stacked chart.
// =============================================================================

import { Activity, MonitorSmartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TelemedService } from '@/services/telemed';

export interface ServiceVisual {
  icon: LucideIcon;
  /** CSS colour, usable in SVG `fill` / `stroke`. */
  color: string;
  /** Tailwind classes for the soft icon tile. */
  tile: string;
  /** Tailwind class for a small legend dot. */
  dot: string;
}

export const TOTAL_VISUAL: ServiceVisual = {
  icon: Activity,
  color: 'hsl(var(--primary))',
  tile: 'bg-linear-to-br from-teal-500 to-sky-500 text-white shadow-[0_8px_20px_-8px_rgb(13_148_136/0.6)]',
  dot: 'bg-primary',
};

// Literal class names: Tailwind only generates classes it can read verbatim.
const SLOTS: readonly ServiceVisual[] = [
  { color: 'var(--svc-1)', tile: 'bg-svc-1/10 text-svc-1 ring-1 ring-svc-1/20', dot: 'bg-svc-1' },
  { color: 'var(--svc-2)', tile: 'bg-svc-2/10 text-svc-2 ring-1 ring-svc-2/20', dot: 'bg-svc-2' },
  { color: 'var(--svc-3)', tile: 'bg-svc-3/10 text-svc-3 ring-1 ring-svc-3/20', dot: 'bg-svc-3' },
  { color: 'var(--svc-4)', tile: 'bg-svc-4/10 text-svc-4 ring-1 ring-svc-4/20', dot: 'bg-svc-4' },
  { color: 'var(--svc-5)', tile: 'bg-svc-5/10 text-svc-5 ring-1 ring-svc-5/20', dot: 'bg-svc-5' },
  { color: 'var(--svc-6)', tile: 'bg-svc-6/10 text-svc-6 ring-1 ring-svc-6/20', dot: 'bg-svc-6' },
  { color: 'var(--svc-7)', tile: 'bg-svc-7/10 text-svc-7 ring-1 ring-svc-7/20', dot: 'bg-svc-7' },
  { color: 'var(--svc-8)', tile: 'bg-svc-8/10 text-svc-8 ring-1 ring-svc-8/20', dot: 'bg-svc-8' },
].map((slot) => ({ ...slot, icon: MonitorSmartphone }));

/** Shared by every service past the eighth. */
export const OTHER_VISUAL: ServiceVisual = {
  icon: MonitorSmartphone,
  color: 'var(--svc-other)',
  tile: 'bg-svc-other/10 text-svc-other ring-1 ring-svc-other/20',
  dot: 'bg-svc-other',
};

/** How many services get a colour of their own. */
export const SERVICE_SLOT_COUNT = SLOTS.length;

/** The visual of the service at `index` in the icode-ordered service list. */
export function serviceVisual(index: number): ServiceVisual {
  return SLOTS[index] ?? OTHER_VISUAL;
}

/** A service together with how it is drawn. */
export interface ServiceEntry extends TelemedService {
  visual: ServiceVisual;
}

/** Attach each service's visual by its position in the icode-ordered list. */
export function withVisuals(services: readonly TelemedService[]): ServiceEntry[] {
  return services.map((s, i) => ({ ...s, visual: serviceVisual(i) }));
}
