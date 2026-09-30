<!--
=== Sync Impact Report ===
Version change: N/A → 1.0.0 (initial creation)

Added principles:
  - I. Code Quality First
  - II. Test-Driven Development (NON-NEGOTIABLE)
  - III. Comprehensive Test Coverage
  - IV. Reusable Components & Functions
  - V. Centralized Business Logic
  - VI. Informative User Experience
  - VII. Performance & Reliability
  - VIII. Version Control Discipline
  - IX. Skill-Driven Development

Added sections:
  - Testing Standards
  - Development Workflow
  - Governance

Removed sections: None (initial creation)

Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ No changes needed
    (Constitution Check section already references constitution gates)
  - .specify/templates/spec-template.md — ✅ No changes needed
    (Success criteria and acceptance scenarios align with testing principles)
  - .specify/templates/tasks-template.md — ✅ No changes needed
    (Test-first task ordering and commit-per-task already reflected)

Follow-up TODOs: None
=== End Sync Impact Report ===
-->

# BMS Session Demo Dashboard Constitution

## Core Principles

### I. Code Quality First

- All code MUST pass linting and type-checking before commit
- TypeScript strict mode MUST be enabled; `any` type MUST NOT be
  used without written justification in comments
- No hardcoded values for configuration, API endpoints, or query
  parameters — all MUST be dynamic and configurable
- Dead code, unused imports, and commented-out code MUST be removed
- Functions MUST have a single responsibility; files MUST NOT exceed
  400 lines without architectural justification
- All public APIs and complex logic MUST have clear naming that
  eliminates the need for comments; add comments only where the
  logic is not self-evident

### II. Test-Driven Development (NON-NEGOTIABLE)

- TDD cycle MUST be followed: write test → confirm test fails →
  implement → confirm test passes → refactor
- Red-Green-Refactor is strictly enforced for all new features
  and bug fixes
- Tests MUST be written and approved BEFORE implementation begins
- No feature or fix is considered complete until all associated
  tests pass
- Test failures MUST be investigated to root cause — never
  suppressed, mocked away, or bypassed with exceptions
- When multiple tests fail, review logs carefully to identify the
  true root cause before fixing

### III. Comprehensive Test Coverage

All features MUST be validated across four test layers:

- **Unit Tests**: Every function, utility, and service method MUST
  have unit tests covering happy path, edge cases, and error
  conditions. Minimum 80% code coverage for new code
- **Component Tests**: Every React component MUST have rendering
  tests, interaction tests, and state-change tests. Use React
  Testing Library; test behavior, not implementation
- **Integration Tests**: Cross-module interactions MUST be validated
  — session flow, API call chains, context provider integration,
  and hook composition
- **API Tests**: Every API endpoint interaction MUST have contract
  tests validating request format, response parsing, error
  handling, and authentication flow against the BMS Session API

Test files MUST be co-located with source or in a mirrored
`tests/` directory. Tests MUST produce detailed debug logs:
network calls, console output, UI states, and error traces.

### IV. Reusable Components & Functions

- MUST NOT duplicate code — extract shared logic into reusable
  components, hooks, or utility functions
- React components MUST be composable with clear props interfaces
- Custom hooks MUST encapsulate complex state logic and be
  independently testable
- Utility functions MUST be pure, stateless, and placed in
  dedicated modules under `src/utils/` or `src/lib/`
- Common UI patterns (loading states, error displays, data cards)
  MUST use shared components, not be re-implemented per feature

### V. Centralized Business Logic

- Business logic MUST reside in the service layer (`src/services/`)
  — never in UI components, event handlers, or API route files
- UI components MUST only handle rendering and user interaction;
  they delegate all data processing to services or hooks
- Data transformation, validation, and computation MUST be in
  dedicated service modules that are independently testable
- Session management logic MUST remain centralized in
  `src/services/bmsSession.ts` and exposed through context/hooks
- SQL query construction MUST be centralized in service functions
  with parameterized inputs to prevent SQL injection

### VI. Informative User Experience

- Every user-facing operation MUST provide visual feedback: loading
  spinners, progress bars, or status messages
- Error messages MUST be actionable — clearly state what went
  wrong and what the user can do about it
- Multi-step operations MUST show progress indication (step counts,
  percentages, or descriptive status text)
- Session state changes (connecting, connected, expired,
  disconnected) MUST be communicated clearly to the user
- Query execution MUST show loading state, result count, and
  execution time
- Network failures MUST display user-friendly messages with retry
  options, not raw error codes or stack traces
- Empty states MUST provide guidance (e.g., "No data for selected
  period. Try expanding the date range.")

### VII. Performance & Reliability

- API calls MUST implement timeout handling (30s default for
  session, 60s for queries) with graceful degradation
- SQL queries MUST use LIMIT clauses and aggregate functions to
  minimize data transfer
- React components MUST avoid unnecessary re-renders — use
  `React.memo`, `useMemo`, and `useCallback` where measurable
  improvement exists
- Bundle size MUST be monitored; lazy loading MUST be used for
  non-critical routes and heavy components
- Session validation MUST happen before any API call; expired
  sessions MUST trigger re-authentication flow automatically
- Database queries MUST use parameterized inputs to prevent
  SQL injection attacks

### VIII. Version Control Discipline

- Code MUST be committed after every meaningful change — a
  completed function, a passing test, a working feature increment
- Commit messages MUST be descriptive: prefix with type
  (feat/fix/test/refactor/docs) and describe the change
- MUST NOT commit broken code, failing tests, or debug artifacts
  (console.log, commented-out code)
- Each commit MUST represent a logically complete unit of work
  that does not break the build
- Feature branches MUST be used for all non-trivial changes

### IX. Skill-Driven Development

- Available development skills MUST be leveraged for best results:
  brainstorming before features, TDD for implementation, debugging
  for issues, code-review before merge, verification before
  completion
- Feature development MUST start with brainstorming to explore
  requirements and design before writing code
- Non-trivial implementations MUST use a written plan before coding
- All completed work MUST be verified with the verification skill
  before claiming completion
- Code review MUST be performed before merging any feature branch

## Testing Standards

### Test Organization

```text
tests/
├── unit/           # Pure function and service tests
├── component/      # React component rendering and interaction
├── integration/    # Cross-module and flow tests
└── api/            # BMS Session API contract tests
```

### Test Naming Convention

- Test files: `[module].test.ts` or `[component].test.tsx`
- Describe blocks: module or component name
- Test names: "MUST [expected behavior] when [condition]"

### Test Quality Requirements

- Tests MUST be deterministic — no flaky tests allowed
- Tests MUST be independent — no shared mutable state between tests
- Tests MUST run in isolation — mock external dependencies at
  boundaries only (BMS API, browser APIs)
- Integration tests MUST NOT mock internal modules — only external
  system boundaries
- All test runs MUST produce structured logs sufficient to diagnose
  failures without re-running

## Development Workflow

### Feature Implementation Flow

1. **Brainstorm** — explore requirements and design choices
2. **Plan** — write implementation plan for multi-step tasks
3. **Write Tests** — define expected behavior before implementation
4. **Implement** — write minimum code to pass tests
5. **Refactor** — improve code quality while keeping tests green
6. **Commit** — save each meaningful increment
7. **Review** — code review before merge
8. **Verify** — final verification before marking complete

### Code Review Checklist

- [ ] All tests pass (unit + component + integration + API)
- [ ] No TypeScript errors or warnings
- [ ] No duplicated code — shared logic extracted
- [ ] Business logic in services, not components
- [ ] User-facing operations provide feedback
- [ ] Error states handled with actionable messages
- [ ] Commits are atomic and descriptive
- [ ] Performance considerations addressed

## Governance

- This constitution is the authoritative source for development
  standards in the BMS Session Demo Dashboard project
- All pull requests and code reviews MUST verify compliance with
  these principles
- Amendments MUST be documented with rationale, reviewed by the
  team, and include a migration plan for existing code
- Version follows semantic versioning: MAJOR for principle removal
  or redefinition, MINOR for new principles or expanded guidance,
  PATCH for clarifications and wording fixes
- Compliance review MUST be performed at each major feature
  milestone
- Complexity beyond these standards MUST be justified in writing

**Version**: 1.0.0 | **Ratified**: 2026-03-17 | **Last Amended**: 2026-03-17
