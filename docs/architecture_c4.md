# To-Do Agent Backend Architecture (C4 + Data Flow)

This document maps directly to the current codebase so implementation can proceed module-by-module with minimal refactor risk.

## 1) C4 Context Diagram (Level 1)

```mermaid
flowchart LR
  user[User / Frontend Client]
  api[To-Do Agent Backend]
  pg[(PostgreSQL)]
  reviewer[Developer / Reviewer]

  user -->|HTTP JSON| api
  api -->|SQL / Migration| pg
  reviewer -->|Run tests, review checklist| api
```

### Current file mapping
- Backend entry and routing: `src/index.js`, `src/app.js`.
- Persistence model and migration source: `src/db/store.js`, `src/db/migrate.js`, `docs/postgres_schema.sql`.
- API contract: `docs/openapi.yaml`.
- Quality gates: `test/*.js`, `REVIEW_CHECKLIST.md`.

## 2) C4 Container Diagram (Level 2)

```mermaid
flowchart TB
  subgraph Backend[To-Do Agent Backend]
    api[HTTP API Container\nsrc/app.js]
    sched[Scheduler Container\nsrc/lib/scheduler.js]
    store[Store Container\nsrc/db/store.js]
    migrate[Migration Runner\nsrc/db/migrate.js]
    tests[Test Container\ntest/*.js]
  end

  client[Frontend / CLI]
  schema[OpenAPI + SQL docs\ndocs/openapi.yaml\ndocs/postgres_schema.sql]
  db[(PostgreSQL)]

  client --> api
  api --> sched
  api --> store
  migrate --> db
  schema -. contract / schema source .- api
  schema -. schema source .- migrate
  tests --> api
  tests --> sched
  tests --> store
```

### Container responsibilities
1. **HTTP API container (`src/app.js`)**
   - Validates request payloads.
   - Handles `POST /api/v1/tasks`, `GET /api/v1/tasks`, `POST /api/v1/plans/generate`.
2. **Scheduler container (`src/lib/scheduler.js`)**
   - Candidate ranking and greedy block placement.
   - Returns `scheduled` and `unscheduled` results.
3. **Store container (`src/db/store.js`)**
   - Current in-memory persistence for tasks/plans/plan_items.
   - Replaceable with Postgres implementation later.
4. **Migration runner (`src/db/migrate.js`)**
   - Applies `docs/postgres_schema.sql` via `psql`.
5. **Test container (`test/*`)**
   - Verifies scheduler behavior and endpoint integration.

## 3) C4 Component Diagram (Level 3) for current runtime

```mermaid
flowchart LR
  subgraph App[src/app.js]
    router[Route handlers]
    val[Validators\nvalidateCreateTask\nvalidateGeneratePlan]
    trans[Task->Candidate Transformer]
    blockgen[Default Block Generator]
  end

  sched[SchedulerService\nsrc/lib/scheduler.js]
  store[InMemoryStore\nsrc/db/store.js]

  router --> val
  router --> store
  router --> trans
  trans --> sched
  router --> blockgen
  blockgen --> sched
  sched --> router
  router --> store
```

### Component boundaries you should preserve
- Keep `SchedulerService` pure (no IO, no DB calls).
- Keep store behind an abstraction (`createTask`, `listTasks`, `createPlan`).
- Keep request validation in API layer, not scheduler.

These boundaries are already reflected by the current files and reduce refactor risk when introducing Postgres-backed repositories.

## 4) Data-flow diagram for current endpoints

```mermaid
sequenceDiagram
  participant C as Client
  participant A as src/app.js
  participant S as src/lib/scheduler.js
  participant D as src/db/store.js

  rect rgb(240, 248, 255)
  Note over C,D: POST /api/v1/tasks
  C->>A: JSON task payload
  A->>A: validateCreateTask
  A->>D: createTask(input)
  D-->>A: task record
  A-->>C: 201 Created + task
  end

  rect rgb(245, 255, 245)
  Note over C,D: GET /api/v1/tasks
  C->>A: GET request
  A->>D: listTasks()
  D-->>A: task[]
  A-->>C: 200 OK + {items}
  end

  rect rgb(255, 250, 240)
  Note over C,D: POST /api/v1/plans/generate
  C->>A: date/horizon/timezone
  A->>A: validateGeneratePlan
  A->>D: listTasks()
  D-->>A: task[]
  A->>A: map tasks -> candidates
  A->>A: build default time blocks
  A->>S: generatePlan(candidates, blocks)
  S-->>A: scheduled + unscheduled
  A->>D: createPlan(planDate, timezone, scheduled)
  D-->>A: persisted plan + items
  A-->>C: 200 OK + plan/items/unscheduled
  end
```

## 5) Module-by-module implementation plan (low refactor risk)

### Module 1: Storage abstraction hardening
- Introduce an interface contract for store methods used by `src/app.js`:
  - `createTask`
  - `listTasks`
  - `createPlan`
- Keep `InMemoryStore` behavior unchanged.
- Add `PostgresStore` with same method signatures.

### Module 2: Database-backed persistence
- Implement `PostgresStore` with SQL aligned to `docs/postgres_schema.sql`.
- Wire `src/index.js` to choose `InMemoryStore` or `PostgresStore` by env flag.

### Module 3: Validation hardening
- Align `src/app.js` validation rules with `docs/openapi.yaml` fields and constraints.
- Add negative integration tests for validation failures.

### Module 4: Scheduling configurability
- Move block generation into a helper module.
- Make workday window/timezone configurable.

### Module 5: Agent + policy flow
- Add endpoints for action proposal/decision/execution from OpenAPI.
- Persist actions and policy checks using schema tables.

## 6) Refactor safety checklist

1. Keep route signatures stable (`/api/v1/tasks`, `/api/v1/plans/generate`).
2. Preserve scheduler input/output shape expected by integration tests.
3. Ensure tests run in memory without DB for speed.
4. Add DB integration tests separately (opt-in with `DATABASE_URL`).
5. Keep OpenAPI and SQL docs updated when runtime behavior changes.
