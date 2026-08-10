/**
 * Adaptive worker cadence: poll fast while there is any queued work, slow
 * down to a single health-check wakeup per minute when the system is idle.
 * A pure function so the policy is unit-testable without a running worker.
 */
export function nextPollMs(activity: boolean, workMs: number, idleMs: number): number {
  return activity ? workMs : idleMs;
}