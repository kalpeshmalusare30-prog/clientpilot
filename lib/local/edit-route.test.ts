import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/local/[id]/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { toParam } from "@/lib/ids";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { LocalBiz } from "@/lib/types";

let cookie = "";
const A9: LocalBiz = {
  id: "node/12395684120", slug: "a9-digital-prints", name: "A9 Digital Prints", area: "Andheri", catKey: "copyshop", catLabel: "print shop",
  addr: "", waNum: "919322214085", telNum: "", phoneDisplay: "+91 93222 14085", email: "sales@a9digitalprints.com", website: "", social: "",
  segment: "no_website", evidence: "", whatsapp: "old", emailSubject: "old", emailBody: "old", template: "print", createdAt: "t",
};
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(async () => {
  const s = createStore(new MemoryBackend());
  await s.mutateData((d) => ({ ...d, local: [A9] }));
  setStoreForTests(s);
});

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`https://x.test/api/local/${toParam(id)}`, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: toParam(id) }) },
  );

describe("PATCH /api/local/[id]", () => {
  it("404s for an unknown business", async () => {
    expect((await patch("node/1", { whatsapp: "x" })).status).toBe(404);
  });
  it("edits fields", async () => {
    const res = await patch(A9.id, { whatsapp: "new text", template: "general" });
    expect(res.status).toBe(200);
    const b = (await getStore().readData()).local[0]!;
    expect(b.whatsapp).toBe("new text");
    expect(b.template).toBe("general");
  });
  it("regenerates messages from the settings template with the demo link", async () => {
    await patch(A9.id, { regenerate: true });
    const b = (await getStore().readData()).local[0]!;
    expect(b.whatsapp).toContain("https://x.test/d/a9-digital-prints");
    expect(b.emailSubject).toBe("A free demo website for A9 Digital Prints");
  });
  it("rejects bad input", async () => {
    expect((await patch(A9.id, { template: "castle" })).status).toBe(400);
    expect((await patch(A9.id, { waNum: "abc" })).status).toBe(400);
  });
  it("400s for a malformed id instead of throwing", async () => {
    const res = await PATCH(
      new Request("https://x.test/api/local/!!!", { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: "{}" }),
      { params: Promise.resolve({ id: "!!!" }) },
    );
    expect(res.status).toBe(400);
  });
});
