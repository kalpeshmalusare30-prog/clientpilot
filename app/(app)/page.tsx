import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { summarize } from "@/lib/dashboard";
import { getStore } from "@/lib/store";
import { formatIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requirePageSession();
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const s = summarize(gigs, data, Date.now());

  return (
    <>
      <h1 className="page-title">Aaj</h1>

      <div className="section-label">Follow-ups</div>
      {s.followUps.length === 0 ? (
        <div className="empty">Aaj kahi follow-up nahi.</div>
      ) : (
        s.followUps.map((f) => (
          <Link key={f.id} href={f.href} className="list-row">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="list-row__topic">{f.title}</div>
              <div className="list-row__meta">{f.kind === "gig" ? "Gig" : "Local"} · {formatIST(f.followUpAt)}</div>
            </div>
            <span className={`badge ${f.when === "overdue" ? "badge--danger" : "badge--warn"}`}>{f.when === "overdue" ? "overdue" : "aaj"}</span>
          </Link>
        ))
      )}

      <div className="section-label">Gigs</div>
      <Link href="/gigs?f=new" className="list-row">
        <div style={{ flex: 1 }}>
          <div className="list-row__topic">{s.newGigs} navin gigs (last 24 tas)</div>
          <div className="list-row__meta">
            {s.lastRun ? `Last fetch ${formatIST(s.lastRun.at)} · +${s.lastRun.added}` : "Ajun fetch zala nahi"}
            {s.lastRun?.failed.length ? ` · failed: ${s.lastRun.failed.join(", ")}` : ""}
          </div>
        </div>
      </Link>

      <div className="section-label">Pipeline</div>
      <div className="stat-grid">
        {(["drafted", "sent", "replied", "won", "lost", "skipped"] as const).map((k) => (
          <Link key={k} href="/pipeline" className="stat">
            <div className="stat__n">{s.counts[k]}</div>
            <div className="stat__l">{k}</div>
          </Link>
        ))}
      </div>
      <p className="note" style={{ marginTop: 16 }}>Navin gigs roj savari sadharan 7 vajta yetat.</p>
    </>
  );
}
