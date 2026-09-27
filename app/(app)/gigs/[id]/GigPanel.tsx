"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getJSON, patchState, postJSON } from "@/lib/client/api";
import { describeProposal, limitWarning, type ProposalReply } from "@/lib/gigs/view";

type Live = { open: boolean; status: string; bidCount: number | null; bidAvg: number | null; currency: string };
type ActionKey = "ai" | "save" | "copy" | "live" | "bid" | "skip";

/** What a failed action says before the error. Every action that writes says it was not saved (spec: "not saved, retry"). */
const FAILED: Record<ActionKey, string> = {
  ai: "AI proposal ala nahi",
  live: "Live check zala nahi",
  copy: "Copy zala nahi",
  save: "Save zala nahi",
  bid: "Bid save zala nahi",
  skip: "Skip save zala nahi",
};

/** ok/warn toasts clear themselves so they never sit over the buttons; an error stays, with Retry, until closed. */
type Toast = { text: string; tone: "ok" | "warn" | "error"; retry?: ActionKey };
const TOAST_MS = { ok: 3500, warn: 7000 } as const;

export function GigPanel(props: {
  id: string;
  param: string;
  url: string;
  isFreelancer: boolean;
  initialProposal: string;
  status: string;
  defaultCurrency: string;
  maxChars: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(props.initialProposal);
  const [saved, setSaved] = useState(props.initialProposal);
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(props.defaultCurrency);
  const max = props.maxChars;
  const over = limitWarning(text.length, max);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const t = setTimeout(() => setToast(null), TOAST_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast]);

  async function run(key: ActionKey, fn: () => Promise<void>) {
    setBusy(key);
    setToast(null);
    try {
      await fn();
    } catch (e) {
      setToast({ text: `${FAILED[key]} — ${(e as Error).message}`, tone: "error", retry: key });
    } finally {
      setBusy(null);
    }
  }

  const draft = () =>
    run("ai", async () => {
      const r = (await postJSON("/api/ai/proposal", { id: props.id })) as unknown as ProposalReply;
      const v = describeProposal(r, max);
      setText(r.text);
      setSaved(r.text);
      setChanges(v.notes);
      if (v.warning) setToast({ text: v.warning, tone: "warn" });
      router.refresh();
    });

  const save = () =>
    run("save", async () => {
      await patchState(props.param, "gig", { type: "proposal", proposal: text });
      setSaved(text);
      setToast({ text: "Saved", tone: "ok" });
      router.refresh();
    });

  const copy = () =>
    run("copy", async () => {
      await navigator.clipboard.writeText(text);
      setToast(
        over
          ? { text: "Copied — pan limit peksha mothi ahe, adhi kami kar", tone: "warn" }
          : { text: props.isFreelancer ? "Copied — ata Freelancer app madhe paste kar" : "Copied", tone: "ok" },
      );
    });

  const checkLive = () =>
    run("live", async () => {
      const j = (await getJSON(`/api/gigs/${props.param}/live`)) as unknown as { live: Live };
      setLive(j.live);
    });

  const bid = () => {
    // "18,000" is how amounts are usually written here.
    const n = Number(amount.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setToast({ text: "Bid amount tak", tone: "warn" });
      return;
    }
    void run("bid", async () => {
      await patchState(props.param, "gig", { type: "bid", amount: n, currency });
      setToast({ text: "Bid saved · follow-up 3 divasani", tone: "ok" });
      router.refresh();
    });
  };

  const skip = () =>
    run("skip", async () => {
      await patchState(props.param, "gig", { type: "skip" });
      router.push("/gigs");
    });

  /** Retry calls the action as it is now, so it uses the current text, amount and currency. */
  const actions: Record<ActionKey, () => void> = { ai: draft, save, copy, live: checkLive, bid, skip };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {props.isFreelancer ? (
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="btn btn--ghost" onClick={checkLive} disabled={!!busy}>{busy === "live" ? "Checking…" : "Live check"}</button>
          {live ? (
            <span className="note" style={{ alignSelf: "center" }}>
              {live.open ? "Open" : `Closed (${live.status})`} · {live.bidCount ?? "?"} bids{live.bidAvg ? ` · avg ${live.currency} ${live.bidAvg}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="btn-row">
        <button className="btn btn--primary" onClick={draft} disabled={!!busy}>{busy === "ai" ? "AI lihitoy… (30 s paryant)" : text ? "AI proposal parat lihi" : "AI proposal lihi"}</button>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span className="field__label">Proposal</span>
        <textarea className="textarea-lg" value={text} onChange={(e) => setText(e.target.value)} placeholder="AI proposal lihi dab, kinva swatah lihi." />
      </label>
      <div className={`counter${over ? " counter--over" : ""}`}>{text.length}/{max}</div>
      {over ? <p className="limit-alert" role="alert">{over}</p> : null}
      {changes.length ? (
        <details className="note"><summary>AI ne kay sudharla ({changes.length})</summary><ul>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul></details>
      ) : null}

      <div className="btn-row">
        {text !== saved ? <button className="btn" onClick={save} disabled={!!busy}>Save edits</button> : null}
        <button className="btn" onClick={copy} disabled={!text || !!busy}>Copy</button>
        {props.url ? (
          <a className="btn" href={props.url} target="_blank" rel="noopener noreferrer">{props.isFreelancer ? "Open in Freelancer" : "Open post"}</a>
        ) : null}
      </div>

      <div className="section-label">Bid lavla?</div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <input className="field__input" style={{ flex: 1, minWidth: 110 }} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="field__input" style={{ width: 92 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {["INR", "USD", "EUR", "GBP", "AUD", "CAD"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn btn--ok" onClick={bid} disabled={!!busy}>Bid kela</button>
      </div>
      <div className="btn-row">
        <button className="btn btn--ghost" onClick={skip} disabled={!!busy}>Skip</button>
      </div>
      {toast ? (
        <div className={`toast toast--${toast.tone}`} role={toast.tone === "ok" ? "status" : "alert"}>
          <span className="toast__text">{toast.text}</span>
          {toast.retry ? <button className="btn btn--ghost toast__btn" onClick={actions[toast.retry]} disabled={!!busy}>Retry</button> : null}
          {toast.tone === "error" ? <button className="toast__close" onClick={() => setToast(null)} aria-label="Close">✕</button> : null}
        </div>
      ) : null}
    </div>
  );
}
