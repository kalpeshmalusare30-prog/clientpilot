import Link from "next/link";
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

// Block-level so a long title (or a raw id) is cut with an ellipsis instead of widening the card.
const TITLE_STYLE = { display: "block" } as const;

export default async function PipelinePage() {
  await requirePageSession();
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const p = buildPipeline(gigs, data);
  const now = Date.now();

  return (
    <>
      <h1 className="page-title">Pipeline</h1>
      {PIPELINE_STAGES.map((stage) => (
        <section key={stage}>
          <div className="section-label">{LABEL[stage]} ({p[stage].length})</div>
          {p[stage].length === 0 ? (
            <div className="empty">—</div>
          ) : (
            p[stage].map((item) => (
              <div key={item.id} className="card">
                {item.href ? (
                  <Link href={item.href} className="list-row__topic link-accent" style={TITLE_STYLE}>{item.title}</Link>
                ) : (
                  // The lead's record is gone (old gig dropped from gigs.json): no detail page to open.
                  <span className="list-row__topic" style={TITLE_STYLE} title={item.title}>{item.title}</span>
                )}
                <div className="note">
                  {item.kind === "gig" ? "Gig" : "Local"} · {item.sub}
                  {item.followUpAt ? ` · follow-up ${formatIST(item.followUpAt)}` : ""}
                  {followUpState(item.followUpAt, now) === "overdue" ? " · overdue" : ""}
                </div>
                <StageControls param={item.param} kind={item.kind} status={item.status} followUpAt={item.followUpAt ?? ""} notes={item.notes ?? ""} />
              </div>
            ))
          )}
        </section>
      ))}
    </>
  );
}
