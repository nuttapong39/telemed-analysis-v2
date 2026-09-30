// =============================================================================
// Telemedicine Dashboard - hero illustration
//
// Inline SVG, so it stays crisp at any size and needs no asset pipeline: a
// phone on a video call with a doctor, an ECG card, a chat bubble with a
// medical cross, and a clinic tile joined by a dashed "connection" arc.
// Purely decorative — hidden from assistive tech.
// =============================================================================

import { useId } from 'react';

export function TelemedIllustration({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const glow = `tm-glow-${uid}`;
  const screen = `tm-screen-${uid}`;
  const shadow = `tm-shadow-${uid}`;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 230"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#99f6e4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#99f6e4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={screen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0fdfa" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </linearGradient>
        <filter id={shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* Ambient glow and soft blobs */}
      <circle cx="182" cy="118" r="112" fill={`url(#${glow})`} />
      <circle cx="312" cy="176" r="34" fill="#e0f2fe" opacity="0.7" />
      <circle cx="44" cy="188" r="22" fill="#e0e7ff" opacity="0.7" />

      {/* Connection arc between the chat bubble and the ECG card */}
      <path
        d="M78 44 C 118 -2, 252 -4, 292 58"
        stroke="#5eead4"
        strokeWidth="1.5"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />

      {/* Phone */}
      <g filter={`url(#${shadow})`}>
        <rect x="128" y="22" width="106" height="196" rx="20" fill="#ffffff" stroke="#e2e8f0" />
      </g>
      <rect x="136" y="36" width="90" height="154" rx="12" fill={`url(#${screen})`} />
      <rect x="166" y="28" width="30" height="4" rx="2" fill="#e2e8f0" />

      {/* Doctor on the call */}
      <path d="M150 170 C150 138 162 126 181 126 C200 126 212 138 212 170 Z" fill="#ffffff" stroke="#cbd5e1" />
      <path d="M173 127 L181 141 L189 127" stroke="#14b8a6" strokeWidth="2" strokeLinejoin="round" />
      <path d="M170 130 C163 146 166 156 175 158" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
      <circle cx="176" cy="159" r="3" fill="#0d9488" />
      <circle cx="181" cy="100" r="17" fill="#fde2cc" />
      <path d="M164 98 C164 84 174 79 182 79 C192 79 199 86 198 98 C193 91 184 89 176 91 C171 92 167 95 164 98 Z" fill="#334155" />
      <circle cx="175" cy="102" r="1.6" fill="#334155" />
      <circle cx="187" cy="102" r="1.6" fill="#334155" />
      <path d="M177 109 Q181 112 185 109" stroke="#c2410c" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />

      {/* Self-view thumbnail */}
      <rect x="200" y="44" width="20" height="27" rx="5" fill="#ffffff" stroke="#bae6fd" />
      <circle cx="210" cy="54" r="4" fill="#bae6fd" />
      <path d="M203 68 C203 62 206 60 210 60 C214 60 217 62 217 68 Z" fill="#bae6fd" />

      {/* Call controls */}
      <rect x="146" y="174" width="70" height="10" rx="5" fill="#ffffff" opacity="0.6" />
      <circle cx="161" cy="198" r="7.5" fill="#ffffff" stroke="#e2e8f0" />
      <circle cx="181" cy="198" r="7.5" fill="#f43f5e" />
      <path d="M177 199 Q181 195 185 199" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="201" cy="198" r="7.5" fill="#ffffff" stroke="#e2e8f0" />
      <rect x="159" y="194.5" width="4" height="6" rx="2" fill="#94a3b8" />
      <rect x="197.5" y="195.5" width="5.5" height="5" rx="1.2" fill="#94a3b8" />
      <path d="M203 198 L205.5 196.3 L205.5 199.7 Z" fill="#94a3b8" />

      {/* ECG card */}
      <g filter={`url(#${shadow})`}>
        <rect x="244" y="58" width="102" height="64" rx="14" fill="#ffffff" />
      </g>
      <circle cx="258" cy="73" r="3.5" fill="#14b8a6" />
      <rect x="266" y="70" width="38" height="6" rx="3" fill="#e2e8f0" />
      <path
        d="M254 102 H270 L276 88 L284 114 L290 94 L295 102 H336"
        stroke="#14b8a6"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Chat bubble with a medical cross */}
      <g filter={`url(#${shadow})`}>
        <path d="M22 38 H114 A14 14 0 0 1 128 52 V80 A14 14 0 0 1 114 94 H46 L32 106 V94 H36 A14 14 0 0 1 22 80 Z" fill="#ffffff" />
      </g>
      <circle cx="46" cy="66" r="13" fill="#e0f2fe" />
      <rect x="43.5" y="58.5" width="5" height="15" rx="1.5" fill="#0ea5e9" />
      <rect x="38.5" y="63.5" width="15" height="5" rx="1.5" fill="#0ea5e9" />
      <rect x="66" y="58" width="44" height="6" rx="3" fill="#e2e8f0" />
      <rect x="66" y="70" width="30" height="6" rx="3" fill="#f1f5f9" />

      {/* Clinic tile */}
      <g filter={`url(#${shadow})`}>
        <rect x="30" y="132" width="78" height="62" rx="14" fill="#ffffff" />
      </g>
      <path d="M52 176 V156 L69 146 L86 156 V176 Z" fill="#eef2ff" stroke="#818cf8" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="66.5" y="155" width="5" height="12" rx="1" fill="#818cf8" />
      <rect x="63" y="158.5" width="12" height="5" rx="1" fill="#818cf8" />
      <path d="M46 176 H92" stroke="#c7d2fe" strokeWidth="1.6" strokeLinecap="round" />

      {/* Sparkles */}
      <path d="M322 26 v10 M317 31 h10" stroke="#5eead4" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M112 118 v8 M108 122 h8" stroke="#a5b4fc" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M248 188 v8 M244 192 h8" stroke="#7dd3fc" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
