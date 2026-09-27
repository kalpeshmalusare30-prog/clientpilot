"use client";
import { useState } from "react";
import { postJSON, putJSON } from "@/lib/client/api";
import { DEFAULT_ALLOWED_LINKS } from "@/lib/defaults";
import type { Settings } from "@/lib/types";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [links, setLinks] = useState(initial.allowedLinks.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const allowedLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
      await putJSON("/api/settings", { ...s, allowedLinks });
      setMsg("Saved");
    } catch (e) {
      setMsg((e as Error).message);
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
      {msg ? <div className="toast" role="status">{msg}</div> : null}
    </div>
  );
}
