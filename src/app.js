import http from 'node:http';
import { SchedulerService } from './lib/scheduler.js';

export function createApp(store) {
  const scheduler = new SchedulerService();

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/api/v1/tasks') {
        const body = await readJson(req);
        validateCreateTask(body);
        const task = store.createTask(body);
        return json(res, 201, task);
      }

      if (req.method === 'GET' && req.url.startsWith('/api/v1/tasks')) {
        return json(res, 200, { items: store.listTasks() });
      }

      if (req.method === 'POST' && req.url === '/api/v1/plans/generate') {
        const body = await readJson(req);
        validateGeneratePlan(body);

        const tasks = store.listTasks();
        const candidates = tasks.map((task) => ({
          id: task.id,
          kind: 'task',
          title: task.title,
          estimatedMinutes: task.estimated_minutes ?? 30,
          dueAt: task.due_at ?? undefined,
          deadlineType: task.deadline_type ?? undefined,
          impactScore: task.impact_score ?? 3,
          urgencyScore: task.urgency_score ?? 3,
          effortScore: task.effort_score ?? 3,
          confidenceScore: task.confidence_score ?? 3,
          priorityBand: task.priority_band ?? 'medium',
          blocked: false,
          dependenciesMet: true,
          splittable: true
        }));

        const start = new Date(`${body.date}T09:00:00.000Z`);
        const blocks = [0, 60, 120, 180].map((offset) => ({
          startAt: new Date(start.getTime() + offset * 60000).toISOString(),
          endAt: new Date(start.getTime() + (offset + 60) * 60000).toISOString(),
          minutes: 60
        }));

        const result = scheduler.generatePlan(candidates, blocks, new Date());
        const persisted = store.createPlan({
          planDate: body.date,
          timezone: body.timezone,
          scheduledItems: result.scheduled
        });

        return json(res, 200, { plan: persisted.plan, items: persisted.items, unscheduled: result.unscheduled });
      }

      return json(res, 404, { error: 'Not Found' });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : 'Bad Request' });
    }
  });
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function validateCreateTask(body) {
  if (!body || typeof body !== 'object') throw new Error('Request body is required');
  if (typeof body.title !== 'string' || body.title.trim().length === 0) throw new Error('title is required');
  if (body.estimated_minutes != null && (!Number.isInteger(body.estimated_minutes) || body.estimated_minutes < 1)) {
    throw new Error('estimated_minutes must be an integer >= 1');
  }
}

function validateGeneratePlan(body) {
  if (!body || typeof body !== 'object') throw new Error('Request body is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) throw new Error('date must be YYYY-MM-DD');
  if (!['day', 'week'].includes(body.horizon)) throw new Error('horizon must be day or week');
  if (typeof body.timezone !== 'string' || !body.timezone) throw new Error('timezone is required');
}
