import Link from "next/link";
import { listCompanies, calibration, type CompanyRow } from "@/lib/db";
import RunControls, { RunStatus } from "./RunControls";
import { Logo } from "./Logo";

export const dynamic = "force-dynamic";

// score strength is encoded by ink density (DESIGN.md), not traffic lights
function tier(s: number | null): string {
  if (s == null) return "t-none";
  if (s >= 60) return "score-strong";
  if (s >= 35) return "score-mid";
  return "score-weak";
}

export default function Dashboard() {
  const companies = listCompanies();
  const pending = companies.filter((c) => c.status === "new").length;
  // the next target to WORK: analysed or shortlisted, not yet contacted or closed
  const next = companies.find(
    (c) => c.brief && c.score != null && ["analyzed", "shortlisted"].includes(c.status),
  );
  const cal = calibration();

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="masthead-id">
          <Link href="/" className="wordmark serif">Scout</Link>
          <div className="dek">The startup review. Find the problem, build the wedge, message the founder.</div>
        </div>
        <div className="masthead-tools">
          <RunControls pendingCount={pending} />
        </div>
      </header>

      <RunStatus />

      {next && (
        <section className="lead rise">
          <div style={{ minWidth: 0 }}>
            <span className="marker">Priority target</span>
            <h1 className="lead-name">
              <Link href={`/company/${next.id}`}>{next.name}</Link>
            </h1>
            <p className="lead-dek">{next.brief?.best_move || next.brief?.summary}</p>
            <div className="lead-byline">
              <Logo website={next.website} name={next.name} size={22} />
              <span className="mono dim" style={{ fontSize: 12 }}>
                {next.website.replace(/^https?:\/\//, "")}
              </span>
              {next.batch && <span className="dim" style={{ fontSize: 12 }}>{next.batch}</span>}
              {next.brief?.role_fit && <span className="muted" style={{ fontSize: 12 }}>{next.brief.role_fit}</span>}
            </div>
          </div>
          <Link href={`/company/${next.id}`} className="scorebox" aria-label={`Open ${next.name}, score ${next.score}`}>
            <span className={`n ${tier(next.score)}`}>{next.score}</span>
          </Link>
        </section>
      )}

      {cal.good.n + cal.dead.n > 0 && (
        <div className="statsline">
          <span className="marker marker-ink">Calibration</span>
          <span>
            <span className="k ok">{cal.good.avg != null ? Math.round(cal.good.avg) : "-"}</span> avg score on good
            outcomes ({cal.good.n})
          </span>
          <span>
            <span className="k bad">{cal.dead.avg != null ? Math.round(cal.dead.avg) : "-"}</span> on dead ({cal.dead.n})
          </span>
          <span>
            <span className="k">{cal.contacted}</span> contacted
          </span>
        </div>
      )}

      {companies.length === 0 ? (
        <div className="empty">
          <p>No targets yet. Pull twelve fresh YC companies, then run the analysis.</p>
        </div>
      ) : (
        <section className="board" aria-label="Ranked targets">
          <div className="board-head">
            <span>No.</span>
            <span>Company</span>
            <span className="hd-fit">Role fit</span>
            <span className="hd-st">Status</span>
            <span style={{ textAlign: "right" }}>Score</span>
          </div>
          {companies.map((c, i) => (
            <Row key={c.id} c={c} rank={i + 1} delay={i < 10 ? i * 35 : 0} />
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ c, rank, delay }: { c: CompanyRow; rank: number; delay: number }) {
  const sub = c.brief?.problems?.[0]?.problem || c.one_liner || "";
  const failed = c.status === "new" && c.last_error;
  return (
    <Link href={`/company/${c.id}`} className="row rise" style={{ animationDelay: `${delay}ms` }}>
      <span className="rk">{String(rank).padStart(2, "0")}</span>
      <div className="co">
        <Logo website={c.website} name={c.name} size={30} />
        <div style={{ minWidth: 0 }}>
          <div className="co-name">{c.name}</div>
          <div className="co-sub">{sub}</div>
        </div>
      </div>
      <span className="fit" title={c.brief?.role_fit || undefined}>
        {c.brief?.role_fit || (c.batch ?? "")}
      </span>
      <span className="stcell">
        {failed ? (
          <span className="st st-failed" title={c.last_error ?? undefined}>failed, retry</span>
        ) : (
          <span className={`st st-${c.status}`}>{c.status.replace("_", " ")}</span>
        )}
      </span>
      <span className={`opp ${c.score == null ? "t-none" : tier(c.score)}`}>{c.score ?? "--"}</span>
    </Link>
  );
}
