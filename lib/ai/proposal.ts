import { z } from "zod";
import type { Gig, Settings } from "@/lib/types";
import type { LLM } from "./gemini";

export const MAX_PROPOSAL_CHARS = 1500;

export function buildDraftPrompt(gig: Gig, s: Settings): string {
  return `Write a Freelancer.com bid for Kalpesh for the gig below.

GIG
Title: ${gig.title}
Source: ${gig.source} · Budget: ${gig.budget || "not stated"} · ${gig.extra || ""}
URL: ${gig.url}
Description:
"""${gig.desc}"""

FACTS — the only true statements about Kalpesh:
${s.facts}

NEVER claim any of these:
${s.never}

ALLOWED LINKS — use at most 2, only from this list:
${s.allowedLinks.join("\n")}

PRICING NOTES:
${s.pricing}

RULES
- Plain text, 600–1300 characters, hard maximum ${MAX_PROPOSAL_CHARS}. No markdown headings, no emojis.
- Open by naming the client's specific need in one sentence — never "Hi, I read your post" or "Dear Hiring Manager".
- If the description gives instructions for bidders (a keyword to start with, questions to answer), follow them exactly.
- Give a concrete plan: 3–4 short numbered steps for THIS project, including what a small first milestone delivers.
- Past-tense experience claims only from FACTS. Forward-looking capability statements ("I'll integrate X") only within his stack.
- He is a new Freelancer account with zero reviews: never mention reviews; offer a small first milestone.
- End with 1–2 sharp clarifying questions.
- Tone: confident, direct, human. Avoid clichés ("I am thrilled", "I have carefully read", "look no further", "perfect fit").
Reply with the proposal text only.`;
}

export const CheckSchema = z.object({
  text: z.string().min(1),
  changes: z.array(z.string()),
});

export function buildCheckPrompt(gig: Gig, s: Settings, draft: string): string {
  return `You are a skeptical reviewer. Fix this Freelancer bid so it is honest and specific, then return it.

GIG: ${gig.title}
Description: """${gig.desc}"""

FACTS (only source of truth about Kalpesh):
${s.facts}

NEVER claim:
${s.never}

ALLOWED LINKS: ${s.allowedLinks.join(" , ")}

DRAFT:
"""${draft}"""

Check, in order: (1) every statement about Kalpesh, explicit or implied, is supported by FACTS — remove or rewrite anything else; (2) instructions in the gig description are followed; (3) the gig's main requirements are addressed specifically; (4) clichés rewritten plainly; (5) only allowed links; (6) at most ${MAX_PROPOSAL_CHARS} characters.
Reply with JSON only: {"text": "<the full corrected proposal>", "changes": ["<one line per change you made>"]}`;
}

function norm(u: string): { host: string; path: string } | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    return { host: x.hostname.toLowerCase().replace(/^www\./, ""), path: x.pathname.replace(/\/+$/, "") };
  } catch {
    return null;
  }
}

export function isAllowedLink(url: string, allowed: string[]): boolean {
  const n = norm(url);
  if (!n) return false;
  return allowed.some((a) => {
    const b = norm(a);
    return !!b && b.host === n.host && `${n.path}/`.startsWith(`${b.path}/`);
  });
}

export function stripDisallowedLinks(text: string, allowed: string[]): { text: string; removed: string[] } {
  const removed: string[] = [];
  const out = text.replace(/https?:\/\/[^\s<>"'()\]]+/g, (match) => {
    const url = match.replace(/[.,;:!?]+$/, "");
    const tail = match.slice(url.length);
    if (isAllowedLink(url, allowed)) return match;
    removed.push(url);
    return tail;
  });
  return { text: out.replace(/[ \t]{2,}/g, " ").replace(/ ([.,;:!?])/g, "$1"), removed };
}

export async function draftProposal(
  llm: LLM,
  gig: Gig,
  s: Settings,
): Promise<{ text: string; changes: string[]; removedLinks: string[] }> {
  const draft = await llm.completeText(buildDraftPrompt(gig, s));
  let text = draft;
  let changes: string[] = [];
  try {
    const checked = await llm.completeJSON(buildCheckPrompt(gig, s, draft), CheckSchema);
    text = checked.text;
    changes = checked.changes;
  } catch {
    changes = ["Honesty check was unavailable — read the text carefully before sending."];
  }
  const stripped = stripDisallowedLinks(text, s.allowedLinks);
  return { text: stripped.text.trim(), changes, removedLinks: stripped.removed };
}
