"use client";
import { useEffect, useState } from "react";
import { postJSON, putJSON } from "@/lib/client/api";
import { settingsResult } from "@/lib/client-forms";
import { DEFAULT_ALLOWED_LINKS } from "@/lib/defaults";
import type { Settings } from "@/lib/types";

type Result = ReturnType<typeof settingsResult>;

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [links, setLinks] = useState(initial.allowedLinks.join("\n"));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // "Saved" clears itself; an error stays until closed or retried.
  useEffect(() => {
    if (!result?.clearAfterMs) return;
    const t = setTimeout(() => setResult(null), result.clearAfterMs);
    return () => clearTimeout(t);
  }, [result]);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const allowedLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
      await putJSON("/api/settings", { ...s, allowedLinks });
      setResult(settingsResult(null));
    } catch (e) {
      setResult(settingsResult(e));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await postJSON("/api/logout", {}).catch(() => {});
    window.location.href = "/login";
  }

  const area = (key: "facts" | "never" | "pricing" | "waTemplate", label: string, hint: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <textarea className="textarea-lg" value={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
      <span className="note">{hint}</span>
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {area("facts", "Facts (AI fakt hech vaparel)", "Tuzya baddal khari mahiti. Navin project/experience aala ki ithe jod.")}
      {area("never", "Kadhich claim karu naye", "Ek line = ek gosht.")}
      <label className="field">
        <span className="field__label">Allowed links</span>
        <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={4} />
        <span className="note">
          Ek line = ek link. Proposal madhe fakt hech links rahtil. Fakt {DEFAULT_ALLOWED_LINKS.join(", ")} kiva tyanche subpaths chaltat.
        </span>
      </label>
      {area("pricing", "Pricing notes", "AI bid amount suchavtana he vachte.")}
      {area("waTemplate", "WhatsApp template", "Placeholders: {intro} {name} {area} {category} {benefit} {demo_line}. Juni messages 'Message parat banva' ne update hotat.")}
      <div className="btn-row">
        <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn btn--ghost" onClick={logout}>Logout</button>
      </div>
      {/* Inline under the buttons, never a fixed toast over them. */}
      {result ? (
        <div className="btn-row" style={{ marginTop: 0, alignItems: "center" }}>
          <p className="note" role={result.role} style={{ margin: 0, flex: 1, color: result.role === "alert" ? "var(--danger)" : undefined }}>{result.text}</p>
          <button className="btn btn--ghost" onClick={() => setResult(null)} aria-label="Close">✕</button>
        </div>
      ) : null}
    </div>
  );
}
