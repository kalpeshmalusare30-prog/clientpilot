"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { patchState } from "@/lib/client/api";
import { followUpActionFor, notSaved, revertFollowUpInput } from "@/lib/client-forms";

type Action = Record<string, unknown>;

export function StageControls(p: { param: string; kind: "gig" | "local"; status: string; followUpAt: string; notes: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(p.notes);
  // Filled after mount: the server (UTC) and the phone (IST) would format the local time differently.
  const [when, setWhen] = useState("");
  const [stored, setStored] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState<Action | null>(null);
  useEffect(() => {
    const v = revertFollowUpInput(p.followUpAt);
    setWhen(v);
    setStored(v);
  }, [p.followUpAt]);

  async function act(action: Action) {
    setBusy(true);
    setErr("");
    setLast(action);
    try {
      await patchState(p.param, p.kind, action);
      setLast(null);
      router.refresh();
    } catch (e) {
      // The UI never shows what was not stored: the picker goes back to the saved date.
      setWhen(revertFollowUpInput(p.followUpAt));
      setErr(notSaved(e));
    } finally {
      setBusy(false);
    }
  }

  // A picker value is written only when complete and set on purpose; a blank/half-typed value never clears it.
  const pending = when !== stored ? followUpActionFor(when) : null;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <select className="field__input" value={p.status} disabled={busy} onChange={(e) => act({ type: "stage", status: e.target.value })}>
          {["drafted", "sent", "replied", "won", "lost", "skipped"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="field__input" type="datetime-local" value={when} disabled={busy} onChange={(e) => setWhen(e.target.value)} />
        {pending ? <button className="btn" disabled={busy} onClick={() => act(pending)}>Set</button> : null}
        {p.followUpAt && !pending ? (
          <button className="btn btn--ghost" disabled={busy} onClick={() => act({ type: "followUp", followUpAt: null })}>Clear</button>
        ) : null}
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <input className="field__input" style={{ flex: 1 }} placeholder="Note" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== p.notes ? <button className="btn" disabled={busy} onClick={() => act({ type: "notes", notes })}>Save</button> : null}
      </div>
      {err ? (
        <div className="btn-row" style={{ marginTop: 0, alignItems: "center" }} role="alert">
          <p style={{ color: "var(--danger)", margin: 0, flex: 1 }}>{err}</p>
          {last ? <button className="btn btn--ghost" disabled={busy} onClick={() => act(last)}>Retry</button> : null}
        </div>
      ) : null}
    </div>
  );
}
