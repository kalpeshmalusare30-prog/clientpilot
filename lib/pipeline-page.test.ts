import { isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/page", () => ({ requirePageSession: async () => {} }));
// StageControls calls useRouter(), which needs a mounted app router; everything else in next/navigation stays real.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {}, push() {} }),
}));

import PipelinePage from "@/app/(app)/pipeline/page";
import { toParam } from "@/lib/ids";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { Gig, LeadState, LocalBiz } from "@/lib/types";

type El = ReactElement<{ children?: ReactNode; className?: string; href?: string; style?: CSSProperties } & Record<string, unknown>>;

function* walk(node: ReactNode): Generator<El> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n as ReactNode);
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as El;
  yield el;
  yield* walk(el.props.children);
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => text(n as ReactNode)).join("");
  if (isValidElement(node)) return text((node as El).props.children);
  return "";
}

const hasClass = (el: El, c: string) => String(el.props.className ?? "").split(/\s+/).includes(c);

const gig = { id: "freelancer.com:1", source: "freelancer.com", title: "Marketplace MVP" } as Gig;
const biz = { id: "node/1", name: "A9 Digital Prints", catLabel: "print shop", area: "Andheri" } as LocalBiz;
const st = (kind: LeadState["kind"], status: LeadState["status"]): LeadState => ({ kind, status, updatedAt: "2026-09-27T00:00:00.000Z" });

beforeEach(async () => {
  const s = createStore(new MemoryBackend());
  await s.mutateGigs((g) => ({ ...g, items: [gig] }));
  await s.mutateData((d) => ({
    ...d,
    local: [biz],
    state: {
      "freelancer.com:1": st("gig", "sent"),
      "node/1": st("local", "sent"),
      // Acted on long ago: gigs.json no longer holds this gig (pinning is capped).
      "weworkremotely:https://weworkremotely.com/remote-jobs/acme-senior-full-stack-developer-react-node": st("gig", "replied"),
    },
  }));
  setStoreForTests(s);
});

describe("Pipeline page", () => {
  it("links leads that have a record and shows a gone gig by its id, as plain text, without crashing", async () => {
    const tree = await PipelinePage();
    const topics = [...walk(tree)].filter((el) => hasClass(el, "list-row__topic"));
    expect(topics.map((t) => [text(t.props.children), t.props.href])).toEqual([
      ["Marketplace MVP", `/gigs/${toParam("freelancer.com:1")}`],
      ["A9 Digital Prints", `/local/${toParam("node/1")}`],
      ["weworkremotely:https://weworkremotely.com/remote-jobs/acme-senior-full-stack-developer-react-node", undefined],
    ]);
  });

  it("makes each title a block so a long title is cut with an ellipsis instead of widening the card", async () => {
    const tree = await PipelinePage();
    const topics = [...walk(tree)].filter((el) => hasClass(el, "list-row__topic"));
    expect(topics).toHaveLength(3);
    for (const t of topics) expect(t.props.style).toMatchObject({ display: "block" });
  });
});
