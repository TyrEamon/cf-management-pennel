import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareClient } from "../src/cf/cf-client";

const env = {
  CLOUDFLARE_API_BASE_URL: "https://api.example.test/client/v4",
  CF_API_MIN_DELAY_MS: "0",
  CF_API_MAX_RETRIES: "0",
};

describe("CloudflareClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads R2 buckets from the Cloudflare buckets envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        errors: [],
        messages: [],
        result: {
          buckets: [
            { name: "assets", creation_date: "2026-06-26T00:00:00Z" },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CloudflareClient(env, "token");
    await expect(client.listR2Buckets("account-id")).resolves.toEqual([
      { name: "assets", creation_date: "2026-06-26T00:00:00Z" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/client/v4/accounts/account-id/r2/buckets",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer token" }),
      }),
    );
  });

  it("treats an account without R2 enabled as an empty bucket list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({
        success: false,
        errors: [{ code: 10001, message: "R2 is not enabled for this account" }],
        messages: [],
        result: null,
      }, { status: 403 }),
    ));

    const client = new CloudflareClient(env, "token");
    await expect(client.listR2Buckets("account-id")).resolves.toEqual([]);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json" },
  });
}
