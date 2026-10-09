import { fireEvent, screen } from "@testing-library/react";
import { KEYS, reseed } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawArrowElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

unmountComponent();
const { h } = window;
const labels = [
  "Add connected shape above",
  "Add connected shape to the right",
  "Add connected shape below",
  "Add connected shape to the left",
];

beforeEach(async () => {
  localStorage.clear();
  reseed(7);
  await render(<Excalidraw handleKeyboardGlobally />);
  API.setAppState({ width: 1000, height: 1000 });
});

describe("contextual flowchart plus buttons", () => {
  it.each(["rectangle", "diamond"] as const)(
    "creates a styled, bound %s successor in each direction",
    (type) => {
      const parent = API.createElement({
        type,
        x: 400,
        y: 400,
        width: 160,
        height: 100,
        strokeColor: "#e03131",
        backgroundColor: "#ffc9c9",
        fillStyle: "solid",
        strokeWidth: 4,
        strokeStyle: "dashed",
        roughness: 0,
      });
      API.setElements([parent]);
      API.setSelectedElements([parent]);
      expect(
        screen.getAllByRole("button", { name: /Add connected shape/ }),
      ).toHaveLength(4);

      labels.forEach((label, index) => {
        API.setSelectedElements([parent]);
        fireEvent.click(screen.getByRole("button", { name: label }));
        const child = h.elements.find(
          (element) => h.state.selectedElementIds[element.id],
        )!;
        expect(child).toMatchObject({
          type,
          width: parent.width,
          height: parent.height,
          strokeColor: parent.strokeColor,
          backgroundColor: parent.backgroundColor,
          fillStyle: parent.fillStyle,
          strokeWidth: parent.strokeWidth,
          strokeStyle: parent.strokeStyle,
          roughness: parent.roughness,
        });
        const arrow = h.elements
          .filter((element) => element.type === "arrow")
          .at(-1) as ExcalidrawArrowElement;
        expect(arrow.elbowed).toBe(true);
        expect(arrow.startBinding?.elementId).toBe(parent.id);
        expect(arrow.endBinding?.elementId).toBe(child.id);
        expect(parent.boundElements).toContainEqual({
          id: arrow.id,
          type: "arrow",
        });
        expect(child.boundElements).toContainEqual({
          id: arrow.id,
          type: "arrow",
        });
        if (index === 0) {
          expect(child.y + child.height).toBeLessThan(parent.y);
        } else if (index === 1) {
          expect(child.x).toBeGreaterThan(parent.x + parent.width);
        } else if (index === 2) {
          expect(child.y).toBeGreaterThan(parent.y + parent.height);
        } else {
          expect(child.x + child.width).toBeLessThan(parent.x);
        }
      });
      expect(h.elements).toHaveLength(9);
    },
  );

  it.each(["ellipse", "text", "line"] as const)(
    "does not offer buttons for %s",
    (type) => {
      const node = API.createElement({ type });
      API.setElements([node]);
      API.setSelectedElements([node]);
      expect(
        screen.queryByRole("button", { name: /Add connected shape/ }),
      ).toBeNull();
    },
  );

  it("hides buttons for multi-selection, locked shapes and view mode", () => {
    const first = API.createElement({ type: "rectangle" });
    const second = API.createElement({ type: "diamond" });
    API.setElements([first, second]);
    API.setSelectedElements([first, second]);
    expect(
      screen.queryByRole("button", { name: /Add connected shape/ }),
    ).toBeNull();
    API.setSelectedElements([first]);
    API.setAppState({ viewModeEnabled: true });
    expect(
      screen.queryByRole("button", { name: /Add connected shape/ }),
    ).toBeNull();
    API.setAppState({ viewModeEnabled: false });
    API.updateElement(first, { locked: true });
    expect(
      screen.queryByRole("button", { name: /Add connected shape/ }),
    ).toBeNull();
  });

  it("follows zoom, pan and container offsets with a constant screen-space gap", () => {
    const node = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    API.setElements([node]);
    API.setSelectedElements([node]);
    API.setAppState({
      zoom: { value: 2 as typeof h.state.zoom.value },
      scrollX: 30,
      scrollY: 40,
      offsetLeft: 50,
      offsetTop: 60,
    });
    const right = screen.getByRole("button", { name: labels[1] });
    expect(right.style.left).toBe("686px");
    expect(right.style.top).toBe("380px");
    const above = screen.getByRole("button", { name: labels[0] });
    expect(above.style.left).toBe("460px");
    expect(above.style.top).toBe("254px");
  });

  it("undoes and redoes node and connector together", () => {
    const node = API.createElement({
      type: "rectangle",
      width: 160,
      height: 100,
    });
    API.updateScene({
      elements: [node],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.setSelectedElements([node]);
    fireEvent.click(screen.getByRole("button", { name: labels[1] }));
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(3);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress(KEYS.Z));
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(1);
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () =>
      Keyboard.keyPress(KEYS.Z),
    );
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(3);
  });

  it("hides during keyboard previews and restores after Escape cancellation", () => {
    const node = API.createElement({
      type: "rectangle",
      width: 160,
      height: 100,
    });
    API.setElements([node]);
    API.setSelectedElements([node]);
    Keyboard.withModifierKeys({ ctrl: true }, () =>
      Keyboard.keyPress(KEYS.ARROW_RIGHT),
    );
    expect(
      screen.queryByRole("button", { name: /Add connected shape/ }),
    ).toBeNull();
    Keyboard.keyPress(KEYS.ESCAPE);
    Keyboard.keyUp(KEYS.CTRL_OR_CMD);
    expect(h.elements).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: /Add connected shape/ }),
    ).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: labels[1] }));
    expect(h.elements).toHaveLength(3);
  });

  it("keeps button keyboard events out of canvas shortcuts", () => {
    const node = API.createElement({
      type: "rectangle",
      width: 160,
      height: 100,
    });
    API.setElements([node]);
    API.setSelectedElements([node]);
    const button = screen.getByRole("button", { name: labels[1] });
    button.focus();
    // jsdom does not synthesize native keyboard clicks; verify that the
    // default remains available, then exercise its click handler.
    expect(fireEvent.keyDown(button, { key: "Enter", code: "Enter" })).toBe(
      true,
    );
    expect(fireEvent.keyUp(button, { key: "Enter", code: "Enter" })).toBe(true);
    expect(h.state.editingTextElement).toBeNull();
    expect(h.elements).toHaveLength(1);
    fireEvent.click(button);
    expect(h.elements).toHaveLength(3);
  });
});
