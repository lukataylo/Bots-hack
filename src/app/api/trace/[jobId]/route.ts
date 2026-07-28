import type { NextRequest } from 'next/server';
import { getJob } from '../../_lib/trace-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_MS = 250;
const MAX_LIFETIME_MS = 5 * 60 * 1000;

// SSE replay-then-live stream of TraceSteps for a scouting job: sends every step already
// buffered, then keeps polling the ring buffer for new ones until the job is marked done.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let sent = 0;
      const startedAt = Date.now();

      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const tick = () => {
        if (closed) return;
        const job = getJob(jobId);
        if (job) {
          while (sent < job.steps.length) {
            const s = job.steps[sent];
            controller.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(s)}\n\n`));
            sent += 1;
          }
          if (job.done) {
            controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
            close();
            return;
          }
        }
        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          close();
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      };

      tick();
    },
    cancel() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
