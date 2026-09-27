import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page";
import { fromParam } from "@/lib/ids";
import { demoUrl, hasPhone } from "@/lib/local/biz";
import { SEGMENT_LABELS } from "@/lib/local/classify";
import { pageOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";
import { formatIST } from "@/lib/time";
import { LocalPanel } from "./LocalPanel";

export const dynamic = "force-dynamic";

export default async function LocalBizPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const param = (await params).id;
  let id: string;
  try {
    id = fromParam(param);
  } catch {
    notFound();
  }
  const data = await getStore().readData();
  const biz = data.local.find((b) => b.id === id);
  if (!biz) notFound();
  const st = data.state[id];
  const demo = hasPhone(biz) ? demoUrl(await pageOrigin(), biz.slug) : null;
  const num = biz.waNum || biz.telNum;

  return (
    <>
      <Link href="/local" className="link-accent">← Local</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{biz.name}</h1>
      <dl className="kv">
        <dt>Prakar</dt><dd>{biz.catLabel}</dd>
        <dt>Area</dt><dd>{biz.area}{biz.addr ? ` · ${biz.addr}` : ""}</dd>
        <dt>Phone</dt><dd>{num ? <a className="link-accent" href={`tel:+${num}`}>{biz.phoneDisplay || `+${num}`}</a> : "—"}</dd>
        {biz.email ? (<><dt>Email</dt><dd>{biz.email}</dd></>) : null}
        {biz.website ? (<><dt>Website</dt><dd>{biz.website}</dd></>) : null}
        <dt>Segment</dt><dd>{SEGMENT_LABELS[biz.segment].label}{biz.evidence ? ` — ${biz.evidence}` : ""}</dd>
        <dt>Status</dt><dd>{st?.status ?? "new"}{st?.followUpAt ? ` · follow-up ${formatIST(st.followUpAt)}` : ""}</dd>
      </dl>
      {st?.notes ? <div className="card"><div className="desc">{st.notes}</div></div> : null}
      <LocalPanel
        param={param}
        phone={num}
        isMobile={!!biz.waNum}
        email={biz.email}
        whatsapp={biz.whatsapp}
        emailSubject={biz.emailSubject}
        emailBody={biz.emailBody}
        demoUrl={demo}
      />
    </>
  );
}
