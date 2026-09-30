// =============================================================================
// Session Validator - Authentication State Handler
// =============================================================================

import type { ReactNode } from 'react';
import { useBmsSessionContext } from '@/contexts/BmsSessionContext';
import { LoginForm } from './LoginForm';
import { SessionExpired } from './SessionExpired';
import {
  Activity,
  Database,
} from 'lucide-react';

interface SessionValidatorProps {
  children: ReactNode;
}

export function SessionValidator({ children }: SessionValidatorProps) {
  const { sessionState, error, connectSession } = useBmsSessionContext();

  if (sessionState === 'connecting') {
    return (
      <div className="connecting-page">
        <div className="connecting-bg-pattern" />
        <div className="connecting-content">
          <div className="connecting-icon">
            <Activity className="h-8 w-8" />
          </div>
          <div className="connecting-spinner">
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="spinner-ring" />
          </div>
          <h1>กำลังเชื่อมต่อ</h1>
          <p>ยืนยันตัวตนกับ BMS Session API...</p>
          <div className="connecting-status">
            <Database className="h-3.5 w-3.5" />
            <span>Initializing secure connection</span>
          </div>
        </div>

        <style>{`
          .connecting-page {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            overflow: hidden;
          }

          .connecting-bg-pattern {
            position: absolute;
            inset: 0;
            opacity: 0.03;
            background-image:
              radial-gradient(circle at 1px 1px, white 1px, transparent 0);
            background-size: 32px 32px;
            pointer-events: none;
          }

          .connecting-content {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .connecting-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 4rem;
            height: 4rem;
            margin-bottom: 2rem;
            background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
            border-radius: 1rem;
            color: white;
            box-shadow: 0 4px 16px -2px rgba(99, 102, 241, 0.4);
          }

          .connecting-spinner {
            position: relative;
            width: 64px;
            height: 64px;
            margin-bottom: 1.5rem;
          }

          .spinner-ring {
            position: absolute;
            inset: 0;
            border: 2px solid transparent;
            border-top-color: #60a5fa;
            border-radius: 50%;
            animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
          }

          .spinner-ring:nth-child(1) {
            animation-delay: -0.45s;
          }

          .spinner-ring:nth-child(2) {
            inset: 6px;
            border-top-color: #a78bfa;
            animation-delay: -0.3s;
          }

          .spinner-ring:nth-child(3) {
            inset: 12px;
            border-top-color: #f472b6;
            animation-delay: -0.15s;
          }

          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }

          .connecting-content h1 {
            font-family: 'Fraunces', serif;
            font-size: 1.5rem;
            font-weight: 600;
            color: white;
            margin: 0 0 0.5rem 0;
          }

          .connecting-content p {
            font-size: 0.875rem;
            color: rgba(255, 255, 255, 0.5);
            margin: 0;
          }

          .connecting-status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 2rem;
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 2rem;
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.4);
          }
        `}</style>
      </div>
    );
  }

  if (sessionState === 'expired') {
    return (
      <SessionExpired
        onReconnect={connectSession}
        error={error}
        isConnecting={false}
      />
    );
  }

  if (sessionState === 'disconnected' || sessionState === 'idle') {
    return (
      <LoginForm
        onConnect={connectSession}
        error={error}
        isConnecting={false}
      />
    );
  }

  return <>{children}</>;
}
