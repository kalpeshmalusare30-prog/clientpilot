import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { requirePageSession } from "@/lib/auth/page";
import { buildPipeline, PIPELINE_STAGES, type PipelineStage } from "@/lib/pipeline";
import { getStore } from "@/lib/store";
import { followUpState, formatIST } from "@/lib/time";
import { StageControls } from "./StageControls";

export const dynamic = "force-dynamic";

const LABEL: Record<PipelineStage, string> = {
  drafted: "Drafted",
  sent: "Pathavla / Bid kela",
  replied: "Reply aala",
  won: "Client zala",
  lost: "Nahi",
};

const SHORT: Record<PipelineStage, string> = { drafted: "Drafted", sent: "Sent", replied: "Replied", won: "Won", lost: "Lost" };

const EMPTY: Record<PipelineStage, string> = {
  drafted: "Kahi draft nahi. Gig ughad ani \"AI proposal lihi\" dab.",
  sent: "Ajun kahi pathavla nahi. Aajcha pahila pitch pathav!",
  replied: "Reply aala ki lead ithe aan. Follow-ups chalu thev.",
  won: "Pahila client ithe disel. Lavkarach!",
  lost: "Kahi lost nahi. Chan!",
};

// Block-level so a long title (or a raw id) is cut with an ellipsis instead of widening the card.
const TITLE_STYLE = { display: "block" } as const;

const stageVar = (stage: PipelineStage) => ({ ["--c" as string]: `var(--st-${stage})` });

export default async function PipelinePage() {
  await requirePageSession();
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const p = buildPipeline(gigs, data);
  const now = Date.now();
  const total = PIPELINE_STAGES.reduce((n, s) => n + p[s].length, 0);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Pipeline</h1>
        <p className="page-sub">{total} leads · javalcha follow-up adhi</p>
      </div>
      <nav className="chips chips--sticky" aria-label="Stages">
        {PIPELINE_STAGES.map((stage) => (
          <a key={stage} href={`#stage-${stage}`} className="chip" style={stageVar(stage)}>
            <span className="chip__dot" />
            {SHORT[stage]}
            <span className="chip__n">{p[stage].length}</span>
          </a>
        ))}
      </nav>
      {PIPELINE_STAGES.map((stage) => (
        <section key={stage} id={`stage-${stage}`} className="stage" style={stageVar(stage)}>
          <div className="stage__head">
            <h2 className="stage__title">{LABEL[stage]}</h2>
            <span className={`badge st st--${stage} stage__count`}>{p[stage].length}</span>
          </div>
          {p[stage].length === 0 ? (
            <div className="empty empty--slim">{EMPTY[stage]}</div>
          ) : (
            p[stage].map((item) => {
              const fu = followUpState(item.followUpAt, now);
              return (
                <div key={item.id} className="card lead-card">
                  <div className="lead-card__top">
                    <div>
                      {item.href ? (
                        <Link href={item.href} className="list-row__topic link-accent" style={TITLE_STYLE}>{item.title}</Link>
                      ) : (
                        // The lead's record is gone (old gig dropped from gigs.json): no detail page to open.
                        <span className="list-row__topic" style={TITLE_STYLE} title={item.title}>{item.title}</span>
                      )}
                      <div className="note" style={{ marginTop: 2 }}>{item.kind === "gig" ? "Gig" : "Local"} · {item.sub}</div>
                    </div>
                    <span className="lead-tile" style={{ width: 32, height: 32, borderRadius: 10 }}>
                      <Icon name={item.kind === "gig" ? "briefcase" : "store"} size={16} />
                    </span>
                  </div>
                  {item.followUpAt ? (
                    <div className="meta-chips">
                      <span className={`badge ${fu === "overdue" ? "badge--danger" : fu === "today" ? "badge--warn" : "badge--muted"}`}>
                        <Icon name={fu === "overdue" ? "flame" : "clock"} size={12} />
                        {fu === "overdue" ? "overdue · " : fu === "today" ? "aaj · " : "follow-up · "}
                        {formatIST(item.followUpAt)}
                      </span>
                    </div>
                  ) : null}
                  <StageControls param={item.param} kind={item.kind} status={item.status} followUpAt={item.followUpAt ?? ""} notes={item.notes ?? ""} />
                </div>
              );
            })
          )}
        </section>
      ))}
    </>
  );
}
