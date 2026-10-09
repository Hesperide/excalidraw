import {
  CaptureUpdateAction,
  isFlowchartNodeElement,
} from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, screen, unmountComponent } from "./test-utils";

unmountComponent();
const { h } = window;

beforeEach(async () => {
  localStorage.clear();
  await render(<Excalidraw handleKeyboardGlobally />);
});

const selectNode = (type: "rectangle" | "diamond" = "rectangle") => {
  const source = API.createElement({
    type,
    x: 300,
    y: 300,
    width: 160,
    height: 100,
    strokeColor: "#1971c2",
    backgroundColor: "#a5d8ff",
    fillStyle: "solid",
    strokeWidth: 2,
  });
  if (!isFlowchartNodeElement(source)) {
    throw new Error("Expected a flowchart node");
  }
  API.updateScene({
    elements: [source],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  API.setSelectedElements([source]);
  return source;
};

describe("drag flowchart handles", () => {
  it.each(["rectangle", "diamond"] as const)(
    "shows all four handles on a selected %s",
    (type) => {
      selectNode(type);
      expect(
        screen.getAllByRole("button", { name: /Drag to create/ }),
      ).toHaveLength(4);
    },
  );

  it.each(["ellipse", "text", "line"] as const)(
    "does not show handles on %s",
    (type) => {
      const element = API.createElement({ type });
      API.setElements([element]);
      API.setSelectedElements([element]);
      expect(
        screen.queryByRole("button", { name: /Drag to create/ }),
      ).toBeNull();
    },
  );

  it("hides handles for multiple, locked and rotated selections", () => {
    const source = selectNode();
    const other = API.createElement({ type: "diamond" });
    API.setElements([source, other]);
    API.setSelectedElements([source, other]);
    expect(screen.queryByRole("button", { name: /Drag to create/ })).toBeNull();
    API.setSelectedElements([source]);
    API.updateElement(source, { locked: true });
    expect(screen.queryByRole("button", { name: /Drag to create/ })).toBeNull();
    API.updateElement(source, {
      locked: false,
      angle: (Math.PI / 4) as typeof source.angle,
    });
    expect(screen.queryByRole("button", { name: /Drag to create/ })).toBeNull();
  });

  it.each(["up", "right", "down", "left"] as LinkDirection[])(
    "previews and commits a styled, bound step %s",
    (direction) => {
      const source = selectNode("diamond");
      const version = source.version;
      act(() =>
        h.app.flowchart.previewDrag(source, direction, { x: 700, y: 600 }),
      );
      expect(h.elements).toHaveLength(1);
      expect(source.boundElements).toBeNull();
      expect(source.version).toBe(version);
      expect(h.app.flowchart.pendingNodes?.[0]).toMatchObject({
        type: "diamond",
        x: 700,
        y: 600,
        width: 160,
        height: 100,
        backgroundColor: "#a5d8ff",
        strokeColor: "#1971c2",
        fillStyle: "solid",
        strokeWidth: 2,
      });
      act(() => h.app.flowchart.commitDrag(source.id));
      expect(h.elements).toHaveLength(3);
      const [node, arrow] = h.elements.slice(1);
      expect(arrow).toMatchObject({
        type: "arrow",
        elbowed: true,
        startBinding: { elementId: source.id },
        endBinding: { elementId: node.id },
      });
      expect(source.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
      expect(node.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
      expect(h.state.selectedElementIds).toEqual({ [node.id]: true });
      Keyboard.undo();
      expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(1);
      Keyboard.redo();
      expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(3);
    },
  );

  it("discards repeated previews without touching source bindings or history", () => {
    const source = selectNode();
    const version = source.version;
    act(() => {
      h.app.flowchart.previewDrag(source, "right", { x: 600, y: 350 });
      h.app.flowchart.previewDrag(source, "right", { x: 800, y: 450 });
      h.app.flowchart.cancelDrag();
    });
    expect(h.app.flowchart.pendingNodes).toBeNull();
    expect(h.elements).toHaveLength(1);
    expect(source.boundElements).toBeNull();
    expect(source.version).toBe(version);
  });

  it("handles captured pointer preview, Escape and pointer cancellation", () => {
    const source = selectNode();
    const button = screen.getByRole("button", { name: /step right/ });
    button.setPointerCapture = vi.fn();
    Object.defineProperty(button, "releasePointerCapture", {
      value: vi.fn(),
    });
    Object.defineProperty(button, "hasPointerCapture", {
      value: vi.fn(() => true),
    });
    fireEvent.pointerDown(button, { pointerId: 1, button: 0 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 800, clientY: 350 });
    expect(h.app.flowchart.pendingNodes).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 800, clientY: 350 });
    expect(h.elements).toHaveLength(1);
    expect(h.app.flowchart.pendingNodes).toBeNull();
    expect(source.boundElements).toBeNull();
    fireEvent.pointerDown(button, { pointerId: 2, button: 0 });
    fireEvent.pointerMove(button, { pointerId: 2, clientX: 800, clientY: 350 });
    fireEvent.pointerCancel(button, { pointerId: 2 });
    expect(h.elements).toHaveLength(1);
    expect(h.app.flowchart.pendingNodes).toBeNull();
    expect(button.releasePointerCapture).toHaveBeenCalledWith(2);
  });

  it("releasing within the source cancels instead of committing", () => {
    selectNode();
    const button = screen.getByRole("button", { name: /step right/ });
    button.setPointerCapture = vi.fn();
    fireEvent.pointerDown(button, { pointerId: 1, button: 0 });
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 380, clientY: 350 });
    expect(h.elements).toHaveLength(1);
    expect(h.app.flowchart.pendingNodes).toBeNull();
  });
});
