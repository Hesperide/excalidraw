import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { getTemplates } from "../components/Templates/templates";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { render } from "./test-utils";

import type { ExcalidrawProps } from "../types";

const { h } = window;

const mount = async (props: Partial<ExcalidrawProps> = {}) => {
  await render(
    <Excalidraw
      initialData={{
        appState: { openSidebar: { name: "default", tab: "templates" } },
      }}
      {...props}
    />,
  );
};

const openCustom = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Create a custom template" }),
  );

const enterPrompt = () =>
  fireEvent.change(screen.getByLabelText("What are you working on?"), {
    target: { value: "An onboarding flow for a habit app" },
  });

describe("template library", () => {
  afterEach(async () => {
    await act(() => h.app.library.resetLibrary());
  });

  it("draws each starter connector all the way to its bound target", async () => {
    await mount();
    for (const template of getTemplates()) {
      for (const arrow of template.elements) {
        if (arrow.type !== "arrow") {
          continue;
        }
        const target = template.elements.find(
          (element) => element.id === arrow.endBinding?.elementId,
        )!;
        expect(target).toBeDefined();
        const lastPoint = arrow.points[arrow.points.length - 1];
        const x = arrow.x + lastPoint[0];
        const y = arrow.y + lastPoint[1];
        expect(x).toBeGreaterThanOrEqual(target.x - 20);
        expect(x).toBeLessThanOrEqual(target.x + target.width + 20);
        expect(y).toBeGreaterThanOrEqual(target.y - 20);
        expect(y).toBeLessThanOrEqual(target.y + target.height + 20);
      }
    }
  });

  it("filters starter templates by category and search and clears empty results", async () => {
    await mount();
    expect(screen.getByText("6 templates")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(screen.getByText("2 templates")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search templates"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matching templates")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("6 templates")).toBeInTheDocument();
    expect(h.elements).toHaveLength(0);
  });

  it("previews without modifying a drawing and inserts independent bound shapes", async () => {
    await mount();
    const existing = API.createElement({ type: "rectangle" });
    act(() => API.setElements([existing]));
    fireEvent.click(screen.getByRole("button", { name: /User flow/ }));
    expect(h.elements).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Insert into canvas" }));
    await waitFor(() => expect(h.elements.length).toBeGreaterThan(1));
    const firstIds = h.elements.map((element) => element.id);
    expect(firstIds).toContain(existing.id);
    act(() =>
      h.setState({ openSidebar: { name: "default", tab: "templates" } }),
    );
    fireEvent.click(screen.getByRole("button", { name: /User flow/ }));
    fireEvent.click(screen.getByRole("button", { name: "Insert into canvas" }));
    await waitFor(() =>
      expect(h.elements.length).toBe(firstIds.length * 2 - 1),
    );
    expect(new Set(h.elements.map((element) => element.id)).size).toBe(
      h.elements.length,
    );
    for (const element of h.elements) {
      if (element.type === "arrow") {
        expect(element.startBinding).not.toBeNull();
        expect(element.endBinding).not.toBeNull();
        expect(
          h.elements.some(
            (other) => other.id === element.startBinding?.elementId,
          ),
        ).toBe(true);
        expect(
          h.elements.some(
            (other) => other.id === element.endBinding?.elementId,
          ),
        ).toBe(true);
      }
    }
  });

  it("saves a named template to the native library without inserting it", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /User flow/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save to your library" }),
    );
    fireEvent.change(screen.getByLabelText("Template name"), {
      target: { value: "Reusable onboarding" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(async () => {
      const items = await h.app.library.getLatestLibrary();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("Reusable onboarding");
      expect(items[0].elements.length).toBeGreaterThan(0);
    });
    expect(h.elements).toHaveLength(0);
  });

  it("shows an honest unavailable state when the host has no AI provider", async () => {
    await mount();
    openCustom();
    expect(
      screen.getByText(/AI generation is not configured/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate preview" }),
    ).toBeDisabled();
  });

  it("hides AI controls when aiEnabled is false but keeps starter templates", async () => {
    await mount({ aiEnabled: false });
    expect(
      screen.queryByRole("button", { name: "Create a custom template" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /User flow/ }));
    expect(
      screen.getByRole("button", { name: "Insert into canvas" }),
    ).toBeEnabled();
    expect(
      screen.queryByLabelText("What are you working on?"),
    ).not.toBeInTheDocument();
  });

  it("generates an editable preview and only inserts it after confirmation", async () => {
    const elements = getTemplates()[0].elements;
    const generate = vi.fn().mockResolvedValue({ elements });
    await mount({ onGenerateTemplate: generate });
    openCustom();
    enterPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Detailed" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByText("AI draft · review before inserting");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "An onboarding flow for a habit app",
        detail: "detailed",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(h.elements).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Insert into canvas" }));
    await waitFor(() => expect(h.elements).toHaveLength(elements.length));
  });

  it("retains the prompt after failure and supports retry", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ elements: getTemplates()[0].elements });
    await mount({ onGenerateTemplate: generate });
    openCustom();
    enterPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("What are you working on?")).toHaveValue(
      "An onboarding flow for a habit app",
    );
    expect(h.elements).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry generation" }));
    await screen.findByText("AI draft · review before inserting");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("aborts generation and ignores a late response after cancellation", async () => {
    let resolve!: (value: {
      elements: ReturnType<typeof getTemplates>[number]["elements"];
    }) => void;
    const generate = vi.fn(
      () =>
        new Promise<{
          elements: ReturnType<typeof getTemplates>[number]["elements"];
        }>((done) => {
          resolve = done;
        }),
    );
    await mount({ onGenerateTemplate: generate });
    openCustom();
    enterPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    expect(
      screen.getByRole("button", { name: "Building your draft…" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      (generate.mock.calls[0] as unknown as [{ signal: AbortSignal }])[0].signal
        .aborted,
    ).toBe(true);
    await act(async () => resolve({ elements: getTemplates()[0].elements }));
    expect(
      screen.queryByText("AI draft · review before inserting"),
    ).not.toBeInTheDocument();
    expect(h.elements).toHaveLength(0);
  });

  it("rejects empty generation results without changing the scene", async () => {
    await mount({
      onGenerateTemplate: vi.fn().mockResolvedValue({ elements: [] }),
    });
    openCustom();
    enterPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Insert into canvas" }),
    ).not.toBeInTheDocument();
    expect(h.elements).toHaveLength(0);
  });
});
