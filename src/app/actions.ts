"use server";

import { revalidatePath } from "next/cache";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { pullTargets, analyzePending, analyzeById } from "@/pipeline/run";
import { setStatus, getCompany, updateBrief } from "@/lib/db";
import { regenerateDm } from "@/lib/ai";
import { freshFounderContext } from "@/pipeline/signals";

export async function pullAction(tag?: string): Promise<number> {
  const n = await pullTargets({ tag: tag || undefined, limit: 12 });
  revalidatePath("/");
  return n;
}

export async function analyzeMoreAction(limit = 3): Promise<number> {
  const n = await analyzePending(limit);
  revalidatePath("/");
  return n;
}

export async function analyzeOneAction(id: number): Promise<boolean> {
  const ok = await analyzeById(id);
  revalidatePath("/");
  revalidatePath(`/company/${id}`);
  return ok;
}

export async function setStatusAction(id: number, status: string): Promise<void> {
  setStatus(id, status); // records a feedback-loop event with the current score
  revalidatePath("/");
  revalidatePath(`/company/${id}`);
}

// Re-pull the founder's latest posts/news and regenerate just the DM (kills staleness).
export async function refreshDmAction(id: number): Promise<void> {
  const c = getCompany(id);
  if (!c?.brief) return;
  const ctx = await freshFounderContext(c.name, c.brief.founder.name);
  const dm = await regenerateDm(c.brief, ctx);
  updateBrief(id, { ...c.brief, outreach_dm: dm });
  revalidatePath(`/company/${id}`);
}

// Scaffold a local POC repo: ~/Documents/scout-pocs/{slug} with git + a README
// (problem + the build idea + the DM + OSS starting point). Returns the path.
export async function startBuildAction(id: number): Promise<string | null> {
  const c = getCompany(id);
  const idea = c?.brief?.build_ideas?.[0];
  if (!c || !c.brief || !idea) return null;
  const b = c.brief;
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `co-${id}`;
  const dir = join(homedir(), "Documents", "scout-pocs", slug);
  mkdirSync(dir, { recursive: true });
  const readme = `# ${c.name} POC: ${idea.title}

## Problem
${b.problems[0]?.problem ?? "(see Scout brief)"}
${b.problems[0]?.evidence_url ? `Evidence: ${b.problems[0].evidence_url}` : ""}

## What to build
${idea.what}

Why it lands: ${idea.why_it_lands}
Estimate: ${idea.time_estimate}
Start from: ${idea.oss}

## The DM to send (founder: ${b.founder.name || "unknown"})
${b.outreach_dm}

## Company
${c.website} - ${b.summary}
`;
  writeFileSync(join(dir, "README.md"), readme);
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
  } catch {
    /* git optional */
  }
  setStatus(id, "shortlisted");
  revalidatePath(`/company/${id}`);
  return dir;
}
