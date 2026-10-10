/** Progress ring (inline SVG). `value` over `goal`; the arc fills once the goal is reached and the count keeps going. */
export function Ring({ value, goal, label, size = 92 }: { value: number; goal: number; label: string; size?: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <div
      className={`ring${pct >= 1 ? " ring--done" : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${value} / ${goal}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle className="ring__track" cx="50" cy="50" r={r} />
        <circle
          className="ring__arc"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={circ}
          style={{ ["--ring-off" as string]: String(circ * (1 - pct)), ["--ring-len" as string]: String(circ) }}
        />
      </svg>
      <div className="ring__center" aria-hidden="true">
        <span className="ring__n">{value}</span>
        <span className="ring__of">/{goal}</span>
      </div>
    </div>
  );
}
