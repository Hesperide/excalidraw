import { TTDStreamFetch } from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

import { generateTemplate } from "../components/generateTemplate";

vi.mock("@excalidraw/excalidraw", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@excalidraw/excalidraw")>()),
  TTDStreamFetch: vi.fn(),
}));
vi.mock("@excalidraw/mermaid-to-excalidraw", () => ({
  parseMermaidToExcalidraw: vi.fn(),
}));

describe("template generation adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(TTDStreamFetch).mockResolvedValue({
      generatedResponse: "```mermaid\nflowchart TD\nA --> B\n```",
      error: null,
    });
    vi.mocked(parseMermaidToExcalidraw).mockResolvedValue({
      elements: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 80 }],
      files: undefined,
    });
  });

  const request = () => ({
    prompt: "A customer onboarding flow",
    template: "User flow",
    detail: "balanced" as const,
    signal: new AbortController().signal,
  });

  it("forwards context and cancellation, and converts fenced Mermaid into editable shapes", async () => {
    const input = request();
    const result = await generateTemplate(input);
    expect(TTDStreamFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: input.signal,
        messages: [
          {
            role: "user",
            content: expect.stringContaining("Use a User flow"),
          },
        ],
      }),
    );
    expect(parseMermaidToExcalidraw).toHaveBeenCalledWith(
      "flowchart TD\nA --> B",
    );
    expect(result.elements[0]).toMatchObject({ type: "rectangle", width: 100 });
    expect(result.elements[0].id).toBeTruthy();
  });

  it("propagates transport failures without parsing", async () => {
    vi.mocked(TTDStreamFetch).mockRejectedValue(
      new Error("Service unavailable"),
    );
    await expect(generateTemplate(request())).rejects.toThrow(
      "Service unavailable",
    );
    expect(parseMermaidToExcalidraw).not.toHaveBeenCalled();
  });

  it("does not convert a response after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateTemplate({ ...request(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(parseMermaidToExcalidraw).not.toHaveBeenCalled();
  });

  it("propagates invalid Mermaid to the editor's retry state", async () => {
    vi.mocked(parseMermaidToExcalidraw).mockRejectedValue(
      new Error("Invalid diagram"),
    );
    await expect(generateTemplate(request())).rejects.toThrow(
      "Invalid diagram",
    );
  });
});
