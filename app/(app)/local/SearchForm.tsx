"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { postJSON } from "@/lib/client/api";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";

/** `initial` is the last search (from its cookie), so the inputs survive opening a business and coming back.
 * The result itself is listed by the page under "Last search". */
export function SearchForm({ initial }: { initial?: { area: string; category: string } }) {
  const router = useRouter();
  const [area, setArea] = useState(initial?.area ?? "");
  const [category, setCategory] = useState(initial?.category ?? "all");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Also the Retry action: it searches with the area and category as they are now. */
  async function search() {
    setBusy(true);
    setError(null);
    try {
      await postJSON("/api/local/search", { area, category });
      // The reply set the last-search cookie; the refreshed page lists what this search added.
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(`Shodh zala nahi — ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function go(e: FormEvent) {
    e.preventDefault();
    void search();
  }

  const working = busy || refreshing;
  const canSearch = !working && area.trim().length >= 2;

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
      <button className="btn btn--primary" disabled={!canSearch}>{working ? "Shodhtoy… (1 minute paryant)" : "Navin shodh"}</button>
      {error ? (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <p className="note" style={{ margin: 0, flex: 1, minWidth: 0 }}>{error}</p>
          <button type="button" className="btn btn--ghost" onClick={search} disabled={!canSearch}>Retry</button>
        </div>
      ) : null}
    </form>
  );
}
