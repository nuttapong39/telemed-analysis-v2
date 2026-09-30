// =============================================================================
// BMS Session KPI Dashboard - App Layout
// Top-level layout wrapper with refined spacing and background
// =============================================================================

import type { ReactNode } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <AppHeader />
      <main className="app-main">{children}</main>
      <style>{`
        .app-layout {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background:
            linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.3) 100%);
        }

        .app-main {
          flex: 1;
          padding: 2rem 1.5rem;
        }

        @media (min-width: 768px) {
          .app-main {
            padding: 2.5rem 2rem;
          }
        }

        @media (min-width: 1280px) {
          .app-main {
            padding: 3rem 3rem;
          }
        }
      `}</style>
    </div>
  );
}
