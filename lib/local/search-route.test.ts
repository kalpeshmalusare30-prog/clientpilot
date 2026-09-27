import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));
vi.mock("@/lib/local/search", () => ({ searchLocal: (...a: unknown[]) => searchMock(...a) }));

import { POST } from "@/app/api/local/search/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(() => {
  setStoreForTests(createStore(new MemoryBackend()));
  searchMock.mockReset();
});

const biz = (id: string) => ({
  id, slug: id.replace("/", "-"), name: id, area: "Andheri", catKey: "dentist", catLabel: "dental clinic", addr: "", waNum: "919820011111",
  telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "hi", emailSubject: "s", emailBody: "b", template: "dental", createdAt: "t",
});
const post = (body: unknown, withCookie = true) =>
  POST(new Request("https://x.test/api/local/search", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));

describe("POST /api/local/search", () => {
  it("requires a session and a valid body", async () => {
    expect((await post({ area: "Andheri", category: "all" }, false)).status).toBe(401);
    expect((await post({ area: "", category: "all" })).status).toBe(400);
    expect((await post({ area: "Andheri", category: "nope" })).status).toBe(400);
  });
  it("stores the new businesses and reports counts", async () => {
    searchMock.mockResolvedValue({ added: [biz("node/1"), biz("node/2")], partial: true, scanned: 40, skippedAudits: 3, areaLabel: "Andheri" });
    const res = await post({ area: "Andheri", category: "dental" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, added: 2, partial: true, scanned: 40, skippedAudits: 3, areaLabel: "Andheri" });
    expect((await getStore().readData()).local.map((b) => b.id)).toEqual(["node/1", "node/2"]);
    expect(searchMock.mock.calls[0]![0]).toMatchObject({ area: "Andheri", category: "dental", origin: "https://x.test" });
  });
  it("returns 502 when the search fails", async () => {
    searchMock.mockRejectedValue(new Error('area not found: "Zzz"'));
    const res = await post({ area: "Zzz", category: "all" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/area not found/);
  });
  it("409s while another search runs, and frees the slot afterwards", async () => {
    let finish!: (v: unknown) => void;
    searchMock.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = post({ area: "Andheri", category: "all" });
    await vi.waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
    expect((await post({ area: "Bandra", category: "all" })).status).toBe(409);
    finish({ added: [], partial: false, scanned: 0, skippedAudits: 0, areaLabel: "Andheri" });
    expect((await first).status).toBe(200);
    searchMock.mockResolvedValueOnce({ added: [], partial: false, scanned: 0, skippedAudits: 0, areaLabel: "Bandra" });
    expect((await post({ area: "Bandra", category: "all" })).status).toBe(200);
  });
});
