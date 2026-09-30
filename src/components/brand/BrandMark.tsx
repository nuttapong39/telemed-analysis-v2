// =============================================================================
// Brand mark - the Telemed Analytics logo tile
//
// A teal-to-sky tile holding a phone with a heartbeat trace. Shared by the
// header, the session screens and (as a static copy) the favicon.
// =============================================================================

import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-9 w-9 rounded-xl',
  md: 'h-11 w-11 rounded-2xl',
  lg: 'h-14 w-14 rounded-2xl',
} as const;

export function BrandMark({
  size = 'sm',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center bg-linear-to-br from-teal-500 to-sky-500 text-white',
        'shadow-[0_8px_20px_-8px_rgb(13_148_136/0.65)]',
        SIZES[size],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[58%] w-[58%]">
        <rect x="6" y="2.5" width="12" height="19" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M8 12.5h2l1.2-2.6 1.8 5 1.2-2.4H16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}
