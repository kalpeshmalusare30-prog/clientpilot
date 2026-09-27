/** The only icon sizes the app uses (apple 180, manifest 192/512). Anything else snaps to the nearest one, so a
 * public /pwa-icon?size=… cannot force a fresh render per value. */
export const ICON_SIZES = [180, 192, 512] as const;

export function iconSize(raw: string | null): number {
  const n = Number(raw ?? 512);
  if (!Number.isFinite(n)) return 512;
  return ICON_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 512);
}
