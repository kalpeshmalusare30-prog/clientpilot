"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        window.location.href = "/";
        return;
      }
      setErr(j.error ?? `Login failed (${res.status})`);
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <div className="login__brand">
        <span className="brand-mark"><Icon name="plane" size={28} /></span>
        <div>
          <h1 className="login__title">ClientPilot</h1>
          <p className="note" style={{ marginTop: 4 }}>Gigs, local clients ani follow-ups. Ekach jagi.</p>
        </div>
      </div>
      <label className="field">
        <span className="field__label">Password</span>
        <input type={show ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      <label className="check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Password dakhav
      </label>
      <button className="btn btn--primary btn--lg btn--block" disabled={busy || !password}>{busy ? "Checking…" : "Login"}</button>
      {err ? <p className="login__error" role="alert"><Icon name="alert" size={16} />{err}</p> : null}
    </form>
  );
}
