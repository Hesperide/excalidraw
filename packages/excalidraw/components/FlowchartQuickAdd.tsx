import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getElementAbsoluteCoords } from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";
import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import "./FlowchartQuickAdd.scss";

import type { AppState } from "../types";

const DIRECTIONS: LinkDirection[] = ["up", "right", "down", "left"];
const BUTTON_SIZE = 28;
const BUTTON_OFFSET = 25;

const DIRECTION_OFFSETS: Record<LinkDirection, [number, number]> = {
  up: [0, -BUTTON_OFFSET],
  right: [BUTTON_OFFSET, 0],
  down: [0, BUTTON_OFFSET],
  left: [-BUTTON_OFFSET, 0],
};

const clampButtonCenter = (position: number, viewportSize: number) => {
  const halfButton = BUTTON_SIZE / 2;
  const max = Math.max(halfButton, viewportSize - halfButton);
  return Math.max(halfButton, Math.min(max, position));
};

export const FlowchartQuickAdd = ({
  element,
  elementsMap,
  appState,
  onCreate,
}: {
  element: NonDeletedExcalidrawElement;
  elementsMap: ElementsMap;
  appState: AppState;
  onCreate: (direction: LinkDirection) => void;
}) => {
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  const positions = {
    up: [(x1 + x2) / 2, y1],
    right: [x2, (y1 + y2) / 2],
    down: [(x1 + x2) / 2, y2],
    left: [x1, (y1 + y2) / 2],
  };

  return (
    <div className="flowchart-quick-add">
      {DIRECTIONS.map((direction) => {
        const [sceneX, sceneY] = positions[direction];
        const { x, y } = sceneCoordsToViewportCoords(
          { sceneX, sceneY },
          appState,
        );
        const [offsetX, offsetY] = DIRECTION_OFFSETS[direction];
        return (
          <button
            key={direction}
            type="button"
            className={`flowchart-quick-add__button flowchart-quick-add__button--${direction}`}
            style={{
              left: clampButtonCenter(
                x - appState.offsetLeft + offsetX,
                appState.width,
              ),
              top: clampButtonCenter(
                y - appState.offsetTop + offsetY,
                appState.height,
              ),
            }}
            aria-label={`Add connected shape ${direction}`}
            title={`Add connected shape ${direction}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCreate(direction);
            }}
          >
            +
          </button>
        );
      })}
    </div>
  );
};
