import React, { useCallback, useEffect, useRef } from "react";

import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";

import type { LinkDirection } from "@excalidraw/element";
import type {
  NonDeletedExcalidrawElement,
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
} from "@excalidraw/element/types";

import "./FlowchartDragHandles.scss";

import type App from "./App";

const directions: LinkDirection[] = ["up", "right", "down", "left"];
const glyphs = { up: "↑", right: "→", down: "↓", left: "←" };

export const FlowchartDragHandles = ({
  app,
  selectedElements,
}: {
  app: App;
  selectedElements: readonly NonDeletedExcalidrawElement[];
}) => {
  const drag = useRef<{
    source: NonDeleted<ExcalidrawFlowchartNodeElement>;
    direction: LinkDirection;
    pointerId: number;
    button: HTMLButtonElement;
    valid: boolean;
  } | null>(null);

  const cancel = useCallback(() => {
    const session = drag.current;
    if (!session) {
      return;
    }
    drag.current = null;
    app.flowchart.cancelDrag();
    if (session.button.hasPointerCapture?.(session.pointerId)) {
      session.button.releasePointerCapture(session.pointerId);
    }
  }, [app]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (drag.current && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    };
    app.ownerWindow.addEventListener("keydown", onKey, true);
    app.ownerWindow.addEventListener("blur", cancel);
    return () => {
      app.ownerWindow.removeEventListener("keydown", onKey, true);
      app.ownerWindow.removeEventListener("blur", cancel);
      cancel();
    };
  }, [app, cancel]);

  const source = selectedElements.length === 1 ? selectedElements[0] : null;
  const eligible =
    source &&
    (source.type === "rectangle" || source.type === "diamond") &&
    !source.locked &&
    !source.angle &&
    !source.groupIds.length &&
    !app.state.viewModeEnabled &&
    app.state.activeTool.type === "selection" &&
    !app.state.editingTextElement &&
    !app.state.newElement &&
    !app.state.selectedElementsAreBeingDragged &&
    !app.state.resizingElement;

  useEffect(() => {
    if (drag.current && (!eligible || source?.id !== drag.current.source.id)) {
      cancel();
    }
  });

  if (!eligible) {
    return null;
  }

  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = drag.current;
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    event.stopPropagation();
    const { x, y } = viewportCoordsToSceneCoords(event, app.state);
    const { source: node, direction } = session;
    const position = { x: x - node.width / 2, y: y - node.height / 2 };
    // Keep a small gap on the handle's axis; releasing inside the source
    // cancels instead of inserting an overlapping, unusable step.
    session.valid =
      direction === "right"
        ? position.x >= node.x + node.width + 12
        : direction === "left"
        ? position.x + node.width <= node.x - 12
        : direction === "down"
        ? position.y >= node.y + node.height + 12
        : position.y + node.height <= node.y - 12;
    if (session.valid) {
      app.flowchart.previewDrag(node, direction, position);
    } else {
      app.flowchart.cancelDrag();
    }
  };

  return (
    <div className="flowchart-drag-handles">
      {directions.map((direction) => {
        const { x, y } = sceneCoordsToViewportCoords(
          {
            sceneX:
              source.x +
              (direction === "left"
                ? 0
                : direction === "right"
                ? source.width
                : source.width / 2),
            sceneY:
              source.y +
              (direction === "up"
                ? 0
                : direction === "down"
                ? source.height
                : source.height / 2),
          },
          app.state,
        );
        const dx = direction === "left" ? -26 : direction === "right" ? 26 : 0;
        const dy = direction === "up" ? -26 : direction === "down" ? 26 : 0;
        return (
          <button
            key={direction}
            type="button"
            aria-label={`Drag to create connected step ${direction}`}
            title={`Drag ${direction} to add a connected step · Esc to cancel`}
            style={{
              left: x - app.state.offsetLeft + dx,
              top: y - app.state.offsetTop + dy,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || drag.current) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              app.flowchart.clear();
              drag.current = {
                source,
                direction,
                pointerId: event.pointerId,
                button: event.currentTarget,
                valid: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={move}
            onPointerUp={(event) => {
              if (!drag.current || event.pointerId !== drag.current.pointerId) {
                return;
              }
              event.stopPropagation();
              move(event);
              const session = drag.current;
              drag.current = null;
              if (session.valid) {
                app.flowchart.commitDrag(session.source.id);
              } else {
                app.flowchart.cancelDrag();
              }
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
          >
            {glyphs[direction]}
          </button>
        );
      })}
    </div>
  );
};
