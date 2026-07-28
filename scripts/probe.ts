// Live integration probe (bun run scripts/probe.ts). Verifies the external
// pieces work together before driving the UI: yc-oss + Beast + OpenAI schema.
import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";

const BEAST = process.env.BEAST_URL!;
const KEY = process.env.BEAST_API_KEY!;

async function beast(path: string, body: unknown) {
  const r = await fetch(`${BEAST}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

async function main() {
  console.log("1) yc-oss target source");
  const yc = await (await fetch("https://yc-oss.github.io/api/tags/artificial-intelligence.json")).json();
  const active = (yc as { status: string; website: string; name: string }[]).filter(
    (c) => c.status === "Active" && c.website,
  );
  console.log(`   ${active.length} active AI companies, e.g.`, active.slice(0, 3).map((c) => c.name).join(", "));

  console.log("2) Beast /search");
  const hits = await beast("/api/v1/search", { q: "Vercel careers jobs", n: 3 });
  console.log(`   ${(hits as unknown[]).length} hits, first:`, (hits as { title: string }[])[0]?.title);

  console.log("3) Beast /research");
  const res = await beast("/api/v1/research", { q: "common complaints about Notion", n: 3, synthesize: true });
  console.log(`   answer ${(res as { answer: string }).answer.length} chars, ${(res as { citations: unknown[] }).citations.length} citations`);

  console.log("4) Groq generateObject (schema synthesis)");
  const { object } = await generateObject({
    model: groq("openai/gpt-oss-120b"),
    schema: z.object({
      problems: z.array(z.object({ problem: z.string(), evidence_url: z.string() })),
      outreach_dm: z.string(),
    }),
    system: "Only assert problems backed by a source url. No em dashes, no emojis.",
    prompt:
      "Company: Acme. Signal:\n## complaints\nUsers on reddit say onboarding is confusing and exports are slow.\nSources: https://reddit.com/r/acme/x\nProduce 2 problems with evidence_url and a short founder DM.",
  });
  console.log(`   ${object.problems.length} problems, DM ${object.outreach_dm.length} chars`);
  console.log("   sample problem:", object.problems[0]);

  console.log("\nALL PROBES PASSED");
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message);
  process.exit(1);
});
