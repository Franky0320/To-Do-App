/**
 * Scheduler service skeleton (v1).
 * Strategy: ranked greedy placement + local optimization pass.
 */

export type Energy = "low" | "medium" | "high";

export interface CandidateItem {
  id: string;
  kind: "task" | "subtask";
  title: string;
  estimatedMinutes: number;
  dueAt?: string;
  deadlineType?: "hard" | "soft";
  impactScore?: number;
  urgencyScore?: number;
  effortScore?: number;
  confidenceScore?: number;
  priorityBand?: "low" | "medium" | "high" | "critical";
  energyRequired?: Energy;
  contextTags?: string[];
  blocked: boolean;
  dependenciesMet: boolean;
  splittable?: boolean;
}

export interface FreeBlock {
  startAt: string;
  endAt: string;
  minutes: number;
  energyHint?: Energy;
}

export interface RankedItem extends CandidateItem {
  rankScore: number;
}

export interface ScheduledItem {
  candidateId: string;
  startAt: string;
  endAt: string;
  minutes: number;
  score: number;
}

export interface UnscheduledReason {
  candidateId: string;
  reason: "no_capacity" | "blocked" | "dependency" | "outside_window";
}

export interface PlanResult {
  scheduled: ScheduledItem[];
  unscheduled: UnscheduledReason[];
}

const PRIORITY_MAP: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const WEIGHTS = {
  priority: 2.0,
  deadlinePressure: 2.5,
  urgency: 1.5,
  effortFit: 1.0,
  contextFit: 1.2,
  focusContribution: 1.3,
  riskPenalty: 1.0,
};

export class SchedulerService {
  rank(candidates: CandidateItem[], now = new Date()): RankedItem[] {
    return candidates
      .map((c) => ({ ...c, rankScore: this.scoreCandidate(c, now) }))
      .sort((a, b) => b.rankScore - a.rankScore);
  }

  generatePlan(candidates: CandidateItem[], blocks: FreeBlock[], now = new Date()): PlanResult {
    const ranked = this.rank(candidates, now);
    const scheduled: ScheduledItem[] = [];
    const remaining = new Map(ranked.map((r) => [r.id, { ...r, remainingMinutes: r.estimatedMinutes }]));

    for (const block of blocks) {
      const feasible = Array.from(remaining.values())
        .filter((c: any) => c.remainingMinutes > 0)
        .filter((c: any) => !c.blocked && c.dependenciesMet)
        .filter((c: any) => this.energyCompatible(c.energyRequired, block.energyHint));

      if (feasible.length === 0) continue;

      feasible.sort((a: any, b: any) => {
        const aFit = this.effortFitScore(a.remainingMinutes, block.minutes);
        const bFit = this.effortFitScore(b.remainingMinutes, block.minutes);
        return (b.rankScore + bFit) - (a.rankScore + aFit);
      });

      const choice: any = feasible[0];
      const minutes = Math.min(choice.remainingMinutes, block.minutes);

      if (choice.remainingMinutes > block.minutes && !choice.splittable) {
        continue;
      }

      scheduled.push({
        candidateId: choice.id,
        startAt: block.startAt,
        endAt: this.addMinutes(block.startAt, minutes),
        minutes,
        score: choice.rankScore,
      });

      choice.remainingMinutes -= minutes;
      remaining.set(choice.id, choice);
    }

    const optimized = this.localSwapOptimize(scheduled);
    const unscheduled: UnscheduledReason[] = [];

    for (const c of remaining.values() as any) {
      if (c.remainingMinutes <= 0) continue;
      if (c.blocked) unscheduled.push({ candidateId: c.id, reason: "blocked" });
      else if (!c.dependenciesMet) unscheduled.push({ candidateId: c.id, reason: "dependency" });
      else unscheduled.push({ candidateId: c.id, reason: "no_capacity" });
    }

    return { scheduled: optimized, unscheduled };
  }

  private scoreCandidate(c: CandidateItem, now: Date): number {
    const p = PRIORITY_MAP[c.priorityBand ?? "medium"];
    const d = this.deadlinePressure(c.dueAt, c.deadlineType, now);
    const u = c.urgencyScore ?? 3;
    const e = c.effortScore ?? 3;
    const context = this.contextFit(c);
    const focus = this.focusContribution(c);
    const risk = this.riskPenalty(c);

    return (
      WEIGHTS.priority * p +
      WEIGHTS.deadlinePressure * d +
      WEIGHTS.urgency * u +
      WEIGHTS.effortFit * e +
      WEIGHTS.contextFit * context +
      WEIGHTS.focusContribution * focus -
      WEIGHTS.riskPenalty * risk
    );
  }

  private deadlinePressure(dueAt: string | undefined, deadlineType: "hard" | "soft" | undefined, now: Date): number {
    if (!dueAt) return 1;
    const hours = (new Date(dueAt).getTime() - now.getTime()) / 36e5;
    let raw = 1;
    if (hours < 0) raw = 5;
    else if (hours < 24) raw = 5;
    else if (hours < 72) raw = 4;
    else if (hours < 24 * 7) raw = 3;
    else if (hours < 24 * 14) raw = 2;

    return deadlineType === "soft" ? raw * 0.7 : raw;
  }

  private effortFitScore(estimate: number, blockMinutes: number): number {
    if (estimate <= blockMinutes && estimate >= 0.6 * blockMinutes) return 2;
    if (estimate < 0.6 * blockMinutes) return 1;
    return -1;
  }

  private contextFit(c: CandidateItem): number {
    // TODO: incorporate real-time context/tool availability.
    if (c.contextTags?.includes("deep_work")) return 4;
    return 3;
  }

  private focusContribution(c: CandidateItem): number {
    const impact = c.impactScore ?? 3;
    return impact >= 4 ? 4 : 2;
  }

  private riskPenalty(c: CandidateItem): number {
    let risk = 0;
    if (!c.estimatedMinutes) risk += 1;
    if ((c.confidenceScore ?? 3) <= 2) risk += 1;
    if (!c.dependenciesMet) risk += 2;
    return risk;
  }

  private energyCompatible(required?: Energy, hinted?: Energy): boolean {
    if (!required || !hinted) return true;
    if (required === hinted) return true;
    if (required === "low") return true;
    return false;
  }

  private localSwapOptimize(items: ScheduledItem[]): ScheduledItem[] {
    const sorted = [...items].sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (b.score > a.score * 1.25) {
        sorted[i] = b;
        sorted[i + 1] = a;
      }
    }
    return sorted;
  }

  private addMinutes(startISO: string, minutes: number): string {
    const d = new Date(startISO);
    d.setMinutes(d.getMinutes() + minutes);
    return d.toISOString();
  }
}
