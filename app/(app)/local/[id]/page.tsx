import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
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
  const status = st?.status ?? "new";
  const demo = hasPhone(biz) ? demoUrl(await pageOrigin(), biz.slug) : null;
  const num = biz.waNum || biz.telNum;
  const seg = SEGMENT_LABELS[biz.segment];

  return (
    <>
      <Link href="/local" className="back"><Icon name="chevronLeft" size={18} />Local</Link>
      <section className="card detail-head">
        <div className="meta-chips">
          <span className={`badge st st--${status}`}>{status}</span>
          <span className={`badge ${biz.segment === "site_down" ? "badge--danger" : "badge--accent"}`}>{seg.label}</span>
          <span className="badge">{biz.catLabel}</span>
        </div>
        <h1 className="page-title">{biz.name}</h1>
        {biz.evidence ? (
          <div className={`evidence${biz.segment === "site_down" ? " evidence--danger" : ""}`}>
            <Icon name="alert" size={18} />
            <span>{seg.label}: {biz.evidence}</span>
          </div>
        ) : null}
        <div className="info-grid">
          <div className="info">
            <div className="info__k"><Icon name="phone" size={14} />Phone</div>
            <div className="info__v">{num ? <a href={`tel:+${num}`}>{biz.phoneDisplay || `+${num}`}</a> : "—"}</div>
          </div>
          <div className="info">
            <div className="info__k"><Icon name="pin" size={14} />Area</div>
            <div className="info__v">{biz.area}</div>
          </div>
          {biz.addr ? (
            <div className="info info--wide">
              <div className="info__k"><Icon name="store" size={14} />Address</div>
              <div className="info__v">{biz.addr}</div>
            </div>
          ) : null}
          {biz.email ? (
            <div className="info info--wide">
              <div className="info__k"><Icon name="mail" size={14} />Email</div>
              <div className="info__v">{biz.email}</div>
            </div>
          ) : null}
          {biz.website ? (
            // Plain text: the URL comes from OpenStreetMap and is never turned into a link.
            <div className="info info--wide">
              <div className="info__k"><Icon name="globe" size={14} />Website</div>
              <div className="info__v">{biz.website}</div>
            </div>
          ) : null}
          {st?.followUpAt ? (
            <div className="info info--wide">
              <div className="info__k"><Icon name="clock" size={14} />Follow-up</div>
              <div className="info__v">{formatIST(st.followUpAt)}</div>
            </div>
          ) : null}
        </div>
      </section>
      {st?.notes ? (
        <section className="card">
          <h2 className="card__title" style={{ marginBottom: 6 }}><Icon name="pencil" size={16} />Note</h2>
          <div className="desc">{st.notes}</div>
        </section>
      ) : null}
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
