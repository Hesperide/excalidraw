import { fireEvent, screen } from "@testing-library/react";

import { KEYS, reseed } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";
import { Excalidraw } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Keyboard } from "@excalidraw/excalidraw/tests/helpers/ui";
import {
  render,
  unmountComponent,
} from "@excalidraw/excalidraw/tests/test-utils";

unmountComponent();
const { h } = window;

beforeEach(async () => {
  localStorage.clear();
  reseed(7);
  await render(<Excalidraw handleKeyboardGlobally />);
});

const selectNode = (type: "rectangle" | "diamond" = "rectangle") => {
  const node = API.createElement({
    type,
    x: 300,
    y: 200,
    width: 160,
    height: 90,
    strokeColor: "#e03131",
    backgroundColor: "#ffec99",
    strokeWidth: 4,
    roughness: 0,
    fillStyle: "solid",
    opacity: 70,
  });
  API.updateScene({
    elements: [node],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  API.setSelectedElements([node]);
  return node;
};

const openPicker = () =>
  fireEvent.click(screen.getByRole("button", { name: "+ Add step" }));

describe("contextual flowchart creation", () => {
  it.each(["rectangle", "diamond"] as const)(
    "creates a styled, selected, bound %s successor as one undoable operation",
    (type) => {
      const source = selectNode(type);
      openPicker();
      fireEvent.click(
        screen.getByRole("button", { name: "Add step to the right" }),
      );
      const successor = h.elements.find(
        (element) => element.type === type && element.id !== source.id,
      )!;
      const arrow = h.elements.find((element) => element.type === "arrow")!;
      expect(successor).toMatchObject({
        type,
        width: source.width,
        height: source.height,
        strokeColor: source.strokeColor,
        backgroundColor: source.backgroundColor,
        strokeWidth: source.strokeWidth,
        roughness: source.roughness,
        fillStyle: source.fillStyle,
        opacity: source.opacity,
      });
      expect(successor.x).toBeGreaterThan(source.x + source.width);
      expect(arrow).toMatchObject({
        elbowed: true,
        startBinding: { elementId: source.id },
        endBinding: { elementId: successor.id },
      });
      expect(source.boundElements).toContainEqual({
        id: arrow.id,
        type: "arrow",
      });
      expect(successor.boundElements).toContainEqual({
        id: arrow.id,
        type: "arrow",
      });
      expect(h.state.selectedElementIds).toEqual({ [successor.id]: true });
      Keyboard.undo();
      expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(
        1,
      );
      Keyboard.redo();
      expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(
        3,
      );
    },
  );

  it.each([
    ["Add step above", "up"],
    ["Add step below", "down"],
    ["Add step to the left", "left"],
  ])("supports %s", (label, direction) => {
    const source = selectNode();
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: label }));
    const successor = h.elements.find(
      (element) => element.type === "rectangle" && element.id !== source.id,
    )!;
    if (direction === "up") {
      expect(successor.y + successor.height).toBeLessThan(source.y);
    } else if (direction === "down") {
      expect(successor.y).toBeGreaterThan(source.y + source.height);
    } else {
      expect(successor.x + successor.width).toBeLessThan(source.x);
    }
  });

  it("cancels with Escape or an outside pointer without scene changes", () => {
    selectNode();
    openPicker();
    const direction = screen.getByRole("button", { name: "Add step above" });
    expect(direction).toHaveFocus();
    fireEvent.keyDown(direction, { key: KEYS.ESCAPE });
    expect(
      screen.queryByRole("group", { name: "Choose next step direction" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "+ Add step" })).toHaveFocus();
    openPicker();
    fireEvent.pointerDown(h.app.ownerDocument.body);
    expect(
      screen.queryByRole("group", { name: "Choose next step direction" }),
    ).toBeNull();
    expect(h.elements).toHaveLength(1);
  });

  it.each(["ellipse", "text", "arrow"] as const)(
    "does not offer the action for %s",
    (type) => {
      const node = API.createElement({ type });
      API.setElements([node]);
      API.setSelectedElements([node]);
      expect(screen.queryByRole("button", { name: "+ Add step" })).toBeNull();
    },
  );

  it("hides for multiple selection, locked shapes, view mode and text editing", () => {
    const source = selectNode();
    const second = API.createElement({ type: "diamond" });
    API.setElements([source, second]);
    API.setSelectedElements([source, second]);
    expect(screen.queryByRole("button", { name: "+ Add step" })).toBeNull();
    const locked = API.createElement({ type: "rectangle", locked: true });
    API.setElements([locked]);
    API.setSelectedElements([locked]);
    expect(screen.queryByRole("button", { name: "+ Add step" })).toBeNull();
    selectNode();
    API.setAppState({ viewModeEnabled: true });
    expect(screen.queryByRole("button", { name: "+ Add step" })).toBeNull();
    API.setAppState({
      viewModeEnabled: false,
      editingTextElement: API.createElement({ type: "text" }),
    });
    expect(screen.queryByRole("button", { name: "+ Add step" })).toBeNull();
  });

  it("tracks zoom/pan in editor-local coordinates and clamps to the viewport", () => {
    selectNode();
    API.setAppState({
      width: 1000,
      height: 800,
      offsetLeft: 100,
      offsetTop: 50,
      zoom: { value: 2 as typeof h.state.zoom.value },
      scrollX: 0,
      scrollY: 0,
    });
    const root = screen.getByRole("button", { name: "+ Add step" })
      .parentElement!;
    expect(root.style.left).toBe("672px");
    expect(root.style.top).toBe("596px");
    API.setAppState({ scrollX: -100, scrollY: -100 });
    expect(root.style.left).toBe("472px");
    expect(root.style.top).toBe("396px");
    API.setAppState({ scrollX: 10000, scrollY: 10000 });
    expect(root.style.left).toBe("816px");
    expect(root.style.top).toBe("716px");
  });
});
