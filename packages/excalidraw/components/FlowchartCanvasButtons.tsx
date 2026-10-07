import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import {
  getElementAbsoluteCoords,
  type LinkDirection,
} from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { useExcalidrawAppState } from "./App";

import "./FlowchartCanvasButtons.scss";

const BUTTON_OFFSET = 20;

const getButtonPositions = (
  element: NonDeletedExcalidrawElement,
  appState: ReturnType<typeof useExcalidrawAppState>,
  elementsMap: ElementsMap,
) => {
  const [left, top, right, bottom] = getElementAbsoluteCoords(
    element,
    elementsMap,
  );
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  return (
    [
      {
        direction: "up",
        label: "Add node above",
        x: centerX,
        y: top - BUTTON_OFFSET,
      },
      {
        direction: "right",
        label: "Add node to the right",
        x: right + BUTTON_OFFSET,
        y: centerY,
      },
      {
        direction: "down",
        label: "Add node below",
        x: centerX,
        y: bottom + BUTTON_OFFSET,
      },
      {
        direction: "left",
        label: "Add node to the left",
        x: left - BUTTON_OFFSET,
        y: centerY,
      },
    ] as const
  ).map((position) => {
    const { x, y } = sceneCoordsToViewportCoords(
      { sceneX: position.x, sceneY: position.y },
      appState,
    );
    return {
      ...position,
      x: x - appState.offsetLeft,
      y: y - appState.offsetTop,
    };
  });
};

export const FlowchartCanvasButtons = ({
  element,
  elementsMap,
  onAddNode,
}: {
  element: NonDeletedExcalidrawElement;
  elementsMap: ElementsMap;
  onAddNode: (direction: LinkDirection) => void;
}) => {
  const appState = useExcalidrawAppState();

  if (
    appState.contextMenu ||
    appState.newElement ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled ||
    appState.editingTextElement ||
    appState.selectedLinearElement?.isEditing ||
    appState.selectedElementsAreBeingDragged ||
    appState.selectionElement ||
    appState.activeTool.type !== "selection"
  ) {
    return null;
  }

  return (
    <div className="excalidraw-flowchart-buttons">
      {getButtonPositions(element, appState, elementsMap).map(
        ({ direction, label, x, y }) => (
          <button
            aria-label={label}
            className="excalidraw-flowchart-buttons__button"
            key={direction}
            onClick={(event) => {
              event.stopPropagation();
              onAddNode(direction);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            style={{ left: x, top: y }}
            title={label}
            type="button"
          >
            <span aria-hidden="true">+</span>
          </button>
        ),
      )}
    </div>
  );
};
