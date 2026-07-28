import { NextResponse } from "next/server";
import { pullTargets, analyzePending, analyzeById } from "@/pipeline/run";
import { listCompanies } from "@/lib/db";

// Manual trigger: pull a few targets + analyse N. Also usable by a cron later.
//   GET /api/run?pull=5&analyze=1
export async function GET(req: Request) {
  const u = new URL(req.url);
  const pull = Number(u.searchParams.get("pull") ?? "0");
  const analyze = Number(u.searchParams.get("analyze") ?? "0");
  const id = Number(u.searchParams.get("id") ?? "0");
  const pulled = pull > 0 ? await pullTargets({ limit: pull }) : 0;
  if (id > 0) await analyzeById(id);
  const analyzed = (id > 0 ? 1 : 0) + (analyze > 0 ? await analyzePending(analyze) : 0);
  const top = listCompanies()
    .filter((c) => c.brief)
    .slice(0, 5)
    .map((c) => ({ name: c.name, score: c.score, role: c.brief?.role_fit, problems: c.brief?.problems.length }));
  return NextResponse.json({ pulled, analyzed, top });
}
