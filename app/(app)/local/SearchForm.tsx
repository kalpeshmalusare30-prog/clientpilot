"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJSON } from "@/lib/client/api";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";
import { searchSummary, type SearchReply } from "@/lib/local/view";

export function SearchForm() {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  /** Also the Retry action: it searches with the area and category as they are now. */
  async function search() {
    setBusy(true);
    setMsg(null);
    try {
      const j = (await postJSON("/api/local/search", { area, category })) as unknown as SearchReply;
      setMsg({ text: searchSummary(j), error: false });
      router.refresh();
    } catch (err) {
      setMsg({ text: `Shodh zala nahi — ${(err as Error).message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  function go(e: FormEvent) {
    e.preventDefault();
    void search();
  }

  const canSearch = !busy && area.trim().length >= 2;

  return (
    <form className="card" onSubmit={go} style={{ display: "grid", gap: 10 }}>
      <label className="field">
        <span className="field__label">Area</span>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Andheri, Mumbai" />
      </label>
      <label className="field">
        <span className="field__label">Prakar</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <button className="btn btn--primary" disabled={!canSearch}>{busy ? "Shodhtoy… (1 minute paryant)" : "Navin shodh"}</button>
      {msg ? (
        <div role={msg.error ? "alert" : "status"} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="note" style={{ margin: 0, flex: 1, minWidth: 0 }}>{msg.text}</p>
          {msg.error ? <button type="button" className="btn btn--ghost" onClick={search} disabled={!canSearch}>Retry</button> : null}
        </div>
      ) : null}
    </form>
  );
}
