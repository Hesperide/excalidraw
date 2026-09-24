import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { useState } from "react";
import type React from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { useExcalidrawAppState } from "./App";
import type { AppFlowchart } from "./App.flowchart";
import "./FlowchartControls.scss";

type Direction = "up" | "right" | "down" | "left";

const DIRECTIONS: readonly {
  direction: Direction;
  label: string;
  glyph: string;
}[] = [
  { direction: "up", label: "Create node above", glyph: "↑" },
  { direction: "right", label: "Create node to the right", glyph: "→" },
  { direction: "down", label: "Create node below", glyph: "↓" },
  { direction: "left", label: "Create node to the left", glyph: "←" },
];

export const FlowchartControls = ({
  element,
  flowchart,
}: {
  element: NonDeletedExcalidrawElement;
  flowchart: AppFlowchart;
}) => {
  const appState = useExcalidrawAppState();
  const [dragging, setDragging] = useState(false);

  if (
    element.locked ||
    appState.contextMenu ||
    appState.newElement ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled ||
    appState.selectionElement ||
    appState.selectedElementsAreBeingDragged ||
    appState.editingTextElement ||
    appState.activeTool.type !== "selection" ||
    (flowchart.isCreatingChart && !dragging)
  ) {
    return null;
  }

  const topLeft = sceneCoordsToViewportCoords(
    { sceneX: element.x, sceneY: element.y },
    appState,
  );
  const bottomRight = sceneCoordsToViewportCoords(
    { sceneX: element.x + element.width, sceneY: element.y + element.height },
    appState,
  );

  const left = topLeft.x - appState.offsetLeft;
  const top = topLeft.y - appState.offsetTop;
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  if (![left, top, width, height].every(Number.isFinite)) {
    return null;
  }

  return (
    <div
      className="excalidraw-flowchart-controls"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      aria-label="Flowchart controls"
    >
      {DIRECTIONS.map(({ direction, label, glyph }) => (
        <FlowchartControl
          key={direction}
          direction={direction}
          label={label}
          glyph={glyph}
          onStart={() => {
            setDragging(true);
            flowchart.startPointerCreation(element, direction);
          }}
          onCommit={() => {
            setDragging(false);
            flowchart.commitPointerCreation();
          }}
          onCancel={() => {
            setDragging(false);
            flowchart.cancelPointerCreation();
          }}
        />
      ))}
    </div>
  );
};

const FlowchartControl = ({
  direction,
  label,
  glyph,
  onStart,
  onCommit,
  onCancel,
}: {
  direction: Direction;
  label: string;
  glyph: string;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) => {
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onStart();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onCommit();
  };

  return (
    <button
      className={`excalidraw-flowchart-control excalidraw-flowchart-control--${direction}`}
      type="button"
      aria-label={label}
      title={`${label}. Release to place, Escape to cancel`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
};
