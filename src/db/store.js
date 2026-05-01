import { randomUUID } from 'node:crypto';

export class InMemoryStore {
  constructor() {
    this.tasks = [];
    this.plans = [];
    this.planItems = [];
  }

  createTask(input) {
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      workspace_id: input.workspace_id ?? randomUUID(),
      owner_user_id: input.owner_user_id ?? randomUUID(),
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'ready',
      due_at: input.due_at ?? null,
      deadline_type: input.deadline_type ?? null,
      estimated_minutes: input.estimated_minutes ?? 30,
      impact_score: input.impact_score ?? 3,
      urgency_score: input.urgency_score ?? 3,
      effort_score: input.effort_score ?? 3,
      confidence_score: input.confidence_score ?? 3,
      priority_band: input.priority_band ?? 'medium',
      created_at: now,
      updated_at: now
    };
    this.tasks.push(task);
    return task;
  }

  listTasks() {
    return [...this.tasks];
  }

  createPlan({ planDate, timezone, scheduledItems }) {
    const plan = {
      id: randomUUID(),
      workspace_id: this.tasks[0]?.workspace_id ?? randomUUID(),
      user_id: this.tasks[0]?.owner_user_id ?? randomUUID(),
      plan_date: planDate,
      horizon: 'day',
      timezone,
      status: 'active',
      generation_reason: 'manual',
      created_by: 'agent',
      created_at: new Date().toISOString()
    };
    this.plans.push(plan);

    const byTaskId = new Map(this.tasks.map((t) => [t.id, t]));
    const planItems = scheduledItems.map((item) => ({
      id: randomUUID(),
      plan_id: plan.id,
      workspace_id: plan.workspace_id,
      item_type: 'task',
      task_id: item.candidateId,
      subtask_id: null,
      start_at: item.startAt,
      end_at: item.endAt,
      duration_minutes: item.minutes,
      locked: false,
      source: 'agent',
      status: 'scheduled',
      move_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      title: byTaskId.get(item.candidateId)?.title ?? 'Unknown task'
    }));

    this.planItems.push(...planItems);
    return { plan, items: planItems };
  }
}
