import { useState } from "react";

import type { LinkDirection } from "@excalidraw/element";

import "./FlowchartAddStep.scss";

const DIRECTIONS: { direction: LinkDirection; arrow: string; label: string }[] =
  [
    { direction: "up", arrow: "↑", label: "above" },
    { direction: "right", arrow: "→", label: "right" },
    { direction: "down", arrow: "↓", label: "below" },
    { direction: "left", arrow: "←", label: "left" },
  ];

/** A selected-node-only affordance; all shape creation stays in AppFlowchart. */
export const FlowchartAddStep = ({
  onAdd,
}: {
  onAdd: (direction: LinkDirection) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="flowchart-add-step"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="flowchart-add-step__trigger"
        aria-label="Add connected step"
        aria-expanded={open}
        aria-controls="flowchart-add-step-directions"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">＋</span> Add step
      </button>
      {open && (
        <div
          id="flowchart-add-step-directions"
          className="flowchart-add-step__directions"
          role="group"
          aria-label="Choose direction for new step"
        >
          {DIRECTIONS.map(({ direction, arrow, label }) => (
            <button
              key={direction}
              type="button"
              className="flowchart-add-step__direction"
              aria-label={`Add step ${label}`}
              title={`Add step ${label}`}
              onClick={() => {
                setOpen(false);
                onAdd(direction);
              }}
            >
              {arrow}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
