import { cookies } from "next/headers";
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { toParam } from "@/lib/ids";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";
import { LAST_SEARCH_COOKIE, lastSearchItems, lastSearchReply, parseLastSearch } from "@/lib/local/last-search";
import { groupLocal, searchSummary } from "@/lib/local/view";
import { getStore } from "@/lib/store";
import type { LocalBiz, Status } from "@/lib/types";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";

/** A plain function (not a component) so the row is part of the page's element tree. */
function bizRow(biz: LocalBiz, status: Status) {
  return (
    <Link key={biz.id} href={`/local/${toParam(biz.id)}`} className="list-row">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="list-row__topic">{biz.name}</div>
        {/* Spec card: name, area, category, evidence line. Both lines wrap so the phone and evidence are never cut off. */}
        <div className="list-row__meta list-row__meta--wrap">{biz.catLabel} · {biz.area}{biz.phoneDisplay ? ` · ${biz.phoneDisplay}` : ""}</div>
        {biz.evidence ? <div className="list-row__meta list-row__meta--wrap">{biz.evidence}</div> : null}
      </div>
      {status !== "new" ? <span className="badge badge--accent">{status}</span> : null}
    </Link>
  );
}

export default async function LocalPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requirePageSession();
  const show = (await searchParams).show === "all" ? "all" : "open";
  const data = await getStore().readData();
  // The last search (cookie set by POST /api/local/search) stays on top until the next search replaces it.
  const last = parseLastSearch((await cookies()).get(LAST_SEARCH_COOKIE)?.value);
  const lastItems = lastSearchItems(data.local, data.state, last);
  const lastIds = new Set(lastItems.map((x) => x.biz.id));
  const groups = groupLocal(data.local.filter((b) => !lastIds.has(b.id)), data.state, show);
  const lastCategory = last ? CATEGORY_OPTIONS.find((c) => c.key === last.category) : undefined;

  return (
    <>
      <h1 className="page-title">Local</h1>
      <SearchForm initial={last ? { area: last.area, category: lastCategory ? last.category : "all" } : undefined} />
      {last ? (
        <section className="last-search" aria-label="Last search">
          <div className="section-label">Last search · {lastCategory?.label ?? "All businesses"}</div>
          <p className="note" role="status" style={{ margin: "0 0 8px" }}>{searchSummary(lastSearchReply(last))}</p>
          {lastItems.length ? (
            lastItems.map(({ biz, status }) => bizRow(biz, status))
          ) : (
            <p className="note" style={{ marginTop: 0 }}>Ya shodhat navin dukane nahit — dusra area kiva prakar try kar.</p>
          )}
        </section>
      ) : null}
      <div className="chips" style={{ marginTop: 12 }}>
        <Link href="/local" className={`chip${show === "open" ? " chip--active" : ""}`}>Open</Link>
        <Link href="/local?show=all" className={`chip${show === "all" ? " chip--active" : ""}`}>All</Link>
      </div>
      {groups.length === 0 ? (
        lastItems.length ? null : <div className="empty">Ithe kahi nahi. Varti area ani prakar tak ani &quot;Navin shodh&quot; dab.</div>
      ) : (
        groups.map((g) => (
          <section key={g.segment}>
            <div className="section-label">{g.label} ({g.items.length}) · {g.hint}</div>
            {g.items.map(({ biz, status }) => bizRow(biz, status))}
          </section>
        ))
      )}
    </>
  );
}
