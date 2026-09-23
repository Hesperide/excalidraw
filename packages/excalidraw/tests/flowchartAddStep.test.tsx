import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, render } from "./test-utils";

const { h } = window;

describe("Add step", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("creates a bound step with inherited styling and supports undo/redo", () => {
    const source = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 160,
      height: 90,
      strokeColor: "#c92a2a",
      backgroundColor: "#fff3bf",
    });

    API.updateScene({
      elements: [source],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    API.setSelectedElements([source]);

    act(() => h.app.flowchart.addStep("right"));

    const node = h.elements.find(
      (element) => element.type === "rectangle" && element.id !== source.id,
    );
    const arrow = h.elements.find((element) => element.type === "arrow");
    expect(node).toMatchObject({
      x: 360,
      y: 100,
      width: 160,
      height: 90,
      strokeColor: source.strokeColor,
      backgroundColor: source.backgroundColor,
    });
    expect(arrow).toMatchObject({
      startBinding: { elementId: source.id },
      endBinding: { elementId: node?.id },
    });

    // Finish the empty label editor before invoking history.
    act(() => h.app.setState({ editingTextElement: null }));
    Keyboard.undo();
    expect(
      h.elements.some(
        (element) => element.id === node?.id && !element.isDeleted,
      ),
    ).toBe(false);
    Keyboard.redo();
    expect(
      h.elements.some(
        (element) => element.id === node?.id && !element.isDeleted,
      ),
    ).toBe(true);
  });
});
