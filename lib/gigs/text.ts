export function decodeEntities(s: unknown): string {
  return String(s ?? "")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Remove tags, decode entities, collapse whitespace. */
export function strip(html: unknown): string {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** ISO string from a date string (unit "iso") or epoch seconds (unit "s"); "" when missing or invalid. */
export function safeIso(value: unknown, unit: "iso" | "s" = "iso"): string {
  if (value === undefined || value === null || value === "") return "";
  const t = unit === "s" ? Number(value) * 1000 : Date.parse(String(value));
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString();
}
