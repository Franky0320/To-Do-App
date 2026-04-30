# To-Do Agent Backend (Minimal Vertical Slice)

## What is implemented
- `POST /api/v1/tasks`
- `GET /api/v1/tasks`
- `POST /api/v1/plans/generate`
- Scheduler wired to plan generation and persisted into store abstraction.

## Run
```bash
npm start
```

Server starts on `http://localhost:3000`.

## Test
```bash
npm test
```

## DB Migration (PostgreSQL)
Set `DATABASE_URL` and run:
```bash
DATABASE_URL=postgres://user:pass@localhost:5432/todo npm run db:migrate
```

## Curl flow
Create task:
```bash
curl -sS -X POST http://localhost:3000/api/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Write roadmap","estimated_minutes":60,"priority_band":"high","urgency_score":4}'
```

List tasks:
```bash
curl -sS http://localhost:3000/api/v1/tasks
```

Generate day plan:
```bash
curl -sS -X POST http://localhost:3000/api/v1/plans/generate \
  -H 'content-type: application/json' \
  -d '{"date":"2026-04-29","horizon":"day","timezone":"Etc/UTC"}'
```
