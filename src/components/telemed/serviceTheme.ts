// =============================================================================
// Telemedicine Dashboard - per-service icon and colour
//
// One place decides how each service looks, so cards, chart segments, table
// headers and modals can never drift apart.
// =============================================================================

import { Activity, Hospital, PhoneCall, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ServiceKey } from '@/services/telemed';

export type ServiceTone = ServiceKey | 'total';

export interface ServiceVisual {
  icon: LucideIcon;
  /** CSS colour, usable in SVG `fill` / `stroke`. */
  color: string;
  /** Tailwind classes for the soft icon tile. */
  tile: string;
  /** Tailwind class for a small legend dot. */
  dot: string;
}

export const SERVICE_VISUALS: Record<ServiceTone, ServiceVisual> = {
  total: {
    icon: Activity,
    color: 'hsl(var(--primary))',
    tile: 'bg-linear-to-br from-teal-500 to-sky-500 text-white shadow-[0_8px_20px_-8px_rgb(13_148_136/0.6)]',
    dot: 'bg-primary',
  },
  b2b: {
    icon: Hospital,
    color: 'hsl(var(--svc-b2b))',
    tile: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    dot: 'bg-svc-b2b',
  },
  b2c: {
    icon: Video,
    color: 'hsl(var(--svc-b2c))',
    tile: 'bg-indigo-50 text-indigo-500 ring-1 ring-indigo-100',
    dot: 'bg-svc-b2c',
  },
  telehealth: {
    icon: PhoneCall,
    color: 'hsl(var(--svc-telehealth))',
    tile: 'bg-teal-50 text-teal-600 ring-1 ring-teal-100',
    dot: 'bg-svc-telehealth',
  },
};
