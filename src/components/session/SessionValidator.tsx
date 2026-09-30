// =============================================================================
// Session Validator - Authentication State Handler
// =============================================================================

import type { ReactNode } from 'react';
import { Database } from 'lucide-react';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { BrandMark } from '@/components/brand/BrandMark';
import { LoginForm } from './LoginForm';
import { SessionExpired } from './SessionExpired';

interface SessionValidatorProps {
  children: ReactNode;
}

export function SessionValidator({ children }: SessionValidatorProps) {
  const { sessionState, error, connectSession } = useBmsSessionContext();

  if (sessionState === 'connecting') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" role="status">
        <div className="flex flex-col items-center text-center">
          <span className="relative grid place-items-center">
            <span
              aria-hidden="true"
              className="absolute h-24 w-24 animate-ping rounded-full bg-teal-200/40 [animation-duration:2s]"
            />
            <span
              aria-hidden="true"
              className="absolute h-20 w-20 rounded-full border-2 border-teal-100 border-t-primary animate-spin"
            />
            <BrandMark size="lg" />
          </span>
          <h1 className="mt-10 text-xl font-semibold tracking-tight text-foreground">กำลังเชื่อมต่อ</h1>
          <p className="mt-1 text-sm text-muted-foreground">ยืนยันตัวตนกับ BMS Session API...</p>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-white/80 px-3 py-1 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            กำลังตรวจสอบฐานข้อมูลโรงพยาบาล
          </span>
        </div>
      </div>
    );
  }

  if (sessionState === 'expired') {
    return <SessionExpired onReconnect={connectSession} error={error} isConnecting={false} />;
  }

  if (sessionState === 'disconnected' || sessionState === 'idle') {
    return <LoginForm onConnect={connectSession} error={error} isConnecting={false} />;
  }

  return <>{children}</>;
}
