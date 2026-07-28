// In-memory ring buffer of TraceSteps keyed by jobId. Server-process-lifetime only (fine for
// a single-instance Node hackathon deploy) — never imported by a route file itself (underscore
// folder is excluded from Next's router).
import type { TraceStep } from '@/lib/types';

interface JobState {
  steps: TraceStep[];
  done: boolean;
  createdAt: number;
}

const MAX_STEPS_PER_JOB = 500;
const JOB_TTL_MS = 30 * 60 * 1000;

const g = globalThis as unknown as { __ringsideTraceJobs?: Map<string, JobState> };
const jobs = g.__ringsideTraceJobs ?? (g.__ringsideTraceJobs = new Map());

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function createJob(jobId: string): void {
  sweep();
  jobs.set(jobId, { steps: [], done: false, createdAt: Date.now() });
}

export function pushStep(jobId: string, step: TraceStep): void {
  let job = jobs.get(jobId);
  if (!job) {
    job = { steps: [], done: false, createdAt: Date.now() };
    jobs.set(jobId, job);
  }
  job.steps.push(step);
  if (job.steps.length > MAX_STEPS_PER_JOB) job.steps.shift();
}

export function finishJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (job) job.done = true;
}

export function getJob(jobId: string): { steps: TraceStep[]; done: boolean } | null {
  const job = jobs.get(jobId);
  return job ? { steps: job.steps, done: job.done } : null;
}
