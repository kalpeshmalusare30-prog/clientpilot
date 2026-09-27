"use client";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)" }}>ClientPilot</div>
        <div className="note">Gigs · Local clients · Follow-ups</div>
      </div>
      <label className="field">
        <span className="field__label">Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      <button className="btn btn--primary" disabled={busy || !password}>{busy ? "Checking…" : "Login"}</button>
      {err ? <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p> : null}
    </form>
  );
}
