import test from 'node:test';
import assert from 'node:assert/strict';
import { SchedulerService } from '../src/lib/scheduler.js';

test('rank prefers urgent high-priority tasks', () => {
  const scheduler = new SchedulerService();
  const now = new Date('2026-04-29T00:00:00.000Z');

  const ranked = scheduler.rank([
    { id: 'a', kind: 'task', title: 'later', estimatedMinutes: 60, dueAt: '2026-05-10T00:00:00.000Z', priorityBand: 'low', blocked: false, dependenciesMet: true },
    { id: 'b', kind: 'task', title: 'urgent', estimatedMinutes: 60, dueAt: '2026-04-29T12:00:00.000Z', priorityBand: 'critical', blocked: false, dependenciesMet: true }
  ], now);

  assert.equal(ranked[0].id, 'b');
});

test('generatePlan schedules feasible items and marks overflow unscheduled', () => {
  const scheduler = new SchedulerService();
  const result = scheduler.generatePlan([
    { id: 'a', kind: 'task', title: 'a', estimatedMinutes: 120, priorityBand: 'high', blocked: false, dependenciesMet: true, splittable: true },
    { id: 'b', kind: 'task', title: 'b', estimatedMinutes: 120, priorityBand: 'high', blocked: false, dependenciesMet: true, splittable: false }
  ], [{ startAt: '2026-04-29T09:00:00.000Z', endAt: '2026-04-29T10:00:00.000Z', minutes: 60 }]);

  assert.equal(result.scheduled.length, 1);
  assert.equal(result.unscheduled.length, 2);
});
