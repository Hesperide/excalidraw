import { useEffect, useRef, useState } from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getCommonBounds, type LinkDirection } from "@excalidraw/element";

import { t } from "../i18n";

import "./FlowchartAddStep.scss";

import type App from "./App";

const directions: readonly [LinkDirection, string][] = [
  ["up", "↑"],
  ["right", "→"],
  ["down", "↓"],
  ["left", "←"],
];

export const FlowchartAddStep = ({ app }: { app: App }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstDirection = useRef<HTMLButtonElement>(null);
  const selected = app.scene.getSelectedElements(app.state);
  const node = selected.length === 1 ? selected[0] : null;
  const { state } = app;
  const visible =
    node &&
    !node.locked &&
    (node.type === "rectangle" || node.type === "diamond") &&
    state.activeTool.type === "selection" &&
    !state.viewModeEnabled &&
    !state.zenModeEnabled &&
    !state.editingTextElement &&
    !state.selectedElementsAreBeingDragged &&
    !state.resizingElement &&
    !state.isRotating &&
    !state.selectionElement &&
    !state.openDialog &&
    !app.flowchart.isCreatingChart;

  useEffect(() => {
    setOpen(false);
  }, [node?.id, visible]);

  useEffect(() => {
    if (!open) {
      return;
    }
    firstDirection.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    app.ownerDocument.addEventListener("pointerdown", dismiss);
    return () => app.ownerDocument.removeEventListener("pointerdown", dismiss);
  }, [app, open]);

  if (!visible || !node) {
    return null;
  }
  const [minX, , maxX, maxY] = getCommonBounds([node]);
  const anchor = sceneCoordsToViewportCoords(
    { sceneX: (minX + maxX) / 2, sceneY: maxY },
    state,
  );
  const width = 176;
  const height = open ? 88 : 36;
  // Coordinates are local to the editor, not the page. Keep the whole picker
  // on screen even near a viewport edge; bounds account for rotated shapes.
  const left = Math.max(
    8,
    Math.min(anchor.x - state.offsetLeft - width / 2, state.width - width - 8),
  );
  const top = Math.max(
    64,
    Math.min(anchor.y - state.offsetTop + 16, state.height - height - 48),
  );

  return (
    <div
      ref={root}
      className="flowchart-add-step"
      style={{ left, top, width }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Do not let editor shortcuts move/delete a node while using controls.
        event.stopPropagation();
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={`flowchart-directions-${app.id}`}
        onClick={() => setOpen(!open)}
      >
        + {t("flowchart.addStep")}
      </button>
      {open && (
        <div
          id={`flowchart-directions-${app.id}`}
          role="group"
          aria-label={t("flowchart.direction")}
          className="flowchart-add-step__directions"
        >
          {directions.map(([direction, icon], index) => (
            <button
              key={direction}
              ref={index === 0 ? firstDirection : undefined}
              type="button"
              aria-label={t(`flowchart.${direction}`)}
              title={t(`flowchart.${direction}`)}
              onClick={() => {
                setOpen(false);
                app.flowchart.addStep(direction);
                app.focusContainer();
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
