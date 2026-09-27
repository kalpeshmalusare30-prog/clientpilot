import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { toParam } from "@/lib/ids";
import { groupLocal } from "@/lib/local/view";
import { getStore } from "@/lib/store";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";

export default async function LocalPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requirePageSession();
  const show = (await searchParams).show === "all" ? "all" : "open";
  const data = await getStore().readData();
  const groups = groupLocal(data.local, data.state, show);

  return (
    <>
      <h1 className="page-title">Local</h1>
      <SearchForm />
      <div className="chips" style={{ marginTop: 12 }}>
        <Link href="/local" className={`chip${show === "open" ? " chip--active" : ""}`}>Open</Link>
        <Link href="/local?show=all" className={`chip${show === "all" ? " chip--active" : ""}`}>All</Link>
      </div>
      {groups.length === 0 ? (
        <div className="empty">Ithe kahi nahi. Varti area ani prakar tak ani "Navin shodh" dab.</div>
      ) : (
        groups.map((g) => (
          <section key={g.segment}>
            <div className="section-label">{g.label} ({g.items.length}) · {g.hint}</div>
            {g.items.map(({ biz, status }) => (
              <Link key={biz.id} href={`/local/${toParam(biz.id)}`} className="list-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="list-row__topic">{biz.name}</div>
                  {/* Spec card: name, area, category, evidence line. Both lines wrap so the phone and evidence are never cut off. */}
                  <div className="list-row__meta list-row__meta--wrap">{biz.catLabel} · {biz.area}{biz.phoneDisplay ? ` · ${biz.phoneDisplay}` : ""}</div>
                  {biz.evidence ? <div className="list-row__meta list-row__meta--wrap">{biz.evidence}</div> : null}
                </div>
                {status !== "new" ? <span className="badge badge--accent">{status}</span> : null}
              </Link>
            ))}
          </section>
        ))
      )}
    </>
  );
}
