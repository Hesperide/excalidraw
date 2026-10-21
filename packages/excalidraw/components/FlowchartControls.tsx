import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import { getCommonBounds } from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { t } from "../i18n";

import "./FlowchartControls.scss";

import type App from "./App";

const DIRECTIONS: LinkDirection[] = ["up", "right", "down", "left"];

/** Small, screen-sized controls that follow the selected node through pan/zoom. */
export const FlowchartControls = ({
  app,
  selectedElements,
}: {
  app: App;
  selectedElements: readonly NonDeletedExcalidrawElement[];
}) => {
  const state = app.state;
  const node = selectedElements[0];
  if (
    selectedElements.length !== 1 ||
    !node ||
    (node.type !== "rectangle" && node.type !== "diamond") ||
    node.locked ||
    node.groupIds.length > 0 ||
    !app.isInteractionEnabled() ||
    state.activeTool.type !== "selection" ||
    state.viewModeEnabled ||
    state.editingTextElement ||
    state.newElement ||
    state.selectionElement ||
    state.selectedElementsAreBeingDragged ||
    state.resizingElement ||
    state.isRotating ||
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
  const left = start.x - state.offsetLeft;
  const top = start.y - state.offsetTop;
  const right = end.x - state.offsetLeft;
  const bottom = end.y - state.offsetTop;
  const gap = state.lastPointerDownWith === "touch" ? 40 : 28;
  const positions = {
    // Keep the rotation handle between the node and the upward control.
    up: [(left + right) / 2, top - 56],
    right: [right + gap, (top + bottom) / 2],
    down: [(left + right) / 2, bottom + gap],
    left: [left - gap, (top + bottom) / 2],
  };

  return (
    <div
      className="flowchart-controls"
      role="group"
      aria-label={t("labels.flowchart.extend")}
    >
      {DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          className="flowchart-controls__add"
          style={{
            left: positions[direction][0],
            top: positions[direction][1],
          }}
          aria-label={t(`labels.flowchart.${direction}`)}
          title={`${t(`labels.flowchart.${direction}`)} · ${t(
            "labels.flowchart.editLabel",
          )}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            // Native button activation must not also edit the canvas label
            // (Enter) or start canvas panning (Space).
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
            }
          }}
          onClick={(event) => {
            event.stopPropagation();
            app.flowchart.createNode(direction);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M7 2v10M2 7h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
};
