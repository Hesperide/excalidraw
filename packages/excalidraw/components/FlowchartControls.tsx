import { useState } from "react";

import type { LinkDirection } from "@excalidraw/element";

import "./FlowchartControls.scss";

const DIRECTIONS: readonly {
  direction: LinkDirection;
  symbol: string;
  label: string;
}[] = [
  { direction: "up", symbol: "↑", label: "Add step above" },
  { direction: "right", symbol: "→", label: "Add step to the right" },
  { direction: "down", symbol: "↓", label: "Add step below" },
  { direction: "left", symbol: "←", label: "Add step to the left" },
];

export const FlowchartControls = ({
  onAddStep,
}: {
  onAddStep: (direction: LinkDirection) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="excalidraw-flowchart-controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="excalidraw-flowchart-controls__trigger"
        type="button"
        aria-label="Add step"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">＋</span>
        Add step
      </button>
      {isOpen && (
        <div
          className="excalidraw-flowchart-controls__directions"
          role="group"
          aria-label="Add step direction"
        >
          {DIRECTIONS.map(({ direction, symbol, label }) => (
            <button
              key={direction}
              className="excalidraw-flowchart-controls__direction"
              type="button"
              aria-label={label}
              title={label}
              onClick={() => {
                onAddStep(direction);
                setIsOpen(false);
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
