import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getCommonBounds } from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { t } from "../i18n";

import "./FlowchartPlusButtons.scss";

import type App from "./App";

const DIRECTIONS = ["up", "right", "down", "left"] as const;
const GAP = 26;

export const FlowchartPlusButtons = ({
  app,
  selectedElements,
}: {
  app: App;
  selectedElements: readonly NonDeletedExcalidrawElement[];
}) => {
  const { state } = app;
  const node = selectedElements[0];
  if (
    selectedElements.length !== 1 ||
    !node ||
    node.locked ||
    (node.type !== "rectangle" && node.type !== "diamond") ||
    state.activeTool.type !== "selection" ||
    state.viewModeEnabled ||
    state.editingTextElement ||
    state.newElement ||
    state.resizingElement ||
    state.isRotating ||
    state.selectedElementsAreBeingDragged ||
    state.selectionElement ||
    state.contextMenu ||
    state.openMenu ||
    state.openDialog ||
    app.flowchart.isCreatingChart
  ) {
    return null;
  }

  const [x1, y1, x2, y2] = getCommonBounds([node]);
  const start = sceneCoordsToViewportCoords({ sceneX: x1, sceneY: y1 }, state);
  const end = sceneCoordsToViewportCoords({ sceneX: x2, sceneY: y2 }, state);
  const centerX = (start.x + end.x) / 2 - state.offsetLeft;
  const centerY = (start.y + end.y) / 2 - state.offsetTop;
  const positions: Record<LinkDirection, { left: number; top: number }> = {
    up: { left: centerX, top: start.y - state.offsetTop - GAP },
    right: { left: end.x - state.offsetLeft + GAP, top: centerY },
    down: { left: centerX, top: end.y - state.offsetTop + GAP },
    left: { left: start.x - state.offsetLeft - GAP, top: centerY },
  };

  return (
    <>
      {DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          className="flowchart-plus-button"
          style={positions[direction]}
          aria-label={t(`labels.flowchartAdd.${direction}`)}
          title={t(`labels.flowchartAdd.${direction}`)}
          onPointerDown={(event) => event.stopPropagation()}
          // Preserve native Enter/Space activation without editor shortcuts
          // interpreting Enter as labeling or Space as panning.
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            app.flowchart.createNode(direction);
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      ))}
    </>
  );
};
