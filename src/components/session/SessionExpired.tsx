// =============================================================================
// Session Expired - Professional Reconnection Page
// =============================================================================

import { useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';

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
    <div className="expired-page">
      {/* Background Pattern */}
      <div className="expired-bg-pattern" />

      <div className="expired-container">
        {/* Alert Icon */}
        <div className="expired-icon">
          <AlertTriangle className="h-8 w-8" />
        </div>

        {/* Header */}
        <div className="expired-header">
          <h1>เซสชันหมดอายุ</h1>
          <p>
            เซสชัน BMS ของคุณหมดอายุแล้ว
            <br />
            กรุณาป้อนรหัสเซสชันใหม่เพื่อเชื่อมต่อต่อ
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="expired-form">
          <div className="form-group">
            <label htmlFor="session-id" className="form-label">
              รหัสเซสชันใหม่
            </label>
            <div className="input-wrapper">
              <KeyRound className="input-icon" />
              <input
                id="session-id"
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="02FA45D1-91EF-4D6E-B341-ED1436343807"
                disabled={isConnecting}
                autoComplete="off"
                className="form-input"
              />
            </div>
          </div>

          {error && (
            <div className="error-alert">
              <p>{error.message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isConnecting || !sessionId.trim()}
            className="submit-button"
          >
            {isConnecting ? (
              <span className="submit-loading">
                <LoadingSpinner size="sm" />
                <span>กำลังเชื่อมต่อ...</span>
              </span>
            ) : (
              <span className="submit-content">
                <RefreshCw className="h-4 w-4" />
                <span>เชื่อมต่อใหม่</span>
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </button>
        </form>

        {/* Footer Hint */}
        <p className="expired-hint">
          รหัสเซสชันอยู่ใน URL ของระบบ HOSxP หรือติดต่อผู้ดูแลระบบ
        </p>
      </div>

      <style>{`
        .expired-page {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          overflow: hidden;
        }

        .expired-bg-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.03;
          background-image:
            radial-gradient(circle at 1px 1px, white 1px, transparent 0);
          background-size: 32px 32px;
          pointer-events: none;
        }

        .expired-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 400px;
          padding: 2.5rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 1.5rem;
          backdrop-filter: blur(12px);
        }

        .expired-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 4rem;
          height: 4rem;
          margin: 0 auto 1.5rem;
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 1rem;
          color: #fbbf24;
        }

        .expired-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .expired-header h1 {
          font-family: 'Fraunces', serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: white;
          margin: 0 0 0.75rem 0;
        }

        .expired-header p {
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0;
          line-height: 1.6;
        }

        .expired-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.8);
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.3);
          width: 1.125rem;
          height: 1.125rem;
          pointer-events: none;
        }

        .form-input {
          width: 100%;
          padding: 0.875rem 1rem 0.875rem 2.75rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 0.875rem;
          color: white;
          transition: all 0.2s ease;
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.25);
          font-family: 'IBM Plex Sans', sans-serif;
        }

        .form-input:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }

        .form-input:focus {
          outline: none;
          border-color: rgba(96, 165, 250, 0.5);
          background: rgba(255, 255, 255, 0.08);
        }

        .form-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-alert {
          padding: 0.875rem 1rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 0.5rem;
        }

        .error-alert p {
          font-size: 0.8125rem;
          color: #fca5a5;
          margin: 0;
        }

        .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.875rem 1.5rem;
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
          border: none;
          border-radius: 0.75rem;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 0.9375rem;
          font-weight: 600;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px -2px rgba(99, 102, 241, 0.4);
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px -2px rgba(99, 102, 241, 0.5);
        }

        .submit-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .submit-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .submit-loading {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .expired-hint {
          text-align: center;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.3);
          margin: 1.5rem 0 0 0;
        }

        @media (max-width: 480px) {
          .expired-container {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
