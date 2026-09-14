import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawFlowchartNodeElement,
} from "@excalidraw/element/types";

import { useExcalidrawAppState } from "./App";
import "./FlowchartCanvasButtons.scss";

import type { AppState } from "../types";

type Direction = "up" | "right" | "down" | "left";

const getButtonPosition = (
  element: ExcalidrawFlowchartNodeElement,
  direction: Direction,
  appState: AppState,
  elementsMap: ElementsMap,
) => {
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  const scenePoint =
    direction === "up"
      ? { sceneX: (x1 + x2) / 2, sceneY: y1 }
      : direction === "right"
      ? { sceneX: x2, sceneY: (y1 + y2) / 2 }
      : direction === "down"
      ? { sceneX: (x1 + x2) / 2, sceneY: y2 }
      : { sceneX: x1, sceneY: (y1 + y2) / 2 };
  const point = sceneCoordsToViewportCoords(scenePoint, appState);

  return {
    left: point.x - appState.offsetLeft,
    top: point.y - appState.offsetTop,
  };
};

export const FlowchartCanvasButtons = ({
  element,
  elementsMap,
  onCreate,
}: {
  element: ExcalidrawFlowchartNodeElement;
  elementsMap: ElementsMap;
  onCreate: (direction: Direction) => void;
}) => {
  const appState = useExcalidrawAppState();

  if (
    appState.contextMenu ||
    appState.newElement ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled
  ) {
    return null;
  }

  return (
    <>
      {(["up", "right", "down", "left"] as const).map((direction) => {
        const position = getButtonPosition(
          element,
          direction,
          appState,
          elementsMap,
        );
        return (
          <button
            aria-label={`Create connected shape ${direction}`}
            className={`flowchart-canvas-button flowchart-canvas-button--${direction}`}
            key={direction}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onCreate(direction)}
            style={position}
            title={`Create connected shape ${direction}`}
            type="button"
          >
            +
          </button>
        );
      })}
    </>
  );
};
