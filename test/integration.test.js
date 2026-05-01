import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { InMemoryStore } from '../src/db/store.js';

async function request(server, method, path, body) {
  const port = await new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await response.json();
  await new Promise((resolve) => server.close(resolve));
  return { status: response.status, json };
}

test('POST /tasks then POST /plans/generate', async () => {
  const store = new InMemoryStore();
  let server = createApp(store);
  const created = await request(server, 'POST', '/api/v1/tasks', {
    title: 'Write roadmap', estimated_minutes: 60, priority_band: 'high', urgency_score: 4
  });
  assert.equal(created.status, 201);

  server = createApp(store);
  const plan = await request(server, 'POST', '/api/v1/plans/generate', {
    date: '2026-04-29', horizon: 'day', timezone: 'Etc/UTC'
  });

  assert.equal(plan.status, 200);
  assert.equal(plan.json.items.length >= 1, true);
});
