-- To-Do + Agent Scheduler v1 schema
-- PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE task_status AS ENUM (
  'inbox', 'ready', 'scheduled', 'in_progress', 'blocked', 'done', 'canceled'
);

CREATE TYPE deadline_type AS ENUM ('hard', 'soft');
CREATE TYPE priority_band AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE energy_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE agent_mode AS ENUM ('manual', 'assist', 'auto');

CREATE TYPE subtask_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'canceled');

CREATE TYPE plan_horizon AS ENUM ('day', 'week');
CREATE TYPE plan_status AS ENUM ('draft', 'active', 'superseded', 'completed');
CREATE TYPE generation_reason AS ENUM ('manual', 'morning_run', 'replan_after_delay', 'calendar_change');

CREATE TYPE plan_item_type AS ENUM ('task', 'subtask', 'buffer', 'break');
CREATE TYPE plan_item_status AS ENUM ('scheduled', 'in_progress', 'done', 'missed', 'moved');
CREATE TYPE plan_item_source AS ENUM ('agent', 'user');

CREATE TYPE action_type AS ENUM (
  'create_task', 'update_task', 'schedule_task',
  'create_calendar_event', 'update_calendar_event',
  'send_email_draft', 'send_email',
  'notify_user', 'replan'
);

CREATE TYPE action_target_type AS ENUM ('task', 'subtask', 'plan', 'calendar_event', 'email');
CREATE TYPE action_status AS ENUM ('proposed', 'approved', 'rejected', 'executing', 'succeeded', 'failed');

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,

  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'inbox',

  due_at TIMESTAMPTZ,
  deadline_type deadline_type,
  earliest_start_at TIMESTAMPTZ,
  latest_start_at TIMESTAMPTZ,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes >= 0),

  impact_score SMALLINT CHECK (impact_score BETWEEN 1 AND 5),
  urgency_score SMALLINT CHECK (urgency_score BETWEEN 1 AND 5),
  effort_score SMALLINT CHECK (effort_score BETWEEN 1 AND 5),
  confidence_score SMALLINT CHECK (confidence_score BETWEEN 1 AND 5),
  priority_band priority_band,

  energy_required energy_level,
  context_tags TEXT[] NOT NULL DEFAULT '{}',
  location_tag TEXT CHECK (location_tag IN ('anywhere','office','home','phone')),

  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  blocked_by_task_ids UUID[] NOT NULL DEFAULT '{}',

  recurrence_rule TEXT,

  agent_mode agent_mode NOT NULL DEFAULT 'manual',
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,

  title TEXT NOT NULL,
  description TEXT,
  status subtask_status NOT NULL DEFAULT 'todo',

  order_index INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes >= 0),

  due_at TIMESTAMPTZ,
  earliest_start_at TIMESTAMPTZ,

  blocked_by_subtask_ids UUID[] NOT NULL DEFAULT '{}',

  can_agent_execute BOOLEAN NOT NULL DEFAULT FALSE,
  tool_hints TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,

  plan_date DATE NOT NULL,
  horizon plan_horizon NOT NULL,
  timezone TEXT NOT NULL,

  status plan_status NOT NULL DEFAULT 'draft',
  generation_reason generation_reason NOT NULL,

  total_score NUMERIC(10,2),
  focus_minutes INTEGER,
  slack_minutes INTEGER,
  risk_flags TEXT[] NOT NULL DEFAULT '{}',

  created_by TEXT NOT NULL CHECK (created_by IN ('user','agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,

  item_type plan_item_type NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  subtask_id UUID REFERENCES subtasks(id) ON DELETE SET NULL,

  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),

  locked BOOLEAN NOT NULL DEFAULT FALSE,
  source plan_item_source NOT NULL,

  status plan_item_status NOT NULL DEFAULT 'scheduled',
  move_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (end_at > start_at)
);

CREATE TABLE permission_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,

  name TEXT NOT NULL,

  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  allowed_action_types action_type[] NOT NULL DEFAULT '{}',
  require_approval_for action_type[] NOT NULL DEFAULT '{}',

  auto_approve_low_risk BOOLEAN NOT NULL DEFAULT FALSE,
  max_actions_per_day INTEGER CHECK (max_actions_per_day IS NULL OR max_actions_per_day > 0),
  max_reschedules_per_day INTEGER CHECK (max_reschedules_per_day IS NULL OR max_reschedules_per_day > 0),
  max_calendar_moves_per_day INTEGER CHECK (max_calendar_moves_per_day IS NULL OR max_calendar_moves_per_day > 0),

  no_actions_after_local_hour SMALLINT CHECK (no_actions_after_local_hour BETWEEN 0 AND 23),
  no_actions_before_local_hour SMALLINT CHECK (no_actions_before_local_hour BETWEEN 0 AND 23),

  allow_external_emails BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_email_domains TEXT[] NOT NULL DEFAULT '{}',

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,

  action_type action_type NOT NULL,
  target_type action_target_type,
  target_id UUID,

  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_payload JSONB,
  executed_payload JSONB,

  status action_status NOT NULL DEFAULT 'proposed',
  failure_reason TEXT,

  policy_snapshot_id UUID REFERENCES permission_policies(id) ON DELETE SET NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_workspace_status_due ON tasks(workspace_id, status, due_at);
CREATE INDEX idx_tasks_workspace_owner_updated ON tasks(workspace_id, owner_user_id, updated_at DESC);
CREATE INDEX idx_subtasks_task_status ON subtasks(task_id, status);
CREATE INDEX idx_plan_items_plan_start ON plan_items(plan_id, start_at);
CREATE INDEX idx_agent_actions_workspace_created_status ON agent_actions(workspace_id, created_at DESC, status);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subtasks_updated_at
BEFORE UPDATE ON subtasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_plan_items_updated_at
BEFORE UPDATE ON plan_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_permission_policies_updated_at
BEFORE UPDATE ON permission_policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_agent_actions_updated_at
BEFORE UPDATE ON agent_actions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
