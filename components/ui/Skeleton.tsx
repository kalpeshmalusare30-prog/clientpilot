/** Loading placeholders shaped like the pages they stand in for (used by the route loading.tsx files). */

function Bar({ w, h = 14, r }: { w: string | number; h?: number; r?: number }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r }} />;
}

export function PageHeadSkeleton() {
  return (
    <div className="page-head" aria-hidden="true">
      <Bar w={140} h={30} r={10} />
      <Bar w={200} h={14} />
    </div>
  );
}

export function ListSkeleton({ rows = 5, chips = 4 }: { rows?: number; chips?: number }) {
  return (
    <div className="sk-wrap" role="status" aria-label="Loading">
      <PageHeadSkeleton />
      {chips ? (
        <div className="chips" aria-hidden="true">
          {Array.from({ length: chips }, (_, i) => <Bar key={i} w={72} h={40} r={999} />)}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="list-row sk-row" aria-hidden="true">
          <Bar w={44} h={44} r={14} />
          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8 }}>
            <Bar w="80%" h={15} />
            <Bar w="55%" h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="sk-wrap" role="status" aria-label="Loading">
      <div className="hero sk-hero" aria-hidden="true">
        <div style={{ display: "grid", gap: 10, flex: 1 }}>
          <Bar w={120} h={12} />
          <Bar w="70%" h={28} r={10} />
          <Bar w="90%" h={14} />
        </div>
        <Bar w={92} h={92} r={999} />
      </div>
      <div className="stats" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="stat sk-row">
            <Bar w={36} h={36} r={12} />
            <Bar w={56} h={30} r={8} />
            <Bar w="70%" h={12} />
          </div>
        ))}
      </div>
      <div className="card" aria-hidden="true" style={{ display: "grid", gap: 12 }}>
        <Bar w={110} h={16} />
        <Bar w="100%" h={12} r={999} />
        <Bar w="100%" h={44} r={14} />
      </div>
    </div>
  );
}
