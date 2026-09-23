import { ROUNDNESS } from "@excalidraw/common";

import type { AppState } from "@excalidraw/excalidraw/types";

import { Scene } from "../Scene";
import { addNewNodes, FlowChartCreator } from "../flowchart";
import { newStickyNoteElement } from "../newElement";
import { isFlowchartNodeElement, isStickyNoteElement } from "../typeChecks";

describe("flowchart", () => {
  it("can preview a connected node without changing the source in the scene", () => {
    const source = newStickyNoteElement({
      type: "stickynote",
      x: 100,
      y: 100,
      width: 180,
      height: 100,
      baseHeight: 100,
    });
    const scene = new Scene([source], { skipValidation: true });
    const creator = new FlowChartCreator();
    const version = source.version;

    creator.createNodes(
      { ...source, boundElements: source.boundElements?.slice() ?? null },
      { currentItemEndArrowhead: "arrow" } as AppState,
      "right",
      scene,
      { gap: 160, crossCenter: source.y + source.height / 2 + 30 },
    );
    expect(creator.pendingNodes).toHaveLength(2);
    expect(creator.pendingNodes?.[0]).toMatchObject({
      x: source.x + source.width + 160,
      y: source.y + 30,
    });
    expect(creator.pendingNodes?.[1]).toMatchObject({
      startBinding: { elementId: source.id },
      endBinding: { elementId: creator.pendingNodes?.[0].id },
    });
    creator.clear();
    expect(source.boundElements).toBeNull();
    expect(source.version).toBe(version);
    expect(scene.getNonDeletedElements()).toHaveLength(1);
  });

  it("creates connected sticky notes", () => {
    const sticky = newStickyNoteElement({
      type: "stickynote",
      x: 100,
      y: 100,
      width: 240,
      height: 260,
      baseHeight: 220,
      roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
      roughness: 2,
      backgroundColor: "#ffec99",
      strokeColor: "#1e1e1e",
      strokeWidth: 2,
    });
    const scene = new Scene([sticky], { skipValidation: true });
    const {
      nodes: [nextNode, bindingArrow],
    } = addNewNodes(
      sticky,
      {
        currentItemEndArrowhead: "arrow",
      } as AppState,
      "right",
      scene,
      1,
    );

    expect(isFlowchartNodeElement(sticky)).toBe(true);
    expect(isFlowchartNodeElement(nextNode)).toBe(true);
    expect(isStickyNoteElement(nextNode)).toBe(true);
    expect(nextNode).toMatchObject({
      type: "stickynote",
      x: sticky.x + sticky.width + 100,
      y: sticky.y,
      width: sticky.width,
      height: sticky.height,
      baseHeight: sticky.baseHeight,
      roundness: sticky.roundness,
      roughness: sticky.roughness,
      backgroundColor: sticky.backgroundColor,
      strokeColor: sticky.strokeColor,
      strokeWidth: sticky.strokeWidth,
    });
    expect(bindingArrow).toMatchObject({
      type: "arrow",
      startBinding: { elementId: sticky.id },
      endBinding: { elementId: nextNode.id },
    });
  });
});
