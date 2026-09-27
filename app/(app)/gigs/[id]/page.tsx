import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <>
      <Link href="/gigs" className="link-accent">← Gigs</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{gig.title}</h1>
      <dl className="kv">
        <dt>Source</dt><dd>{gig.source}{gig.extra ? ` · ${gig.extra}` : ""}</dd>
        <dt>Budget</dt><dd>{gig.budget || "—"}</dd>
        <dt>Posted</dt><dd>{gig.date ? formatIST(gig.date) : "—"}</dd>
        <dt>Status</dt><dd>{st?.status ?? "new"}{st?.bidAmount ? ` · bid ${st.bidCurrency ?? ""} ${st.bidAmount}` : ""}{st?.followUpAt ? ` · follow-up ${formatIST(st.followUpAt)}` : ""}</dd>
      </dl>
      <div className="card"><div className="desc">{gig.desc || "No description."}</div></div>
      <GigPanel
        id={id}
        param={param}
        url={httpUrl(gig.url)}
        isFreelancer={gig.source === "freelancer.com"}
        initialProposal={st?.proposal ?? ""}
        status={st?.status ?? "new"}
        defaultCurrency={currencyFromBudget(gig.budget)}
        maxChars={MAX_PROPOSAL_CHARS}
      />
    </>
  );
}
