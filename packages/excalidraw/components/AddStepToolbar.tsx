import React, { useRef, useState } from "react";

import type { LinkDirection } from "@excalidraw/element";

import "./AddStepToolbar.scss";

const directions: readonly { direction: LinkDirection; icon: string }[] = [
  { direction: "up", icon: "↑" },
  { direction: "right", icon: "→" },
  { direction: "down", icon: "↓" },
  { direction: "left", icon: "←" },
];

export const AddStepToolbar = ({
  onAddStep,
}: {
  onAddStep: (direction: LinkDirection) => boolean;
}) => {
  const [direction, setDirection] = useState<LinkDirection>("right");
  const [pickerOpen, setPickerOpen] = useState(false);
  const directionToggleRef = useRef<HTMLButtonElement>(null);
  const icon = directions.find((item) => item.direction === direction)?.icon;

  const addStep = (nextDirection: LinkDirection) => {
    if (!onAddStep(nextDirection)) {
      directionToggleRef.current?.focus();
    }
  };

  const closePicker = () => {
    setPickerOpen(false);
    directionToggleRef.current?.focus();
  };

  return (
    <div className="add-step-toolbar" role="group" aria-label="Flowchart steps">
      <button
        type="button"
        className="add-step-toolbar__add"
        title={`Add connected step ${direction}`}
        onClick={() => addStep(direction)}
      >
        <span aria-hidden="true">＋</span> Add step{" "}
        <span aria-hidden="true">{icon}</span>
      </button>
      <button
        type="button"
        ref={directionToggleRef}
        className="add-step-toolbar__toggle"
        aria-label="Choose step direction"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen((open) => !open)}
      >
        <span aria-hidden="true">▾</span>
      </button>
      {pickerOpen && (
        <div
          className="add-step-toolbar__directions"
          role="group"
          aria-label="Step direction"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closePicker();
            }
          }}
        >
          {directions.map((item) => (
            <button
              key={item.direction}
              type="button"
              aria-label={`Add step ${item.direction}`}
              title={`Add step ${item.direction}`}
              onClick={() => {
                setDirection(item.direction);
                setPickerOpen(false);
                addStep(item.direction);
              }}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
