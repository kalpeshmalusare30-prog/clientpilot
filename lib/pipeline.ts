import { leadHref } from "./dashboard";
import { toParam } from "./ids";
import type { DataDoc, GigsDoc, LeadKind, Status } from "./types";

export const PIPELINE_STAGES = ["drafted", "sent", "replied", "won", "lost"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface PipelineItem {
  id: string;
  param: string;
  kind: LeadKind;
  title: string;
  sub: string;
  status: Status;
  followUpAt?: string;
  notes?: string;
  /** Detail page, or null when the lead's record is gone (an old gig dropped from gigs.json): that page would 404. */
  href: string | null;
}

const due = (i: PipelineItem) => (i.followUpAt ? Date.parse(i.followUpAt) : Number.MAX_SAFE_INTEGER);

export function buildPipeline(gigs: GigsDoc, data: DataDoc): Record<PipelineStage, PipelineItem[]> {
  const out = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as PipelineItem[]])) as Record<PipelineStage, PipelineItem[]>;
  const gigById = new Map(gigs.items.map((g) => [g.id, g]));
  const bizById = new Map(data.local.map((b) => [b.id, b]));
  for (const [id, s] of Object.entries(data.state)) {
    if (!(PIPELINE_STAGES as readonly string[]).includes(s.status)) continue;
    const gig = s.kind === "gig" ? gigById.get(id) : undefined;
    const biz = s.kind === "local" ? bizById.get(id) : undefined;
    // A gig id is "<source>:<source id>", so a gig whose record is gone still names its source.
    const sub = s.kind === "gig"
      ? s.bidAmount ? `Bid ${s.bidCurrency ?? ""} ${s.bidAmount}`.replace(/\s+/g, " ") : gig?.source ?? (id.split(":")[0] || "gig")
      : biz ? `${biz.catLabel} · ${biz.area}` : "local";
    out[s.status as PipelineStage].push({
      id, param: toParam(id), kind: s.kind, title: gig?.title ?? biz?.name ?? id, sub, status: s.status,
      followUpAt: s.followUpAt, notes: s.notes, href: gig || biz ? leadHref(s.kind, id) : null,
    });
  }
  for (const k of PIPELINE_STAGES) out[k].sort((a, b) => due(a) - due(b));
  return out;
}
