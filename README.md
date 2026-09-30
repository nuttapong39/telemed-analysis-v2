# BMS Session ID — Blank Dashboard Template

Blank starter template for building hospital dashboards with **HOSxP** data via BMS Session API. Clone this repo, pick a dashboard template from the overview page, and let AI generate a full dashboard automatically.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?bms-session-id=YOUR_SESSION_ID`

### Docker

```bash
docker compose up -d
```

Open `http://localhost:3080/?bms-session-id=YOUR_SESSION_ID`

## How It Works

1. User arrives with `?bms-session-id=GUID` in the URL
2. App retrieves session config from `https://hosxp.net/phapi/PasteJSON`
3. App probes local API gateway at `http://127.0.0.1:45011` — uses it if available (faster), falls back to remote tunnel
4. Auto-detects database type (MySQL/PostgreSQL) via `SELECT VERSION()`
5. Overview page shows 18 dashboard templates grouped by department
6. User picks a template, edits the prompt if needed, copies it, and pastes into an AI chat to generate the dashboard

### Session Input Methods

| Method | Description |
|--------|-------------|
| URL parameter | `?bms-session-id=GUID` — saved to cookie, removed from URL |
| Cookie | Persisted for 7 days, auto-reconnects on next visit |
| Manual input | Login form for pasting a session ID |

### Local API Detection

When connecting, the app automatically checks if the HOSxP API gateway is running locally on port 45011. If reachable, all API calls use `http://127.0.0.1:45011` instead of the remote `*.tunnel.hosxp.net` endpoint. This eliminates tunnel latency for users running the gateway on the same machine.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript 5.x (strict mode) |
| Build | Vite 6 |
| UI | shadcn/ui + Tailwind CSS v4 |
| Tables | TanStack Table v8 |
| Charts | Recharts 3.x |
| Testing | Vitest + React Testing Library + MSW |
| Date | date-fns |
| MCP | vite-plugin-mcp (dev tools for AI coding assistants) |

## Dashboard Templates (21)

Templates are grouped by hospital department on the overview page:

| Group | Templates |
|-------|-----------|
| **Patient Services** | OPD, IPD, Appointments, ER, OPD Screening (Nurse), Doctor Workbench, Refer |
| **Clinical Support** | Lab, Radiology, Pharmacy, Dental, Operating Room |
| **Community Health (PCU)** | Population, NCD Screening, ANC/Labor (Acc.2), MCH (Acc.3), EPI/Vaccine (Acc.4), School Health (Acc.5), Family Planning (Acc.6) |
| **Administration** | Finance/Revenue, Medical Records |

Each template generates a prompt with specific KPIs, chart types, and data points based on HOSxP knowledge base.

## Project Structure

```
src/
  services/
    bmsSession.ts        # Session retrieval, SQL execution, local API probe
    apiQueue.ts          # Concurrency control, deduplication, retry on 429
    queryBuilder.ts      # MySQL/PostgreSQL SQL generation
  hooks/
    useBmsSession.ts     # Session state management
    useQuery.ts          # Async query lifecycle (loading/error/success)
  contexts/
    BmsSessionContext.tsx # Session provider, auto-connect from URL/cookie
  components/
    ui/                  # shadcn/ui primitives (button, card, dialog, etc.)
    layout/              # AppHeader, AppLayout, LoadingSpinner
    session/             # LoginForm, SessionExpired, SessionValidator
  pages/
    Overview.tsx         # Main page with grouped dashboard templates
  types/
    index.ts             # TypeScript interfaces
  utils/
    sessionStorage.ts    # Cookie CRUD, URL parameter handling
    dateUtils.ts         # Date formatting helpers
tests/
  unit/                  # Service and utility tests
  component/             # React component tests
  integration/           # Cross-module flow tests
  api/                   # BMS Session API contract tests
```

## API Request Queue

All SQL queries go through `executeSqlViaApiQueued()` which provides:

- **Concurrency limiting** — max 3 concurrent API calls
- **Request deduplication** — identical concurrent queries share the same result
- **Automatic retry** — exponential backoff on HTTP 429 (rate limit)
- **Queue cleanup** — pending requests cancelled on disconnect

## Development

```bash
npm run dev              # Start dev server (port 5173)
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:coverage    # Coverage report (80% threshold)
npm run lint             # ESLint
npm run build            # Production build
```

### MCP Dev Tools

This project includes `vite-plugin-mcp` which exposes an MCP server at `http://localhost:5173/__mcp/sse` during development. AI coding assistants (Claude Code, Cursor, etc.) can connect to it for Vite config and module graph information. The `.mcp.json` file is auto-configured when the dev server starts.

## BMS Session API Reference

- **Session retrieval**: `GET https://hosxp.net/phapi/PasteJSON?Action=GET&code={sessionId}`
- **SQL execution**: `POST {bms_url}/api/sql` with `Authorization: Bearer {token}`
- **Allowed SQL**: SELECT, DESCRIBE, EXPLAIN, SHOW, WITH (read-only)
- **Blocked tables**: opduser, opdconfig, sys_var, user_var, user_jwt (max 20 tables per query)

See [docs/BMS-SESSION-FOR-DEV.md](docs/BMS-SESSION-FOR-DEV.md) for the full API specification.

## Database Support

The query builder auto-generates SQL for the detected database:

| Function | MySQL | PostgreSQL |
|----------|-------|------------|
| Current date | `CURDATE()` | `CURRENT_DATE` |
| Date format | `DATE_FORMAT(col, '%Y-%m')` | `TO_CHAR(col, 'YYYY-MM')` |
| Date subtract | `DATE_SUB(CURDATE(), INTERVAL 30 DAY)` | `CURRENT_DATE - INTERVAL '30 days'` |
| Age calc | `TIMESTAMPDIFF(YEAR, bday, CURDATE())` | `EXTRACT(YEAR FROM AGE(bday))` |
| Hour extract | `HOUR(col)` | `EXTRACT(HOUR FROM col)::int` |
| Cast to text | `CAST(col AS CHAR)` | `col::text` |

## License

Private — BMS (Bangkok Medical Software)
