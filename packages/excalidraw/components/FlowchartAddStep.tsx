import { useEffect, useRef, useState } from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getCommonBounds } from "@excalidraw/element";

import type { LinkDirection } from "@excalidraw/element";

import { t } from "../i18n";

import "./FlowchartAddStep.scss";

import type App from "./App";

const directions = [
  { direction: "up", symbol: "↑", key: "ArrowUp" },
  { direction: "left", symbol: "←", key: "ArrowLeft" },
  { direction: "down", symbol: "↓", key: "ArrowDown" },
  { direction: "right", symbol: "→", key: "ArrowRight" },
] as const;

/** A deliberately small, selection-only alternative to remembering shortcuts. */
export const FlowchartAddStep = ({ app }: { app: App }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = `${app.id}-flowchart-directions`;
  const selected = app.scene.getSelectedElements(app.state);
  const node = selected.length === 1 ? selected[0] : null;
  const eligible =
    node &&
    (node.type === "rectangle" || node.type === "diamond") &&
    !node.locked &&
    !app.state.viewModeEnabled &&
    !app.state.zenModeEnabled &&
    !app.state.editingTextElement &&
    !app.state.selectedElementsAreBeingDragged &&
    !app.state.resizingElement &&
    !app.state.isRotating &&
    !app.state.contextMenu &&
    app.state.activeTool.type === "selection" &&
    !app.flowchart.isCreatingChart;

  useEffect(() => {
    if (!eligible) {
      setOpen(false);
    }
  }, [eligible]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const document = root.current?.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document?.addEventListener("pointerdown", onPointerDown);
    root.current
      ?.querySelector<HTMLButtonElement>('[data-direction="right"]')
      ?.focus();
    return () => document?.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!eligible) {
    return null;
  }
  const [, y1, x2] = getCommonBounds([node]);
  const position = sceneCoordsToViewportCoords(
    { sceneX: x2, sceneY: y1 },
    app.state,
  );
  const left = Math.max(
    8,
    Math.min(app.state.width - 180, position.x - app.state.offsetLeft + 18),
  );
  const top = Math.max(
    88,
    Math.min(app.state.height - 180, position.y - app.state.offsetTop),
  );

  const add = (direction: LinkDirection) => app.flowchart.addStep(direction);
  return (
    <div
      className="flowchart-add-step"
      ref={root}
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // Native button activation must not also start canvas text editing.
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        } else if (open && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const direction = directions.find(({ key }) => key === event.key);
          if (direction) {
            event.preventDefault();
            root.current
              ?.querySelector<HTMLButtonElement>(
                `[data-direction="${direction.direction}"]`,
              )
              ?.focus();
          }
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="flowchart-add-step__trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">＋</span> {t("flowchart.addStep")}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          id={id}
          className="flowchart-add-step__picker"
          role="group"
          aria-label={t("flowchart.chooseDirection")}
        >
          <div className="flowchart-add-step__hint">
            {t("flowchart.chooseDirection")}
          </div>
          <div className="flowchart-add-step__directions">
            {directions.map(({ direction, symbol }) => (
              <button
                key={direction}
                type="button"
                data-direction={direction}
                aria-label={t(`flowchart.${direction}`)}
                title={t(`flowchart.${direction}`)}
                onClick={() => add(direction)}
              >
                <span aria-hidden="true">{symbol}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
