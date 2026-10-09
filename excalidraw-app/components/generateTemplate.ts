import { convertToExcalidrawElements } from "@excalidraw/element";
import { TTDStreamFetch } from "@excalidraw/excalidraw";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

/** Reuse the app's AI service; the editor package never owns provider credentials. */
export const generateTemplate: NonNullable<
  ExcalidrawProps["onGenerateTemplate"]
> = async ({ prompt, template, detail, signal }) => {
  const response = await TTDStreamFetch({
    url: `${
      import.meta.env.VITE_APP_AI_BACKEND
    }/v1/ai/text-to-diagram/chat-streaming`,
    messages: [
      {
        role: "user",
        content: [
          prompt,
          template ? `Use a ${template} as the starting structure.` : "",
          `Level of detail: ${detail}. Return only a Mermaid diagram.`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    signal,
    extractRateLimits: true,
  });
  if (response.error) {
    throw response.error;
  }
  signal.throwIfAborted();
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const source = (response.generatedResponse ?? "")
    .trim()
    .replace(/^```(?:mermaid)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "");
  const result = await parseMermaidToExcalidraw(source);
  signal.throwIfAborted();
  return {
    elements: convertToExcalidrawElements(result.elements, {
      regenerateIds: true,
    }),
    files: result.files,
  };
};
