// =============================================================================
// Session Expired - reconnect with a fresh BMS Session ID
// =============================================================================

import { useState } from 'react';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { AuthError, AuthShell, SessionIdField, SubmitButton } from './AuthShell';

interface SessionExpiredProps {
  onReconnect: (sessionId: string) => Promise<boolean>;
  error?: Error | null;
  isConnecting: boolean;
}

export function SessionExpired({ onReconnect, error, isConnecting }: SessionExpiredProps) {
  const [sessionId, setSessionId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sessionId.trim();
    if (!trimmed) return;
    await onReconnect(trimmed);
  };

  return (
    <AuthShell>
      <div className="surface p-6 sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">เซสชันหมดอายุ</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          เซสชัน BMS ของคุณหมดอายุแล้ว กรุณาป้อนรหัสเซสชันใหม่เพื่อเชื่อมต่อต่อ
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <SessionIdField
            id="session-id"
            label="รหัสเซสชันใหม่"
            value={sessionId}
            onChange={setSessionId}
            disabled={isConnecting}
            hint="รหัสเซสชันอยู่ใน URL ของระบบ HOSxP หรือติดต่อผู้ดูแลระบบ"
          />

          {error && <AuthError title="เชื่อมต่อใหม่ไม่สำเร็จ" message={error.message} />}

          <SubmitButton disabled={isConnecting || !sessionId.trim()}>
            {isConnecting ? (
              <>
                <LoadingSpinner size="sm" />
                กำลังเชื่อมต่อ...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                เชื่อมต่อใหม่
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
