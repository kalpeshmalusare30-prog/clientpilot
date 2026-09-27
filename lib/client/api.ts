/** Browser helpers for the JSON API. Each throws Error(message) on a non-OK response. */
async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { ok?: boolean; error?: string };
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Logged out");
  }
  if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export const postJSON = (url: string, body: unknown) => send("POST", url, body);
export const patchJSON = (url: string, body: unknown) => send("PATCH", url, body);
export const putJSON = (url: string, body: unknown) => send("PUT", url, body);
export const getJSON = (url: string) => send("GET", url);

export function patchState(param: string, kind: "gig" | "local", action: Record<string, unknown>) {
  return patchJSON(`/api/state/${param}?kind=${kind}`, action);
}
