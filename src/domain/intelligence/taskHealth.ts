/**
 * The model-health monitor — the part of the AI-labor system that improves its own
 * operating rules instead of trusting the model blindly forever. Every model task
 * (analyze, generate, converse, …) either has its output ACCEPTED (parsed, passed
 * the domain invariants and the safety guards) or FALLS BACK. This tracks that
 * accept/fallback signal per task over a rolling window and decides whether the
 * model is still worth calling.
 *
 * When a task's recent acceptance rate drops below the floor, the monitor stops
 * running the model for that task and lets the deterministic fallback carry it —
 * automatically, no human in the loop. It never gets permanently stuck: while a
 * task is throttled it still lets one call in every PROBE_INTERVAL through to
 * re-test, so a recovered model earns its task back. Deterministic (count-based,
 * no clock, no randomness), so the same outcome sequence always yields the same
 * decisions — and every gate transition is auditable via `taskHealthSummary`.
 *
 * This governs LABOR only (is the draft good enough to keep using the model?). It
 * never touches safety routing or calibration math — those are deterministic and
 * are not the model's to decide.
 */

export type MonitorTask =
  | "analyze"
  | "generate"
  | "converse"
  | "signals"
  | "summarize";

/** Rolling window size — decisions consider only the last WINDOW outcomes. */
const WINDOW = 20;
/** Below this many samples a task is presumed healthy (not enough evidence yet). */
const MIN_SAMPLES = 8;
/** Acceptance-rate floor; at or above this the task keeps running the model. */
const FLOOR = 0.5;
/** While throttled, let one call in this many through as a recovery probe. */
const PROBE_INTERVAL = 10;

interface TaskState {
  /** Most-recent outcomes, newest last, capped at WINDOW. true = accepted. */
  outcomes: boolean[];
  /** Calls skipped since the last probe — drives periodic recovery probes. */
  skipsSinceProbe: number;
}

const states = new Map<MonitorTask, TaskState>();
let version = 0;

function stateFor(task: MonitorTask): TaskState {
  let s = states.get(task);
  if (s === undefined) {
    s = { outcomes: [], skipsSinceProbe: 0 };
    states.set(task, s);
  }
  return s;
}

function acceptanceRate(outcomes: readonly boolean[]): number {
  if (outcomes.length === 0) return 1;
  const accepted = outcomes.filter(Boolean).length;
  return accepted / outcomes.length;
}

/** True when the model is currently trusted enough to run for this task. */
function healthy(s: TaskState): boolean {
  if (s.outcomes.length < MIN_SAMPLES) return true;
  return acceptanceRate(s.outcomes) >= FLOOR;
}

/**
 * Decide whether to run the model for `task` on this call. Returns `run: true`
 * when healthy, or when a throttled task is due a recovery probe. Call once per
 * task invocation, BEFORE the call; then report the result with
 * `recordTaskOutcome` only when `run` was true. `probe` marks a recovery attempt
 * (a call let through despite being throttled), for observability.
 */
export function gateTask(task: MonitorTask): { run: boolean; probe: boolean } {
  const s = stateFor(task);
  if (healthy(s)) {
    s.skipsSinceProbe = 0;
    return { run: true, probe: false };
  }
  s.skipsSinceProbe += 1;
  if (s.skipsSinceProbe >= PROBE_INTERVAL) {
    s.skipsSinceProbe = 0;
    return { run: true, probe: true };
  }
  return { run: false, probe: false };
}

/**
 * Record the outcome of a model call that actually ran. `accepted` is true when
 * the output was used, false when it fell back. A health-state transition (healthy
 * ⇄ throttled) bumps the monitor version so the change is auditable.
 */
export function recordTaskOutcome(task: MonitorTask, accepted: boolean): void {
  const s = stateFor(task);
  const before = healthy(s);
  s.outcomes.push(accepted);
  if (s.outcomes.length > WINDOW) s.outcomes.shift();
  if (healthy(s) !== before) version += 1;
}

/** Whether the model is currently trusted for this task (no side effects). */
export function isTaskHealthy(task: MonitorTask): boolean {
  return healthy(stateFor(task));
}

/** Bumps whenever any task crosses the health threshold — an audit signal. */
export function taskHealthVersion(): number {
  return version;
}

export interface TaskHealthRow {
  task: MonitorTask;
  samples: number;
  acceptanceRate: number;
  healthy: boolean;
}

/** A snapshot of every task the monitor has seen, for an operator/admin surface. */
export function taskHealthSummary(): TaskHealthRow[] {
  return [...states.entries()].map(([task, s]) => ({
    task,
    samples: s.outcomes.length,
    acceptanceRate: acceptanceRate(s.outcomes),
    healthy: healthy(s),
  }));
}

/** Test-only reset so suites don't leak monitor state between cases. */
export function resetTaskHealth(): void {
  states.clear();
  version = 0;
}
