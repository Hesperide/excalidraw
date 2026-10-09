# Local AI development

This optional helper powers AI Templates and the existing text-to-diagram dialog. It is **not a production backend** and does not replace the production AI URL. Node 18+ and the normal frozen Yarn install are sufficient; no additional SDK, database, or generated files in the checkout are required.

## Run

1. Supply `OPENAI_API_KEY` to the backend process through your secret manager. Never put it in a `VITE_*` variable, source file, command argument, or PR.
2. Run `yarn start:ai` in one terminal and `yarn start` in another.
3. Open Library → the AI-wand Templates tab, describe a diagram, and generate. Preview it before inserting it into the canvas.

In a Replit development sandbox, after adding the key securely:

```sh
replit secrets exec --keys OPENAI_API_KEY -- yarn start:ai
```

The server binds **only to `127.0.0.1:3016`**. Vite proxies `/api/ai` to it, including on dynamically named hosted previews. Leave the backend port private; use the frontend preview URL. No additional exposed API endpoint is needed. The default localhost AI URL is rewritten only when running the dev server. Custom AI URLs and production builds keep their configured values.

## Limits and security

- Keep the development preview private. The proxy checks browser origin but **does not authenticate users**; anyone with preview access can use its budget. Do not publish this helper or expose it as a shared/public paid API.
- Default model: `gpt-4.1-mini`; override with server-only `OPENAI_MODEL`.
- Default budget: **20 provider attempts per process**, including failed attempts. Restart explicitly to reset it; optionally set `AI_DEV_REQUEST_LIMIT` to a positive integer. Token usage is billed to the supplied OpenAI account.
- One concurrent generation, 32 KiB request bodies, 20 messages, 8,000 characters per message, 4,096 completion tokens, and a 60-second provider deadline.
- Client disconnects cancel provider work. Provider errors are sanitized.
- The provider response is buffered and delivered using the client's SSE `content`/`done` contract. Incremental token streaming is not implemented.
- No prompt persistence, API keys in browser bundles, or response-body logging.

## Verify and troubleshoot

```sh
curl http://localhost:3000/api/ai/health
yarn test:ai
yarn test:typecheck
```

Health indicates configuration/readiness, not successful provider authentication. Generate an actual diagram to check credentials, quota, parsing, and insertion. The server refuses startup without a key. Provider HTTP 401/403 indicates credentials or model access; HTTP 429 can indicate provider quota. Local HTTP 429 means another generation is running or the process budget is exhausted. HTTP 504 means the provider deadline elapsed. A Vite proxy connection error means the loopback service is not running.

Backend/proxy tests use a separate Node Vitest config, without the editor's DOM setup. Normal editor tests remain in the root Vitest config.
