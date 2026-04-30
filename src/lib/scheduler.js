export class SchedulerService {
  constructor(weights) {
    this.weights = weights ?? {
      priority: 2.0,
      deadlinePressure: 2.5,
      urgency: 1.5,
      effortFit: 1.0,
      contextFit: 1.2,
      focusContribution: 1.3,
      riskPenalty: 1.0
    };
  }

  rank(candidates, now = new Date()) {
    return candidates
      .map((candidate) => ({ ...candidate, rankScore: this.scoreCandidate(candidate, now) }))
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  generatePlan(candidates, blocks, now = new Date()) {
    const ranked = this.rank(candidates, now);
    const remaining = new Map(ranked.map((item) => [item.id, { ...item, remainingMinutes: item.estimatedMinutes }]));
    const scheduled = [];

    for (const block of blocks) {
      const feasible = [...remaining.values()]
        .filter((item) => item.remainingMinutes > 0)
        .filter((item) => !item.blocked && item.dependenciesMet)
        .sort((a, b) => (b.rankScore + this.effortFitScore(b.remainingMinutes, block.minutes)) - (a.rankScore + this.effortFitScore(a.remainingMinutes, block.minutes)));

      const choice = feasible[0];
      if (!choice) continue;
      if (choice.remainingMinutes > block.minutes && !choice.splittable) continue;

      const minutes = Math.min(choice.remainingMinutes, block.minutes);
      scheduled.push({
        candidateId: choice.id,
        startAt: block.startAt,
        endAt: addMinutes(block.startAt, minutes),
        minutes,
        score: choice.rankScore
      });

      choice.remainingMinutes -= minutes;
      remaining.set(choice.id, choice);
    }

    const unscheduled = [];
    for (const item of remaining.values()) {
      if (item.remainingMinutes <= 0) continue;
      unscheduled.push({
        candidateId: item.id,
        reason: item.blocked ? 'blocked' : (!item.dependenciesMet ? 'dependency' : 'no_capacity')
      });
    }

    return { scheduled, unscheduled };
  }

  scoreCandidate(item, now) {
    const p = ({ low: 1, medium: 2, high: 3, critical: 4 }[item.priorityBand ?? 'medium']);
    const d = deadlinePressure(item.dueAt, item.deadlineType, now);
    const u = item.urgencyScore ?? 3;
    const e = item.effortScore ?? 3;
    const c = item.contextTags?.includes('deep_work') ? 4 : 3;
    const f = (item.impactScore ?? 3) >= 4 ? 4 : 2;
    const r = (!item.estimatedMinutes ? 1 : 0) + ((item.confidenceScore ?? 3) <= 2 ? 1 : 0);

    return this.weights.priority * p +
      this.weights.deadlinePressure * d +
      this.weights.urgency * u +
      this.weights.effortFit * e +
      this.weights.contextFit * c +
      this.weights.focusContribution * f -
      this.weights.riskPenalty * r;
  }

  effortFitScore(estimate, blockMinutes) {
    if (estimate <= blockMinutes && estimate >= 0.6 * blockMinutes) return 2;
    if (estimate < 0.6 * blockMinutes) return 1;
    return -1;
  }
}

function deadlinePressure(dueAt, deadlineType, now) {
  if (!dueAt) return 1;
  const hours = (new Date(dueAt).getTime() - now.getTime()) / 36e5;
  let raw = 1;
  if (hours < 24) raw = 5;
  else if (hours < 72) raw = 4;
  else if (hours < 24 * 7) raw = 3;
  else if (hours < 24 * 14) raw = 2;
  return deadlineType === 'soft' ? raw * 0.7 : raw;
}

function addMinutes(iso, minutes) {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}
