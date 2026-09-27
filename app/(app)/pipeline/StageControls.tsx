"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { patchState } from "@/lib/client/api";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StageControls(p: { param: string; kind: "gig" | "local"; status: string; followUpAt: string; notes: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(p.notes);
  // Filled after mount: the server (UTC) and the phone (IST) would format the local time differently.
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setWhen(p.followUpAt ? toLocalInput(p.followUpAt) : ""), [p.followUpAt]);

  async function act(action: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      await patchState(p.param, p.kind, action);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <select className="field__input" value={p.status} disabled={busy} onChange={(e) => act({ type: "stage", status: e.target.value })}>
          {["drafted", "sent", "replied", "won", "lost", "skipped"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          className="field__input"
          type="datetime-local"
          value={when}
          disabled={busy}
          onChange={(e) => {
            setWhen(e.target.value);
            act({ type: "followUp", followUpAt: e.target.value ? new Date(e.target.value).toISOString() : null });
          }}
        />
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <input className="field__input" style={{ flex: 1 }} placeholder="Note" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== p.notes ? <button className="btn" disabled={busy} onClick={() => act({ type: "notes", notes })}>Save</button> : null}
      </div>
      {err ? <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p> : null}
    </div>
  );
}
