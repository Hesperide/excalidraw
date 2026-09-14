import { useState } from "react";

import {
  isFlowchartNodeElement,
  type LinkDirection,
} from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { t } from "../i18n";

import { ElementCanvasButtons } from "./ElementCanvasButtons";
import { ElementCanvasButton } from "./MagicButton";
import { ArrowRightIcon, PlusIcon } from "./icons";

import "./FlowchartCanvasButtons.scss";

const DIRECTIONS: LinkDirection[] = ["up", "right", "down", "left"];

const ROTATION: Record<LinkDirection, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

const DIRECTION_LABELS: Record<
  LinkDirection,
  | "labels.addStepUp"
  | "labels.addStepRight"
  | "labels.addStepDown"
  | "labels.addStepLeft"
> = {
  up: "labels.addStepUp",
  right: "labels.addStepRight",
  down: "labels.addStepDown",
  left: "labels.addStepLeft",
};

export const FlowchartCanvasButtons = ({
  element,
  elementsMap,
  onAddStep,
}: {
  element: NonDeletedExcalidrawElement;
  elementsMap: ElementsMap;
  onAddStep: (direction: LinkDirection) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (
    !isFlowchartNodeElement(element) ||
    (element.type !== "rectangle" && element.type !== "diamond")
  ) {
    return null;
  }

  return (
    <ElementCanvasButtons element={element} elementsMap={elementsMap}>
      {isOpen ? (
        <div className="excalidraw-flowchart-direction-picker">
          {DIRECTIONS.map((direction) => (
            <span
              key={direction}
              style={{ transform: `rotate(${ROTATION[direction]}deg)` }}
            >
              <ElementCanvasButton
                title={t(DIRECTION_LABELS[direction])}
                icon={ArrowRightIcon}
                checked={false}
                onChange={() => onAddStep(direction)}
              />
            </span>
          ))}
        </div>
      ) : (
        <ElementCanvasButton
          title={t("labels.addStep")}
          icon={PlusIcon}
          checked={false}
          onChange={() => setIsOpen(true)}
        />
      )}
    </ElementCanvasButtons>
  );
};
