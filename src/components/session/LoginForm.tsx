// =============================================================================
// Login Form - connect with a BMS Session ID
// =============================================================================

import { useState } from 'react';
import { ArrowRight, HelpCircle, KeyRound } from 'lucide-react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import { AuthError, AuthShell, SessionIdField, SubmitButton } from './AuthShell';

interface LoginFormProps {
  onConnect: (sessionId: string) => Promise<boolean>;
  error?: Error | null;
  isConnecting: boolean;
}

export function LoginForm({ onConnect, error, isConnecting }: LoginFormProps) {
  const [sessionId, setSessionId] = useState(import.meta.env.BMS_SESSION_ID || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sessionId.trim();
    if (!trimmed) return;
    await onConnect(trimmed);
  };

  return (
    <AuthShell>
      <div className="surface p-6 sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-primary">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">เชื่อมต่อเซสชัน</h1>
        <p className="mt-1 text-sm text-muted-foreground">ป้อนรหัสเซสชัน BMS เพื่อเริ่มใช้งาน</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <SessionIdField
            id="session-id"
            label="รหัสเซสชัน BMS"
            value={sessionId}
            onChange={setSessionId}
            disabled={isConnecting}
            hint="รหัสเซสชันอยู่ใน URL ของระบบ HOSxP หรือติดต่อผู้ดูแลระบบ"
          />

          {error && <AuthError title="การเชื่อมต่อล้มเหลว" message={error.message} />}

          <SubmitButton disabled={isConnecting || !sessionId.trim()}>
            {isConnecting ? (
              <>
                <LoadingSpinner size="sm" />
                กำลังเชื่อมต่อ...
              </>
            ) : (
              <>
                เชื่อมต่อ
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </SubmitButton>
        </form>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        ต้องการความช่วยเหลือ?
        <a
          href="https://hosxp.net"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          ติดต่อฝ่ายสนับสนุน
        </a>
      </p>
    </AuthShell>
  );
}
