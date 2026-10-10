import { cookies } from "next/headers";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { requirePageSession } from "@/lib/auth/page";
import { toParam } from "@/lib/ids";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";
import { LAST_SEARCH_COOKIE, lastSearchItems, lastSearchReply, parseLastSearch } from "@/lib/local/last-search";
import { groupLocal, searchSummary } from "@/lib/local/view";
import { getStore } from "@/lib/store";
import type { LocalBiz, Segment, Status } from "@/lib/types";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";

/** How each segment looks: the hottest lead (site down) is red, no website is the accent. */
const SEG: Record<Segment, { icon: IconName; tile: string; color: string }> = {
  site_down: { icon: "alert", tile: "lead-tile--danger", color: "var(--danger)" },
  no_website: { icon: "globe", tile: "lead-tile--warm", color: "var(--accent)" },
  old_site: { icon: "refresh", tile: "lead-tile--warn", color: "var(--warn)" },
  social_only: { icon: "chat", tile: "lead-tile--sent", color: "var(--st-sent)" },
};

/** A plain function (not a component) so the row is part of the page's element tree. */
function bizRow(biz: LocalBiz, status: Status) {
  const seg = SEG[biz.segment] ?? SEG.no_website;
  return (
    <Link key={biz.id} href={`/local/${toParam(biz.id)}`} className="list-row">
      <span className={`lead-tile ${seg.tile}`}><Icon name={seg.icon} size={20} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="list-row__topic">{biz.name}</div>
        {/* Spec card: name, area, category, evidence line. Both lines wrap so the phone and evidence are never cut off. */}
        <div className="list-row__meta list-row__meta--wrap">{biz.catLabel} · {biz.area}{biz.phoneDisplay ? ` · ${biz.phoneDisplay}` : ""}</div>
        {biz.evidence ? <div className="list-row__meta list-row__meta--wrap">{biz.evidence}</div> : null}
      </div>
      {status !== "new" ? <span className={`badge st st--${status}`}>{status}</span> : <span className="list-row__chevron"><Icon name="chevronRight" size={18} /></span>}
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
  const listed = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Local</h1>
        <p className="page-sub">Website nasleli dukane · {data.local.length} saved</p>
      </div>
      <SearchForm initial={last ? { area: last.area, category: lastCategory ? last.category : "all" } : undefined} />
      {last ? (
        <section className="last-search" aria-label="Last search">
          <div className="last-search__head">
            <span className="lead-tile lead-tile--hot" style={{ width: 32, height: 32, borderRadius: 10 }}><Icon name="sparkles" size={16} /></span>
            <div className="section-label">Last search · {lastCategory?.label ?? "All businesses"}</div>
          </div>
          <p className="note last-search__summary" role="status">{searchSummary(lastSearchReply(last))}</p>
          {lastItems.length ? (
            lastItems.map(({ biz, status }) => bizRow(biz, status))
          ) : (
            <div className="empty empty--slim">
              <span className="empty__title">Ya shodhat navin dukane nahit</span>
              <span>Dusra area kiva prakar try kar.</span>
            </div>
          )}
        </section>
      ) : null}
      <div className="chips chips--sticky" style={{ marginTop: 12 }}>
        <Link href="/local" className={`chip${show === "open" ? " chip--active" : ""}`}>Open{show === "open" ? <span className="chip__n">{listed}</span> : null}</Link>
        <Link href="/local?show=all" className={`chip${show === "all" ? " chip--active" : ""}`}>All{show === "all" ? <span className="chip__n">{listed}</span> : null}</Link>
      </div>
      {groups.length === 0 ? (
        lastItems.length ? null : (
          <div className="empty">
            <span className="empty__icon"><Icon name="store" size={24} /></span>
            <span className="empty__title">Ithe kahi nahi</span>
            <span>Varti area ani prakar tak ani &quot;Navin shodh&quot; dab.</span>
          </div>
        )
      ) : (
        groups.map((g) => (
          <section key={g.segment}>
            <div className="section-label seg-head" style={{ ["--c" as string]: (SEG[g.segment] ?? SEG.no_website).color }}>
              <span className="seg-dot" />
              <span className="seg-head__label">{g.label}</span>
              <span className="chip__n">{g.items.length}</span>
            </div>
            <p className="section-hint">{g.hint}</p>
            {g.items.map(({ biz, status }) => bizRow(biz, status))}
          </section>
        ))
      )}
    </>
  );
}
