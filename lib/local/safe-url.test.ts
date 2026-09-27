import { describe, expect, it, vi } from "vitest";
import { isBlockedAddress, publicUrlProblem, urlProblem, type LookupFn } from "./safe-url";

const resolvesTo = (...addresses: string[]): LookupFn & { calls: string[] } => {
  const calls: string[] = [];
  const fn = (async (host: string) => {
    calls.push(host);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  }) as LookupFn & { calls: string[] };
  fn.calls = calls;
  return fn;
};

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.254", "127.0.0.1", "127.9.9.9",
    "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "224.0.0.1", "239.1.1.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "febf::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
    "::ffff:10.0.0.1", "::127.0.0.1", "[::1]", "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "11.0.0.1", "100.63.255.255", "100.128.0.1", "172.15.255.255", "172.32.0.1", "192.169.0.1", "223.255.255.255", "2001:db8::1", "2606:4700::1111"])(
    "allows %s",
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});

describe("urlProblem", () => {
  it.each([
    ["ftp://shop.example/", /http/],
    ["file:///etc/passwd", /http/],
    ["http://shop.example:8080/", /port/],
    ["https://shop.example:22/", /port/],
    ["http://user:pw@shop.example/", /credentials/],
    ["http://localhost/", /private/],
    ["http://LOCALHOST./", /private/],
    ["http://admin.localhost/", /private/],
    ["http://127.0.0.1/", /private/],
    ["http://2130706433/", /private/], // decimal form of 127.0.0.1
    ["http://0x7f.1/", /private/],
    ["http://169.254.169.254/latest/meta-data/", /private/],
    ["http://10.1.2.3/", /private/],
    ["http://192.168.0.10/", /private/],
    ["http://[::1]/", /private/],
    ["http://[::ffff:127.0.0.1]/", /private/],
    ["http://[fd00::5]/", /private/],
    ["https://a.com;https//b.com", /malformed/],
    ["https://a_b.example/", /malformed/],
    ["http://intranet/", /malformed/],
  ])("refuses %s", (u, why) => {
    expect(urlProblem(new URL(u))).toMatch(why);
  });
  it.each(["https://shop.example/", "http://shop.example:80/x", "http://shop.example:443/", "https://www.shop.example./", "http://8.8.8.8/", "http://[2001:db8::1]/", "https://xn--bcher-kva.example/"])(
    "accepts %s",
    (u) => {
      expect(urlProblem(new URL(u))).toBeNull();
    },
  );
});

describe("publicUrlProblem", () => {
  it("resolves the host with all addresses and accepts an all-public answer", async () => {
    const lookup = resolvesTo("93.184.216.34", "2606:2800:220:1::1");
    expect(await publicUrlProblem("https://www.shop.example/a?b=1", { lookup })).toBeNull();
    expect(lookup.calls).toEqual(["www.shop.example"]);
  });
  it("refuses a host if ANY resolved address is private", async () => {
    expect(await publicUrlProblem("https://shop.example/", { lookup: resolvesTo("93.184.216.34", "10.0.0.7") })).toMatch(/private/);
    expect(await publicUrlProblem("https://shop.example/", { lookup: resolvesTo("::ffff:169.254.169.254") })).toMatch(/private/);
  });
  it("refuses a host that resolves to nothing", async () => {
    expect(await publicUrlProblem("https://shop.example/", { lookup: resolvesTo() })).toMatch(/no address/);
  });
  it("does not resolve IP literals or statically refused URLs", async () => {
    const lookup = resolvesTo("93.184.216.34");
    expect(await publicUrlProblem("http://8.8.8.8/", { lookup })).toBeNull();
    expect(await publicUrlProblem("http://127.0.0.1/", { lookup })).toMatch(/private/);
    expect(await publicUrlProblem("http://shop.example:8080/", { lookup })).toMatch(/port/);
    expect(await publicUrlProblem("not a url", { lookup })).toMatch(/invalid/);
    expect(lookup.calls).toEqual([]);
  });
  it("lets lookup errors through so the caller can classify them", async () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND shop.example"), { code: "ENOTFOUND" });
    await expect(publicUrlProblem("https://shop.example/", { lookup: async () => Promise.reject(err) })).rejects.toBe(err);
  });
  it("stops waiting for DNS when the signal aborts", async () => {
    const ctl = new AbortController();
    const hang: LookupFn = () => new Promise(() => {});
    const p = publicUrlProblem("https://shop.example/", { lookup: hang, signal: ctl.signal });
    ctl.abort(new DOMException("deadline", "TimeoutError"));
    await expect(p).rejects.toMatchObject({ name: "TimeoutError" });
    const aborted = AbortSignal.abort(new DOMException("gone", "TimeoutError"));
    const spy = vi.fn(hang);
    await expect(publicUrlProblem("https://shop.example/", { lookup: spy, signal: aborted })).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
