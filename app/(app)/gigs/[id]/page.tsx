import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { MAX_PROPOSAL_CHARS } from "@/lib/ai/proposal";
import { requirePageSession } from "@/lib/auth/page";
import { currencyFromBudget, httpUrl } from "@/lib/gigs/view";
import { fromParam } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { formatIST } from "@/lib/time";
import { GigPanel } from "./GigPanel";

export const dynamic = "force-dynamic";

export default async function GigPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const param = (await params).id;
  let id: string;
  try {
    id = fromParam(param);
  } catch {
    notFound();
  }
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const gig = gigs.items.find((g) => g.id === id);
  if (!gig) notFound();
  const st = data.state[id];
  const status = st?.status ?? "new";

  return (
    <>
      <Link href="/gigs" className="back"><Icon name="chevronLeft" size={18} />Gigs</Link>
      <section className="card detail-head">
        <div className="meta-chips">
          <span className={`badge st st--${status}`}>{status}</span>
          <span className="badge badge--accent">score {gig.score}</span>
          <span className="badge">{gig.source}</span>
        </div>
        <h1 className="page-title">{gig.title}</h1>
        <div className="info-grid">
          <div className="info">
            <div className="info__k"><Icon name="tag" size={14} />Budget</div>
            <div className="info__v">{gig.budget || "—"}</div>
          </div>
          <div className="info">
            <div className="info__k"><Icon name="calendar" size={14} />Posted</div>
            <div className="info__v">{gig.date ? formatIST(gig.date) : "—"}</div>
          </div>
          {gig.extra ? (
            <div className="info info--wide">
              <div className="info__k"><Icon name="briefcase" size={14} />Source note</div>
              <div className="info__v">{gig.extra}</div>
            </div>
          ) : null}
          {st?.bidAmount || st?.followUpAt ? (
            <div className="info info--wide">
              <div className="info__k"><Icon name="send" size={14} />Status</div>
              <div className="info__v">
                {status}
                {st?.bidAmount ? ` · bid ${st.bidCurrency ?? ""} ${st.bidAmount}` : ""}
                {st?.followUpAt ? ` · follow-up ${formatIST(st.followUpAt)}` : ""}
              </div>
            </div>
          ) : null}
        </div>
      </section>
      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 8 }}>Description</h2>
        <div className="desc">{gig.desc || "No description."}</div>
      </section>
      <GigPanel
        id={id}
        param={param}
        url={httpUrl(gig.url)}
        isFreelancer={gig.source === "freelancer.com"}
        initialProposal={st?.proposal ?? ""}
        status={status}
        defaultCurrency={currencyFromBudget(gig.budget)}
        maxChars={MAX_PROPOSAL_CHARS}
      />
    </>
  );
}
