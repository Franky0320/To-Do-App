# Review Request Checklist

Please verify the following for this PR:

- [ ] `POST /api/v1/tasks`
  - [ ] Returns `201` for valid payload.
  - [ ] Returns `400` for invalid payload.
- [ ] `GET /api/v1/tasks`
  - [ ] Returns `200`.
  - [ ] Includes created tasks in `items` array.
- [ ] `POST /api/v1/plans/generate`
  - [ ] Returns `200` with `plan`, `items`, and `unscheduled` fields.
  - [ ] Persists generated plan items in store for the request lifecycle.
- [ ] Scheduler behavior
  - [ ] Higher urgency/priority tasks rank earlier.
  - [ ] Unschedulable tasks are reported in `unscheduled`.
- [ ] Tests passing
  - [ ] `npm test` succeeds locally.

## Suggested verification commands

```bash
npm test
```

```bash
curl -sS -X POST http://localhost:3000/api/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Write roadmap","estimated_minutes":60,"priority_band":"high","urgency_score":4}'
```

```bash
curl -sS http://localhost:3000/api/v1/tasks
```

```bash
curl -sS -X POST http://localhost:3000/api/v1/plans/generate \
  -H 'content-type: application/json' \
  -d '{"date":"2026-04-30","horizon":"day","timezone":"Etc/UTC"}'
```
