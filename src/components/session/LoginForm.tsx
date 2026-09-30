// =============================================================================
// Login Form - Professional Hospital Dashboard Authentication
// Split-screen design with branding and clean form
// =============================================================================

import { useState } from 'react';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import {
  Activity,
  Database,
  Shield,
  Zap,
  ArrowRight,
  KeyRound,
  HelpCircle,
} from 'lucide-react';

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
    <div className="login-page">
      {/* Left Panel - Branding */}
      <div className="login-branding">
        <div className="branding-content">
          {/* Logo & Title */}
          <div className="branding-header">
            <div className="branding-icon">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="branding-title">BMS Dashboard</h1>
              <p className="branding-subtitle">Hospital Intelligence Platform</p>
            </div>
          </div>

          {/* Tagline */}
          <div className="branding-tagline">
            <h2>
              วิเคราะห์ข้อมูลโรงพยาบาล
              <br />
              <span className="text-gradient">ด้วยพลัง AI</span>
            </h2>
          </div>

          {/* Features */}
          <div className="branding-features">
            <div className="feature-item">
              <div className="feature-icon">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h3>เชื่อมต่อ HOSxP</h3>
                <p>เข้าถึงข้อมูลแบบ Real-time จากฐานข้อมูลโรงพยาบาล</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h3>AI-Powered Dashboard</h3>
                <p>สร้าง Dashboard อัตโนมัติด้วย Natural Language</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h3>Secure Access</h3>
                <p>การเข้าถึงที่ปลอดภัยผ่าน BMS Session ID</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="branding-footer">
            <span>Powered by BMS Session API</span>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="branding-glow branding-glow-1" />
        <div className="branding-glow branding-glow-2" />
        <div className="branding-pattern" />
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-form-panel">
        <div className="login-form-container">
          <div className="login-form-header">
            <div className="login-form-icon">
              <KeyRound className="h-5 w-5" />
            </div>
            <h2>เชื่อมต่อเซสชัน</h2>
            <p>ป้อนรหัสเซสชัน BMS เพื่อเริ่มใช้งาน</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="session-id" className="form-label">
                รหัสเซสชัน BMS
              </label>
              <div className="input-wrapper">
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
              <p className="form-hint">
                รหัสเซสชันอยู่ใน URL ของระบบ HOSxP หรือติดต่อผู้ดูแลระบบ
              </p>
            </div>

            {error && (
              <div className="error-alert">
                <div className="error-icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="error-content">
                  <p className="error-title">การเชื่อมต่อล้มเหลว</p>
                  <p className="error-message">{error.message}</p>
                </div>
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
                  <span>เชื่อมต่อ</span>
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </form>

          <div className="login-help">
            <HelpCircle className="h-4 w-4" />
            <span>
              ต้องการความช่วยเหลือ?{' '}
              <a
                href="https://hosxp.net"
                target="_blank"
                rel="noopener noreferrer"
                className="help-link"
              >
                ติดต่อฝ่ายสนับสนุน
              </a>
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .login-page {
          display: flex;
          min-height: 100vh;
        }

        /* Left Panel - Branding */
        .login-branding {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
          padding: 3rem;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          overflow: hidden;
        }

        .branding-content {
          position: relative;
          z-index: 1;
          max-width: 480px;
        }

        .branding-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 3rem;
        }

        .branding-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 3rem;
          height: 3rem;
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
          border-radius: 0.75rem;
          color: white;
          box-shadow: 0 4px 12px -2px rgba(99, 102, 241, 0.4);
        }

        .branding-title {
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .branding-subtitle {
          font-size: 0.8125rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0.25rem 0 0 0;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .branding-tagline {
          margin-bottom: 3rem;
        }

        .branding-tagline h2 {
          font-family: 'Fraunces', serif;
          font-size: 2.5rem;
          font-weight: 700;
          color: white;
          line-height: 1.2;
          margin: 0;
        }

        .branding-tagline .text-gradient {
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .branding-features {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin-bottom: 3rem;
        }

        .feature-item {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 0.75rem;
          transition: all 0.3s ease;
        }

        .feature-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .feature-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          background: linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(167, 139, 250, 0.2) 100%);
          border-radius: 0.5rem;
          color: #a78bfa;
        }

        .feature-item h3 {
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 0.9375rem;
          font-weight: 600;
          color: white;
          margin: 0 0 0.25rem 0;
        }

        .feature-item p {
          font-size: 0.8125rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0;
          line-height: 1.5;
        }

        .branding-footer {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.3);
        }

        /* Decorative glows */
        .branding-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          pointer-events: none;
        }

        .branding-glow-1 {
          top: 10%;
          right: 20%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(96, 165, 250, 0.5) 0%, transparent 70%);
        }

        .branding-glow-2 {
          bottom: 20%;
          left: 10%;
          width: 250px;
          height: 250px;
          background: radial-gradient(circle, rgba(167, 139, 250, 0.4) 0%, transparent 70%);
        }

        .branding-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.03;
          background-image:
            radial-gradient(circle at 1px 1px, white 1px, transparent 0);
          background-size: 40px 40px;
          pointer-events: none;
        }

        /* Right Panel - Form */
        .login-form-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 480px;
          padding: 3rem;
          background: hsl(var(--background));
        }

        .login-form-container {
          width: 100%;
          max-width: 360px;
        }

        .login-form-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .login-form-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 3.5rem;
          height: 3.5rem;
          background: linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%);
          border: 1px solid hsl(var(--primary) / 0.2);
          border-radius: 1rem;
          color: hsl(var(--primary));
          margin-bottom: 1.25rem;
        }

        .login-form-header h2 {
          font-family: 'Fraunces', serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin: 0 0 0.5rem 0;
        }

        .login-form-header p {
          font-size: 0.875rem;
          color: hsl(var(--muted-foreground));
          margin: 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: hsl(var(--foreground));
        }

        .input-wrapper {
          position: relative;
        }

        .form-input {
          width: 100%;
          padding: 0.875rem 1rem;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          border-radius: 0.75rem;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 0.875rem;
          color: hsl(var(--foreground));
          transition: all 0.2s ease;
        }

        .form-input::placeholder {
          color: hsl(var(--muted-foreground) / 0.5);
          font-family: 'IBM Plex Sans', sans-serif;
        }

        .form-input:hover {
          border-color: hsl(var(--border));
        }

        .form-input:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
        }

        .form-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-hint {
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground));
          margin: 0;
        }

        .error-alert {
          display: flex;
          gap: 0.75rem;
          padding: 1rem;
          background: hsl(var(--destructive) / 0.05);
          border: 1px solid hsl(var(--destructive) / 0.2);
          border-radius: 0.75rem;
        }

        .error-icon {
          flex-shrink: 0;
          color: hsl(var(--destructive));
        }

        .error-icon svg {
          width: 1.25rem;
          height: 1.25rem;
        }

        .error-content {
          flex: 1;
        }

        .error-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: hsl(var(--destructive));
          margin: 0 0 0.25rem 0;
        }

        .error-message {
          font-size: 0.8125rem;
          color: hsl(var(--destructive) / 0.8);
          margin: 0;
          line-height: 1.5;
        }

        .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
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

        .login-help {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 2rem;
          font-size: 0.8125rem;
          color: hsl(var(--muted-foreground));
        }

        .help-link {
          color: hsl(var(--primary));
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s ease;
        }

        .help-link:hover {
          text-decoration: underline;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .login-branding {
            display: none;
          }

          .login-form-panel {
            flex: 1;
          }
        }

        @media (max-width: 480px) {
          .login-form-panel {
            padding: 2rem 1.5rem;
          }

          .branding-tagline h2 {
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
}
