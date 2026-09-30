// =============================================================================
// Telemed Analytics - App Header
// Frosted white bar: brand on the left, session status and user on the right.
// =============================================================================

import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { Database, LogOut } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';

export function AppHeader() {
  const { session, disconnectSession } = useBmsSessionContext();

  const databaseLabel = session?.databaseType === 'postgresql' ? 'PostgreSQL' : 'MySQL';
  const userInitial = session?.userInfo.name?.charAt(0).toUpperCase() ?? '?';

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand ----------------------------------------------------------- */}
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              Telemed Analytics
            </p>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              ระบบวิเคราะห์บริการ Telemedicine
            </p>
          </div>
        </div>

        {/* Session --------------------------------------------------------- */}
        {session && (
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50/80 px-2.5 py-1 text-xs font-medium text-emerald-700 md:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              เชื่อมต่อแล้ว
            </span>

            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-white/80 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:inline-flex">
              <Database className="h-3 w-3" aria-hidden="true" />
              {databaseLabel}
            </span>

            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-white/80 py-1 pl-1 pr-1 sm:pr-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-linear-to-br from-teal-500 to-sky-500 text-xs font-semibold text-white">
                {userInitial}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-40 truncate text-xs font-medium text-foreground">
                  {session.userInfo.name}
                </span>
                <span className="block max-w-40 truncate text-[10px] text-muted-foreground">
                  {session.userInfo.department}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={disconnectSession}
              title="ออกจากระบบ"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">ออกจากระบบ</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
