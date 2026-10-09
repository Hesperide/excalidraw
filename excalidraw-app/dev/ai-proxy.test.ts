import { describe, expect, it } from "vitest";

import { devAIProxy } from "./ai-proxy";

import type { IncomingMessage, ServerResponse } from "node:http";

describe("development AI proxy", () => {
  it("routes requests to loopback and removes only the API prefix", () => {
    expect(devAIProxy.target).toBe("http://127.0.0.1:3016");
    expect(
      devAIProxy.rewrite?.("/api/ai/v1/ai/text-to-diagram/chat-streaming"),
    ).toBe("/v1/ai/text-to-diagram/chat-streaming");
  });

  it.each([
    ["http://localhost:3000", "localhost:3000"],
    ["https://preview.example", "preview.example"],
    [undefined, "localhost:3000"],
  ])("accepts same-origin and CLI requests: %s", (origin, host) => {
    const request = { headers: { origin, host } } as IncomingMessage;
    expect(
      devAIProxy.bypass?.(request, {} as ServerResponse, devAIProxy),
    ).toBeUndefined();
    expect(request.headers.origin).toBe(
      origin ? "http://localhost:3000" : undefined,
    );
  });

  it.each(["https://untrusted.example", "null", "not-a-url"])(
    "rejects cross-origin requests before rewriting: %s",
    (origin) => {
      const request = {
        headers: { origin, host: "preview.example" },
      } as IncomingMessage;
      expect(
        devAIProxy.bypass?.(request, {} as ServerResponse, devAIProxy),
      ).toBe(false);
      expect(request.headers.origin).toBe(origin);
    },
  );
});
