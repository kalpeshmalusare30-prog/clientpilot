"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { celebrate } from "@/components/ui/celebrate";
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
      const j = (await patchState(p.param, p.kind, action)) as { state?: { status?: string } };
      setLast(null);
      // Celebrate only what the server stored: a lead that is now Won.
      if (action.type === "stage" && j.state?.status === "won" && p.status !== "won") celebrate("Client zala! Abhinandan");
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
    <div className="controls">
      <div className="controls__row">
        <select className="field__input stage-select" aria-label="Stage" style={{ ["--c" as string]: `var(--st-${p.status})` }} value={p.status} disabled={busy} onChange={(e) => act({ type: "stage", status: e.target.value })}>
          {["drafted", "sent", "replied", "won", "lost", "skipped"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="field__input" type="datetime-local" aria-label="Follow-up" value={when} disabled={busy} onChange={(e) => setWhen(e.target.value)} />
      </div>
      {pending || p.followUpAt ? (
        <div className="controls__actions">
          {pending ? <button className="btn btn--primary" disabled={busy} onClick={() => act(pending)}>Set follow-up</button> : null}
          {p.followUpAt && !pending ? (
            <button className="btn btn--quiet" disabled={busy} onClick={() => act({ type: "followUp", followUpAt: null })}>Clear follow-up</button>
          ) : null}
        </div>
      ) : null}
      <div className="controls__row controls__row--note">
        <input className="field__input" placeholder="Note" aria-label="Note" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== p.notes ? <button className="btn" disabled={busy} onClick={() => act({ type: "notes", notes })}>Save</button> : null}
      </div>
      {err ? (
        <div className="inline-error" role="alert">
          <p>{err}</p>
          {last ? <button className="btn btn--ghost" disabled={busy} onClick={() => act(last)}>Retry</button> : null}
        </div>
      ) : null}
    </div>
  );
}
