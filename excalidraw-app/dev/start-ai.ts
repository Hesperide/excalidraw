import { createDevAIServer } from "./ai-server";

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "OPENAI_API_KEY is required. Inject it through your secret manager.",
  );
  process.exit(1);
}

const server = createDevAIServer({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  requestLimit: Number(process.env.AI_DEV_REQUEST_LIMIT || 20),
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(`Development AI server failed to start (${error.code}).`);
  process.exitCode = 1;
});
server.listen(3016, "127.0.0.1", () => {
  console.info(
    "Development AI listening on http://127.0.0.1:3016 (loopback only).",
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
