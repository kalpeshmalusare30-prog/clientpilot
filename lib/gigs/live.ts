/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LiveInfo {
  open: boolean;
  status: string;
  bidCount: number | null;
  bidAvg: number | null;
  currency: string;
}

export function freelancerProjectId(gigId: string): number | null {
  const m = /^freelancer\.com:(\d+)$/.exec(gigId);
  return m ? Number(m[1]) : null;
}

function toLive(p: any): LiveInfo {
  const status = String(p.frontend_project_status || p.status || "");
  const count = p.bid_stats?.bid_count;
  const avg = p.bid_stats?.bid_avg;
  return {
    open: p.frontend_project_status ? p.frontend_project_status === "open" : p.status === "active",
    status,
    bidCount: typeof count === "number" ? count : null,
    bidAvg: typeof avg === "number" ? Math.round(avg) : null,
    currency: p.currency?.code ?? "",
  };
}

/** The single-project endpoint has been seen to return a different project, so the id is checked. */
export function parseLive(payload: any, pid: number): LiveInfo | null {
  const p = payload?.result;
  if (!p || Number(p.id) !== pid) return null;
  return toLive(p);
}

export async function fetchLive(pid: number): Promise<LiveInfo | null> {
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const direct = parseLive(await get(`https://www.freelancer.com/api/projects/0.1/projects/${pid}/`), pid);
  if (direct) return direct;
  const list = await get(`https://www.freelancer.com/api/projects/0.1/projects/?projects[]=${pid}`);
  const match = (list?.result?.projects ?? []).find((p: any) => Number(p.id) === pid);
  return match ? toLive(match) : null;
}
