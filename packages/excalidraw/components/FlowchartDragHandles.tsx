import { useEffect } from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import type { LinkDirection } from "@excalidraw/element";
import type {
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
} from "@excalidraw/element/types";

import "./FlowchartDragHandles.scss";

import type App from "./App";

const HANDLES: {
  direction: LinkDirection;
  x: number;
  y: number;
  icon: string;
}[] = [
  { direction: "up", x: 0.5, y: 0, icon: "↑" },
  { direction: "right", x: 1, y: 0.5, icon: "→" },
  { direction: "down", x: 0.5, y: 1, icon: "↓" },
  { direction: "left", x: 0, y: 0.5, icon: "←" },
];

export const FlowchartDragHandles = ({
  app,
  element,
}: {
  app: App;
  element: NonDeleted<ExcalidrawFlowchartNodeElement>;
}) => {
  useEffect(() => () => app.flowchart.cancelDrag(), [app, element.id]);

  return (
    <div className="flowchart-drag-handles">
      {HANDLES.map(({ direction, x, y, icon }) => {
        const point = sceneCoordsToViewportCoords(
          {
            sceneX: element.x + element.width * x,
            sceneY: element.y + element.height * y,
          },
          app.state,
        );
        return (
          <button
            key={direction}
            type="button"
            aria-label={`Drag to connect ${direction}`}
            title={`Drag to connect ${direction} · Escape to cancel`}
            style={{
              left:
                point.x -
                app.state.offsetLeft +
                (x === 0 ? -24 : x === 1 ? 24 : 0),
              top:
                point.y -
                app.state.offsetTop +
                (y === 0 ? -24 : y === 1 ? 24 : 0),
            }}
            onPointerDown={(event) =>
              app.flowchart.startDrag(event, element, direction)
            }
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
};
