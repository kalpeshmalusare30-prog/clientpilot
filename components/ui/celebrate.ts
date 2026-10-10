// A small burst of CSS confetti plus a cheerful toast, appended straight to <body> so it survives the
// router.refresh() that moves the card to its new stage. Text goes in through textContent only.
// Call it only after the server has stored the status it celebrates.

const COLORS = ["var(--accent)", "var(--st-won)", "var(--st-drafted)", "var(--st-sent)", "#facc15", "var(--st-lost)"];
const TOAST_MS = 4200;
const CONFETTI_MS = 2400;

export function celebrate(message: string): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".toast--win").forEach((el) => el.remove());

  const toast = document.createElement("div");
  toast.className = "toast toast--win";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.className = "toast__text";
  text.textContent = message;
  toast.append(text);
  document.body.append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 42; i++) {
    const p = document.createElement("i");
    const angle = (Math.random() * 120 - 150) * (Math.PI / 180); // mostly upwards, fanned out
    const power = 260 + Math.random() * 280;
    p.style.setProperty("--dx", `${Math.cos(angle) * power}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * power}px`);
    p.style.setProperty("--rot", `${Math.round(Math.random() * 720 - 360)}deg`);
    p.style.setProperty("--delay", `${Math.round(Math.random() * 120)}ms`);
    p.style.background = COLORS[i % COLORS.length]!;
    if (i % 3 === 0) p.style.borderRadius = "50%";
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), CONFETTI_MS);
}
