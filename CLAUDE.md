# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BMS Session Demo Dashboard — a React/TypeScript web application that displays hospital statistics and patient data from HOSxP hospital management systems. The app uses BMS Session IDs for authentication and executes read-only SQL queries against hospital databases (MySQL, MariaDB, PostgreSQL).

## Key Documentation

- `docs/BMS-SESSION-FOR-DEV.md` — Complete BMS Session API specification (v3.0): session flow, `/api/sql`, `/api/rest` CRUD, `/api/function` endpoints, field type codes, database compatibility, HOSxP table reference, example queries
- `.specify/memory/constitution.md` — Project constitution (v1.0.0): 9 mandatory development principles

## Architecture

### Session Flow

1. User arrives with `?bms-session-id=GUID` in URL (or from cookie/manual input)
2. Optional `?marketplace_token=...` URL parameter is also captured at the same time
3. App calls `https://hosxp.net/phapi/PasteJSON?Action=GET&code=SESSION_ID` to retrieve session data
4. Session response provides: `bms_url` (API endpoint), `bms_session_code` (JWT Bearer token), user info, database info
5. Read queries go to `{bms_url}/api/sql` with Bearer token auth
6. Only SELECT, DESCRIBE, EXPLAIN, SHOW, WITH statements allowed on `/api/sql` (read-only)
7. Optional: `/api/rest/{table}[/{id}]` for config-driven CRUD (writes need a marketplace token), `/api/function` for built-in server functions (e.g., `get_serialnumber`, `get_hosvariable`)

### Marketplace Token Handling

- Capture `marketplace_token` from the URL alongside `bms-session-id` (use the same extract → cookie store → URL clean flow as the session ID)
- Persist it client-side (cookie / context) for the lifetime of the session
- **If a marketplace token is present, it MUST be added to the JSON payload of every `/api/sql` and `/api/rest` request as the key `marketplace-token`** (e.g. `{ "sql": "...", "app": "...", "marketplace-token": "mkt_xxxxx" }` or merged into REST POST/PUT bodies; for REST GET, append `&marketplace-token=...` to the query string)
- If no token is present, omit the key entirely — `/api/sql` and `/api/rest` GET still work with JWT alone
- Without the token, `/api/rest` write operations (POST/PUT/DELETE) will return `403 Forbidden`

### Planned Source Structure

```
src/
├── services/bmsSession.ts       # Core: retrieveBmsSession(), executeSqlViaApi(), extractConnectionConfig()
├── hooks/useBmsSession.ts       # useBmsSession() hook, useQuery() hook
├── contexts/BmsSessionContext.tsx  # BmsSessionProvider, useBmsSessionContext()
├── utils/sessionStorage.ts      # Cookie CRUD, URL param extraction
├── components/                  # Reusable UI components
├── pages/                       # Page-level components
└── types/                       # TypeScript interfaces

tests/
├── unit/          # Service and utility function tests
├── component/     # React component tests (React Testing Library)
├── integration/   # Cross-module flow tests
└── api/           # BMS Session API contract tests
```

### Key Architectural Rules

- **Business logic in services only** — components handle rendering and interaction, delegate everything else to `src/services/`
- **Session management centralized** in `bmsSession.ts`, exposed via context/hooks
- **SQL queries MUST use parameterized inputs** (`:param_name` syntax) to prevent injection
- **No hardcoded values** — API URLs, config, and query parameters must be dynamic (retrieved from session response)

## BMS Session API Quick Reference

**Session retrieval**: GET `https://hosxp.net/phapi/PasteJSON?Action=GET&code={sessionId}`

**Endpoints** (all use `Authorization: Bearer {bms_session_code}`):

| Endpoint | Methods | Purpose | Notes |
|----------|---------|---------|-------|
| `/api/sql` | GET, POST | Raw read-only SQL | SELECT/DESCRIBE/EXPLAIN/SHOW/WITH only |
| `/api/rest/{table}[/{id}]` | GET, POST, PUT, DELETE | Config-driven CRUD on 110 tables | Writes require marketplace token |
| `/api/function?name={fn}` | POST | Built-in server functions | e.g. `get_serialnumber`, `get_hosvariable` |

**SQL execution** (with parameter binding):
```json
POST {bms_url}/api/sql
{
  "sql": "SELECT COUNT(*) as total FROM patient WHERE birthday = :bd",
  "app": "BMS.Dashboard.React",
  "params": { "bd": { "value": "2024-01-01", "value_type": "date" } }
}
```
Param types: `string`, `integer`, `float`, `date`, `time`, `datetime`.

**REST example**:
```
GET /api/rest/ovst?select=vn,vstdate,patient(pname,fname,lname),doctor(name)&vstdate=gte.2024-06-01&order=vstdate.desc&limit=100
```
Filter operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `is`. Joins via `select=...,table(cols)` or `expand(all)`; prefix `!table(...)` for inner join.

**Function example** — generate a unique PK before INSERT (HOSxP tables don't use AUTO_INCREMENT):
```json
POST {bms_url}/api/function?name=get_serialnumber
{ "serial_name": "vn", "table_name": "ovst", "field_name": "vn" }
```

**Response shape** (`/api/sql`, `/api/rest` GET): `{ MessageCode, Message, data: [{...}] | {...}, field: [int], field_name: [string], record_count }`. Function responses use `{ MessageCode, Message, Value }`.

**Field type codes**: 1=Boolean, 2=Integer, 3=Float, 4=DateTime, 5=Time, 6=String, 7=Blob, 9=String

**Blacklisted tables** (`/api/sql`): opduser, opdconfig, sys_var, user_var, user_jwt (max 20 tables per query, no dots in table names)

**Permission model** (`/api/rest`): JWT alone → GET only; marketplace token READONLY → GET on granted tables; READWRITE → full CRUD on granted tables. Pass token via `?marketplace-token=...` or in JSON body.

**PostgreSQL**: Use single quotes for string literals (double quotes = identifiers)

## Development Standards (Constitution v1.0.0)

- **TDD is non-negotiable**: write test → confirm fails → implement → confirm passes → refactor
- **Four test layers required**: unit (80% coverage min), component, integration, API contract
- **TypeScript strict mode** — no `any` without justification
- **Run `npx tsc -b` after every code change** — typecheck must pass before committing and before pushing; fix errors rather than bypassing
- **Commit after every meaningful change** with descriptive prefix (feat/fix/test/refactor/docs)
- **Reuse over duplication** — extract shared logic into hooks, utils, shared components
- **Informative UX** — every operation needs loading state, actionable error messages, progress for multi-step flows, guidance for empty states
- **Performance** — API timeouts (30s session, 60s query), LIMIT clauses on SQL, lazy loading for non-critical routes

## Speckit Workflow

This project uses the speckit system for structured development:
- `/speckit.specify` — Create feature specifications
- `/speckit.plan` — Create implementation plans
- `/speckit.tasks` — Generate task lists from plans
- `/speckit.implement` — Execute implementation
- `/speckit.clarify` — Clarify ambiguous requirements
- `/speckit.analyze` — Cross-artifact consistency analysis

## Active Technologies
- TypeScript 5.x (strict mode) + React 19 + Vite 6, Recharts 3.x, shadcn/ui, Tailwind CSS v4, TanStack Table v8, date-fns (001-bms-kpi-dashboard)
- N/A (all data from BMS Session API; session cookie stored client-side) (001-bms-kpi-dashboard)

## Recent Changes
- 001-bms-kpi-dashboard: Added TypeScript 5.x (strict mode) + React 19 + Vite 6, Recharts 3.x, shadcn/ui, Tailwind CSS v4, TanStack Table v8, date-fns
