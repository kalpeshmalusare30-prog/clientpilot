/** Lead ids contain ":" and "/" (e.g. "node/123", "weworkremotely:https://..."),
 * so they are base64url-encoded when used as a URL path segment.
 * Uses btoa/atob (not Buffer) so client components can use it too. */
export function toParam(id: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(id)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromParam(param: string): string {
  const b64 = param.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((param.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
