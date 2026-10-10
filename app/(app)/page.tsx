import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/Ring";
import { requirePageSession } from "@/lib/auth/page";
import { DAILY_SEND_GOAL, greeting, summarize, type CronHealth, type TodaySummary } from "@/lib/dashboard";
import { getStore } from "@/lib/store";
import { formatIST, formatISTDay } from "@/lib/time";

export const dynamic = "force-dynamic";

const FUNNEL = [
  { key: "new", label: "New", href: "/gigs?f=new" },
  { key: "drafted", label: "Drafted", href: "/pipeline#stage-drafted" },
  { key: "sent", label: "Sent", href: "/pipeline#stage-sent" },
  { key: "replied", label: "Replied", href: "/pipeline#stage-replied" },
  { key: "won", label: "Won", href: "/pipeline#stage-won" },
  { key: "lost", label: "Lost", href: "/pipeline#stage-lost" },
] as const;

const CRON: Record<CronHealth, { title: string; icon: IconName; tone: string }> = {
  ok: { title: "Roj cha gigs fetch chalu ahe", icon: "check", tone: "lead-tile--ok" },
  partial: { title: "Fetch zala, pan kahi sources failed", icon: "alert", tone: "lead-tile--warn" },
  stale: { title: "Shevatcha fetch juna ahe", icon: "alert", tone: "lead-tile--danger" },
  never: { title: "Ajun fetch zala nahi", icon: "clock", tone: "" },
};

/** One honest line under the greeting: the most urgent thing first. */
function headline(s: TodaySummary): string {
  const overdue = s.followUps.filter((f) => f.when === "overdue").length;
  if (overdue) return `${overdue} follow-up overdue ${overdue === 1 ? "ahe" : "ahet"}. Adhi te kar.`;
  if (s.followUps.length) return `Aaj ${s.followUps.length} follow-up ${s.followUps.length === 1 ? "ahe" : "ahet"}.`;
  if (s.activity.sentToday >= DAILY_SEND_GOAL) return "Aajcha target purna. Mast kaam!";
  if (s.newGigs) return `${s.newGigs} navin gigs ale ahet. Chal, pitch karu!`;
  return "Sagla clear. Navin clients shodhuya?";
}

export default async function TodayPage() {
  await requirePageSession();
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const now = Date.now();
  const s = summarize(gigs, data, now);
  const overdue = s.followUps.filter((f) => f.when === "overdue").length;
  const steps = FUNNEL.map((f) => ({ ...f, n: f.key === "new" ? s.untouched : s.counts[f.key] }));
  const active = steps.filter((x) => x.key !== "new" && x.n > 0);
  const activeTotal = active.reduce((a, x) => a + x.n, 0);
  const cron = CRON[s.cron];
  const nothingToDo = !s.followUps.length && !s.topGigs.length && !s.localToMessage.length;

  return (
    <>
      <section className="hero" aria-label="Aaj">
        <div className="hero__body">
          <p className="hero__date">{formatISTDay(now)}</p>
          <h1 className="hero__title">{greeting(now)}!</h1>
          <p className="hero__sub">
            {headline(s)}
            {s.activity.touchedToday ? ` Aaj ${s.activity.touchedToday} leads var kaam zala.` : ""}
          </p>
        </div>
        <div className="hero__ringwrap">
          <Ring value={s.activity.sentToday} goal={DAILY_SEND_GOAL} label="Aaj pathavle" />
          <span className="hero__ringlabel">Aaj pathavle</span>
        </div>
      </section>

      <div className="stats">
        <Link href="/gigs?f=new" className="stat stat--accent">
          <span className="stat__icon"><Icon name="briefcase" size={18} /></span>
          <span className="stat__n">{s.newGigs}</span>
          <span className="stat__l">Navin gigs</span>
          <span className="stat__sub">last 24 tas</span>
        </Link>
        <Link href="/pipeline" className={`stat${overdue ? " stat--danger" : ""}`}>
          <span className="stat__icon"><Icon name={overdue ? "flame" : "clock"} size={18} /></span>
          <span className="stat__n">{s.followUps.length}</span>
          <span className="stat__l">Follow-ups due</span>
          <span className={`stat__sub${overdue ? " stat__sub--danger" : ""}`}>{overdue ? `${overdue} overdue` : "kahi overdue nahi"}</span>
        </Link>
        <Link href="/pipeline#stage-sent" className="stat stat--sent">
          <span className="stat__icon"><Icon name="send" size={18} /></span>
          <span className="stat__n">{s.activity.sentWeek}</span>
          <span className="stat__l">Ya athavdyat pathavle</span>
          <span className="stat__sub">aaj {s.activity.sentToday}</span>
        </Link>
        <Link href="/pipeline#stage-replied" className="stat stat--won">
          <span className="stat__icon"><Icon name="trophy" size={18} /></span>
          <span className="stat__n">{s.counts.replied}<small> / {s.counts.won}</small></span>
          <span className="stat__l">Replies / Won</span>
          <span className={`stat__sub${s.counts.won ? " stat__sub--ok" : ""}`}>{s.counts.won ? `${s.counts.won} client zale` : "pahila client yeil!"}</span>
        </Link>
      </div>

      <nav className="quick" aria-label="Quick actions">
        <Link href="/gigs?f=new" className="quick__btn quick__btn--primary"><Icon name="zap" size={20} />Navin gigs bagha</Link>
        <Link href="/local#shodh" className="quick__btn"><Icon name="search" size={20} />Navin shodh</Link>
        <Link href="/pipeline" className="quick__btn"><Icon name="kanban" size={20} />Pipeline</Link>
      </nav>

      <section className="card" style={{ marginTop: 12 }} aria-label="Pipeline">
        <div className="section-head" style={{ margin: 0 }}>
          <h2>Pipeline</h2>
          <Link href="/pipeline" className="see-all">Sagla bagha<Icon name="chevronRight" size={16} /></Link>
        </div>
        <div className="funnel__bar" role="img" aria-label={`Pipeline: ${steps.map((x) => `${x.label} ${x.n}`).join(", ")}`}>
          {active.map((x) => (
            <span key={x.key} className="funnel__seg" style={{ flexGrow: x.n, ["--c" as string]: `var(--st-${x.key})` }} />
          ))}
        </div>
        <div className="funnel__steps">
          {steps.map((x) => (
            <Link key={x.key} href={x.href} className="funnel__step" style={{ ["--c" as string]: `var(--st-${x.key})` }}>
              <span className="funnel__n">{x.n}</span>
              <span className="funnel__l">{x.label}</span>
            </Link>
          ))}
        </div>
        {activeTotal === 0 ? <p className="note" style={{ marginTop: 10 }}>Ajun pipeline madhe kahi nahi. Pahila pitch pathav, ithe bar bharel.</p> : null}
      </section>

      <section className="card" id="next" aria-label="Next actions">
        <div className="section-head" style={{ margin: "0 0 4px" }}>
          <h2>Pudhe kay karaycha</h2>
        </div>
        {nothingToDo ? (
          <div className="empty" style={{ margin: "8px 0 0" }}>
            <span className="empty__icon"><Icon name="check" size={24} /></span>
            <span className="empty__title">Sagla clear!</span>
            <span>Follow-up nahi, navin gigs pan nahit. Local madhe navin dukane shodh.</span>
            <Link href="/local#shodh" className="btn btn--primary i-search">Navin shodh</Link>
          </div>
        ) : (
          <div className="acts">
            {s.followUps.length ? (
              <>
                <div className="acts__group"><span>Follow-up</span><span>{s.followUps.length}</span></div>
                {s.followUps.map((f) => (
                  <Link key={f.id} href={f.href} className="act">
                    <span className={`lead-tile ${f.when === "overdue" ? "lead-tile--danger" : "lead-tile--warn"}`}><Icon name={f.when === "overdue" ? "flame" : "clock"} size={18} /></span>
                    <span className="list-row__body">
                      <span className="list-row__topic" style={{ display: "block" }}>{f.title}</span>
                      <span className="list-row__meta" style={{ display: "block" }}>{f.kind === "gig" ? "Gig" : "Local"} · {formatIST(f.followUpAt)}</span>
                    </span>
                    <span className={`badge ${f.when === "overdue" ? "badge--danger" : "badge--warn"}`}>{f.when === "overdue" ? "overdue" : "aaj"}</span>
                  </Link>
                ))}
              </>
            ) : null}
            {s.topGigs.length ? (
              <>
                <div className="acts__group"><span>Best navin gigs</span><Link href="/gigs?f=new" className="see-all">Sagle<Icon name="chevronRight" size={14} /></Link></div>
                {s.topGigs.map((g) => (
                  <Link key={g.id} href={g.href} className="act">
                    <span className="lead-tile lead-tile--warm lead-tile--score">{g.score}<span className="lead-tile__label">score</span></span>
                    <span className="list-row__body">
                      <span className="list-row__topic" style={{ display: "block" }}>{g.title}</span>
                      <span className="list-row__meta" style={{ display: "block" }}>{g.source}{g.budget ? ` · ${g.budget}` : ""}</span>
                    </span>
                    <span className="list-row__chevron"><Icon name="chevronRight" size={18} /></span>
                  </Link>
                ))}
              </>
            ) : null}
            {s.localToMessage.length ? (
              <>
                <div className="acts__group">
                  <span>Local: message pathav</span>
                  {s.localToMessageTotal > s.localToMessage.length ? <Link href="/local" className="see-all">+{s.localToMessageTotal - s.localToMessage.length} ajun</Link> : null}
                </div>
                {s.localToMessage.map((b) => (
                  <Link key={b.id} href={b.href} className="act">
                    <span className={`lead-tile ${b.segment === "site_down" ? "lead-tile--danger" : "lead-tile--ok"}`}><Icon name="chat" size={18} /></span>
                    <span className="list-row__body">
                      <span className="list-row__topic" style={{ display: "block" }}>{b.name}</span>
                      <span className="list-row__meta" style={{ display: "block" }}>{b.segmentLabel} · {b.catLabel} · {b.area}</span>
                    </span>
                    <span className="list-row__chevron"><Icon name="chevronRight" size={18} /></span>
                  </Link>
                ))}
              </>
            ) : null}
          </div>
        )}
      </section>

      <section className="card" aria-label="Gigs fetch">
        <div className="cron-row">
          <span className={`lead-tile ${cron.tone}`}><Icon name={cron.icon} size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="list-row__topic" style={{ whiteSpace: "normal" }}>{cron.title}</div>
            <div className="list-row__meta list-row__meta--wrap">
              {s.lastRun ? `Last fetch ${formatIST(s.lastRun.at)} · +${s.lastRun.added} navin` : "Ajun ekahi fetch record nahi"}
              {s.lastRun?.failed.length ? ` · failed: ${s.lastRun.failed.join(", ")}` : ""}
            </div>
          </div>
        </div>
        <p className="note" style={{ marginTop: 10 }}>Navin gigs roj savari sadharan 7 vajta yetat.</p>
      </section>
    </>
  );
}
