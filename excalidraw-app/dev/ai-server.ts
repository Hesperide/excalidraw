import { createServer } from "node:http";

import type { IncomingMessage } from "node:http";

const GENERATE_PATH = "/v1/ai/text-to-diagram/chat-streaming";
const MAX_BODY_BYTES = 32 * 1024;

const SYSTEM_PROMPT = `Generate a Mermaid diagram for an editable Excalidraw canvas.
Return only valid Mermaid source, without Markdown fences or explanations.
Use flowchart TD or flowchart LR with short quoted node labels and simple arrows.
Use descriptive node IDs. Avoid HTML, links, click handlers, icons and directives.
When revising a diagram, return the complete revised source.`;

type Message = { role: "user" | "assistant"; content: string };

type Options = {
  apiKey?: string;
  allowedOrigins: string[];
  model?: string;
  requestLimit?: number;
  timeoutMs?: number;
  fetchProvider?: typeof fetch;
};

class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function readMessages(request: IncomingMessage): Promise<Message[]> {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") {
    throw new RequestError(415, "Send application/json.");
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new RequestError(413, "Request is too large.");
    }
    chunks.push(chunk);
  }
  let messages;
  try {
    messages = JSON.parse(Buffer.concat(chunks).toString("utf8")).messages;
  } catch {
    throw new RequestError(400, "Invalid JSON.");
  }
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 20 ||
    messages.at(-1)?.role !== "user" ||
    !messages.every(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string" &&
        message.content.trim().length > 0 &&
        message.content.length <= 8000,
    )
  ) {
    throw new RequestError(400, "Invalid diagram messages.");
  }
  // Do not forward client-provided provider options or additional fields.
  return messages.map(({ role, content }) => ({ role, content }));
}

/** Local development only. Bind to loopback; never expose as a public AI API. */
export function createDevAIServer({
  apiKey,
  allowedOrigins,
  model = "gpt-4.1-mini",
  requestLimit = 20,
  timeoutMs = 60_000,
  fetchProvider = fetch,
}: Options) {
  if (!Number.isInteger(requestLimit) || requestLimit < 1) {
    throw new Error("requestLimit must be a positive integer.");
  }
  let remaining = requestLimit;
  let busy = false;

  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ownsSlot = false;
    try {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(apiKey ? 200 : 503, {
          "Content-Type": "application/json",
        });
        response.end(JSON.stringify({ ready: Boolean(apiKey), remaining }));
        return;
      }
      if (request.url !== GENERATE_PATH) {
        throw new RequestError(404, "Not found.");
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        throw new RequestError(405, "Use POST.");
      }
      // No CORS: only explicitly allowed browser origins, plus local CLI calls.
      if (
        request.headers.origin &&
        !allowedOrigins.includes(request.headers.origin)
      ) {
        throw new RequestError(403, "Origin is not allowed.");
      }
      if (!apiKey) {
        throw new RequestError(
          503,
          "Set OPENAI_API_KEY on the development server.",
        );
      }
      const messages = await readMessages(request);
      response.setHeader("X-Ratelimit-Limit", requestLimit);
      response.setHeader("X-Ratelimit-Remaining", remaining);
      if (busy || remaining === 0) {
        throw new RequestError(
          429,
          busy
            ? "A generation is already running."
            : "Development request budget exhausted.",
        );
      }
      busy = true;
      ownsSlot = true;
      remaining--;
      response.setHeader("X-Ratelimit-Remaining", remaining);
      controller = new AbortController();
      response.once("close", () => controller?.abort());
      timer = setTimeout(() => controller?.abort(), timeoutMs);
      const upstream = await fetchProvider(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            max_completion_tokens: 4096,
          }),
        },
      );
      if (!upstream.ok) {
        await upstream.body?.cancel();
        throw new RequestError(
          upstream.status === 429 ? 429 : 502,
          `AI provider returned HTTP ${upstream.status}. Check server credentials, model access and quota.`,
        );
      }
      const result = await upstream.json();
      const choice = result.choices?.[0];
      const content = choice?.message?.content;
      if (
        choice?.finish_reason !== "stop" ||
        typeof content !== "string" ||
        !content.trim()
      ) {
        throw new RequestError(
          502,
          "AI provider did not return a complete diagram.",
        );
      }
      // Buffer the provider result so incomplete output is never sent as success.
      // The existing client consumes this content/done SSE contract.
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      });
      response.end(
        `data: ${JSON.stringify({ type: "content", delta: content })}\n\n` +
          `data: ${JSON.stringify({ type: "done", finishReason: "stop" })}\n\n`,
      );
    } catch (error) {
      if (!response.destroyed) {
        response.writeHead(
          error instanceof RequestError
            ? error.status
            : controller?.signal.aborted
            ? 504
            : 502,
          { "Content-Type": "text/plain; charset=utf-8" },
        );
        // Never echo provider response bodies or transport errors (may contain secrets).
        response.end(
          error instanceof RequestError
            ? error.message
            : controller?.signal.aborted
            ? "AI generation timed out."
            : "Could not reach the AI provider.",
        );
      }
    } finally {
      clearTimeout(timer);
      if (ownsSlot) {
        busy = false;
      }
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
