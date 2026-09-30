// =============================================================================
// Telemed Analytics - App Layout
// Header over the page. The white-to-smoke gradient lives on <body>, so the
// layout itself stays transparent.
// =============================================================================

import type { ReactNode } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
