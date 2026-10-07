import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import type { LinkDirection } from "@excalidraw/element";
import type {
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
} from "@excalidraw/element/types";

import "./FlowchartHandles.scss";

import type App from "./App";

const DIRECTIONS: {
  direction: LinkDirection;
  label: string;
  x: (element: NonDeleted<ExcalidrawFlowchartNodeElement>) => number;
  y: (element: NonDeleted<ExcalidrawFlowchartNodeElement>) => number;
}[] = [
  {
    direction: "up",
    label: "above",
    x: (element) => element.x + element.width / 2,
    y: (element) => element.y,
  },
  {
    direction: "right",
    label: "to the right",
    x: (element) => element.x + element.width,
    y: (element) => element.y + element.height / 2,
  },
  {
    direction: "down",
    label: "below",
    x: (element) => element.x + element.width / 2,
    y: (element) => element.y + element.height,
  },
  {
    direction: "left",
    label: "to the left",
    x: (element) => element.x,
    y: (element) => element.y + element.height / 2,
  },
];

export const FlowchartHandles = ({
  app,
  element,
  dragging,
}: {
  app: App;
  element: NonDeleted<ExcalidrawFlowchartNodeElement>;
  dragging: boolean;
}) => {
  const appState = app.state;

  return (
    <div className="excalidraw__flowchart-handles">
      {DIRECTIONS.map(({ direction, label, x, y }) => {
        const viewport = sceneCoordsToViewportCoords(
          { sceneX: x(element), sceneY: y(element) },
          appState,
        );

        return (
          <button
            key={direction}
            type="button"
            className="excalidraw__flowchart-handle"
            aria-label={`Create a flowchart node ${label}`}
            data-testid={`flowchart-handle-${direction}`}
            style={{
              left: viewport.x - appState.offsetLeft,
              top: viewport.y - appState.offsetTop,
              opacity: dragging ? 0 : undefined,
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              app.flowchart.startDragToCreate(element, direction, event);
            }}
            onPointerMove={app.flowchart.updateDragToCreate}
            onPointerUp={app.flowchart.endDragToCreate}
            onPointerCancel={() => app.flowchart.cancelDragToCreate()}
          />
        );
      })}
    </div>
  );
};
