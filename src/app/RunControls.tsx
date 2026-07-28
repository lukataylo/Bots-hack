"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pullAction, analyzeMoreAction } from "./actions";

// yc-oss tag slugs worth hunting in (all verified live endpoints)
const TAGS = [
  ["artificial-intelligence", "AI"],
  ["developer-tools", "Dev tools"],
  ["b2b", "B2B"],
  ["saas", "SaaS"],
  ["fintech", "Fintech"],
  ["infrastructure", "Infra"],
] as const;

export default function RunControls({ pendingCount }: { pendingCount: number }) {
  const [isPending, start] = useTransition();
  const [busy, setBusy] = useState<string>("");
  const [tag, setTag] = useState<string>(TAGS[0][0]);

  function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    start(async () => {
      try {
        await fn();
      } finally {
        setBusy("");
      }
    });
  }

  return (
    <>
      <select
        className="tagsel"
        value={tag}
        aria-label="YC tag to pull from"
        disabled={isPending}
        onChange={(e) => setTag(e.target.value)}
      >
        {TAGS.map(([slug, label]) => (
          <option key={slug} value={slug}>{label}</option>
        ))}
      </select>
      <button
        className="btn btn-ghost"
        disabled={isPending}
        onClick={() => run("pull", () => pullAction(tag))}
      >
        {busy === "pull" ? <span className="spin" /> : null}
        Pull targets
      </button>
      <button
        className="btn"
        disabled={isPending || pendingCount === 0}
        onClick={() => run("analyze", () => analyzeMoreAction(3))}
        title={pendingCount === 0 ? "Pull targets first" : `${pendingCount} waiting`}
      >
        {busy === "analyze" ? <span className="spin" /> : null}
        Analyse 3{pendingCount ? ` of ${pendingCount}` : ""}
      </button>
    </>
  );
}

type Run = { active: boolean; label: string; done: number; total: number };

// Live progress for the analyser: polls /api/run/status and refreshes the board
// as briefs land, so a run is watchable instead of a blind spinner.
export function RunStatus() {
  const [run, setRun] = useState<Run | null>(null);
  const router = useRouter();
  const lastDone = useRef(-1);
  const wasActive = useRef(false);

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = (await (await fetch("/api/run/status", { cache: "no-store" })).json()) as Run;
        if (!alive) return;
        setRun(r);
        // refresh the board whenever a company finishes, and once when the run ends
        if (r.active && r.done !== lastDone.current && lastDone.current >= 0) router.refresh();
        if (!r.active && wasActive.current) router.refresh();
        lastDone.current = r.active ? r.done : -1;
        wasActive.current = r.active;
        t = setTimeout(tick, r.active ? 2500 : 8000);
      } catch {
        if (alive) t = setTimeout(tick, 8000);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [router]);

  if (!run?.active) return null;
  const pct = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div className="runline" role="status" aria-live="polite">
      <span className="marker marker-ink">Analysing</span>
      <span style={{ color: "var(--ink)" }}>{run.label}</span>
      <span className="track"><i style={{ width: `${Math.max(6, pct)}%` }} /></span>
      <span className="mono">{run.done}/{run.total}</span>
    </div>
  );
}
