import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { requirePageSession } from "@/lib/auth/page";
import { filterGigs, GIG_FILTERS, GIG_LIST_CAP, parseFilter } from "@/lib/gigs/view";
import { toParam } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { ageLabel } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Score tile tone: the best-matching gigs stand out at a glance. */
const scoreTone = (score: number) => (score >= 15 ? " lead-tile--hot" : score >= 8 ? " lead-tile--warm" : "");

export default async function GigsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requirePageSession();
  const f = parseFilter((await searchParams).f);
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const matching = filterGigs(gigs.items, data.state, f);
  const list = matching.slice(0, GIG_LIST_CAP);
  const now = Date.now();
  const counts = Object.fromEntries(GIG_FILTERS.map((x) => [x.key, filterGigs(gigs.items, data.state, x.key).length]));
  const label = GIG_FILTERS.find((x) => x.key === f)?.label ?? "";

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Gigs</h1>
        <p className="page-sub">{matching.length} {label.toLowerCase()} gigs · best score adhi</p>
      </div>
      <div className="chips chips--sticky">
        {GIG_FILTERS.map((x) => (
          <Link key={x.key} href={`/gigs?f=${x.key}`} className={`chip${x.key === f ? " chip--active" : ""}`}>
            {x.label}
            <span className="chip__n">{counts[x.key]}</span>
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <span className="empty__icon"><Icon name="inbox" size={24} /></span>
          <span className="empty__title">Ithe kahi nahi</span>
          <span>Navin gigs roj savari sadharan 7 vajta yetat.</span>
          {f !== "all" ? <Link href="/gigs?f=all" className="btn btn--ghost">All gigs bagha</Link> : null}
        </div>
      ) : (
        list.map((g) => {
          const st = data.state[g.id]?.status;
          return (
            <Link key={g.id} href={`/gigs/${toParam(g.id)}`} className="list-row">
              <span className={`lead-tile lead-tile--score${scoreTone(g.score)}`} aria-label={`score ${g.score}`}>
                {g.score}<span className="lead-tile__label">score</span>
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="list-row__topic list-row__topic--clamp">{g.title}</div>
                {/* Wraps rather than ellipsizing: the spec lists source, budget and age on every row (score is the tile). */}
                <div className="list-row__meta list-row__meta--wrap">
                  {g.source} · {g.budget || "no budget"} · {ageLabel(g.date || g.fetchedAt, now)}
                  {g.extra ? ` · ${g.extra}` : ""}
                </div>
              </div>
              {st && st !== "new" ? <span className={`badge st st--${st}`}>{st}</span> : <span className="list-row__chevron"><Icon name="chevronRight" size={18} /></span>}
            </Link>
          );
        })
      )}
      {matching.length > list.length ? (
        <p className="note" style={{ marginTop: 8, textAlign: "center" }}>Best score che pahile {list.length} dakhavle (ekun {matching.length}).</p>
      ) : null}
    </>
  );
}
