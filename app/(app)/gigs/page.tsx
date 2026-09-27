import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { filterGigs, GIG_FILTERS, GIG_LIST_CAP, parseFilter } from "@/lib/gigs/view";
import { toParam } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { ageLabel } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GigsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requirePageSession();
  const f = parseFilter((await searchParams).f);
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const matching = filterGigs(gigs.items, data.state, f);
  const list = matching.slice(0, GIG_LIST_CAP);
  const now = Date.now();

  return (
    <>
      <h1 className="page-title">Gigs</h1>
      <div className="chips">
        {GIG_FILTERS.map((x) => (
          <Link key={x.key} href={`/gigs?f=${x.key}`} className={`chip${x.key === f ? " chip--active" : ""}`}>{x.label}</Link>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">Ithe kahi nahi. Navin gigs roj savari sadharan 7 vajta yetat.</div>
      ) : (
        list.map((g) => {
          const st = data.state[g.id]?.status;
          return (
            <Link key={g.id} href={`/gigs/${toParam(g.id)}`} className="list-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="list-row__topic">{g.title}</div>
                {/* Wraps rather than ellipsizing: the spec lists source, budget, age and score on every row. */}
                <div className="list-row__meta list-row__meta--wrap">
                  {g.source} · {g.budget || "no budget"} · {ageLabel(g.date || g.fetchedAt, now)} · score {g.score}
                  {g.extra ? ` · ${g.extra}` : ""}
                </div>
              </div>
              {st && st !== "new" ? <span className="badge badge--accent">{st}</span> : null}
            </Link>
          );
        })
      )}
      {matching.length > list.length ? (
        <p className="note" style={{ marginTop: 8 }}>Best score che pahile {list.length} dakhavle (ekun {matching.length}).</p>
      ) : null}
    </>
  );
}
