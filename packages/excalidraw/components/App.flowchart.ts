import {
  isArrowKey,
  KEYS,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";

import {
  makeNextSelectedElementIds,
  CaptureUpdateAction,
  cloneFlowchartNode,
  createConnectedFlowchartNode,
  FlowChartCreator,
  FlowChartNavigator,
  getSelectedElements,
  isFlowchartNodeElement,
  mutateElement,
  type LinkDirection,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFlowchartNodeElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type React from "react";
import type App from "./App";
import type { PendingExcalidrawElements } from "../types";

type FlowchartOperation =
  | { type: "none" }
  | { type: "canceled" }
  | { type: "creating"; pending: PendingExcalidrawElements }
  | { type: "navigating"; nodeId: ExcalidrawElement["id"] | null }
  | { type: "committed"; nodes: PendingExcalidrawElements }
  | { type: "navigationEnded" };

/**
 * Captures the App state management for the flowchart functionality.
 */
export class AppFlowchart {
  private creator = new FlowChartCreator();
  private navigator = new FlowChartNavigator();
  private drag:
    | {
        sourceId: string;
        direction: LinkDirection;
        pointerId: number;
        handle: HTMLElement;
        preview: NonDeletedExcalidrawElement;
      }
    | undefined;

  constructor(private app: App) {}

  get pendingNodes() {
    return this.drag ? [this.drag.preview] : this.creator.pendingNodes;
  }

  get dragPreview() {
    return this.drag;
  }

  startDrag = (
    event: React.PointerEvent<HTMLElement>,
    source: ExcalidrawFlowchartNodeElement,
    direction: LinkDirection,
  ) => {
    if (event.button !== 0 || this.drag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const gap = 100;
    const position = {
      x:
        source.x +
        (direction === "right"
          ? source.width + gap
          : direction === "left"
          ? -source.width - gap
          : 0),
      y:
        source.y +
        (direction === "down"
          ? source.height + gap
          : direction === "up"
          ? -source.height - gap
          : 0),
    };
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    this.drag = {
      sourceId: source.id,
      direction,
      pointerId: event.pointerId,
      handle,
      preview: cloneFlowchartNode(source, position.x, position.y),
    };
    this.app.triggerRender(true);
  };

  moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const source = this.app.scene.getNonDeletedElementsMap().get(drag.sourceId);
    if (!source || !isFlowchartNodeElement(source)) {
      this.cancelDrag();
      return;
    }
    const point = viewportCoordsToSceneCoords(event, this.app.state);
    const { direction, preview } = drag;
    const gap = 60;
    const centerX =
      direction === "right"
        ? Math.max(point.x, source.x + source.width + gap + preview.width / 2)
        : direction === "left"
        ? Math.min(point.x, source.x - gap - preview.width / 2)
        : point.x;
    const centerY =
      direction === "down"
        ? Math.max(point.y, source.y + source.height + gap + preview.height / 2)
        : direction === "up"
        ? Math.min(point.y, source.y - gap - preview.height / 2)
        : point.y;
    mutateElement(preview, this.app.scene.getNonDeletedElementsMap(), {
      x: centerX - preview.width / 2,
      y: centerY - preview.height / 2,
    });
    this.app.triggerRender(true);
  };

  finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    this.moveDrag(event);
    this.cancelDrag();
    const source = this.app.scene.getNonDeletedElementsMap().get(drag.sourceId);
    if (!source || !isFlowchartNodeElement(source)) {
      return;
    }
    const nodes = createConnectedFlowchartNode(
      source,
      this.app.state,
      drag.direction,
      this.app.scene,
      { x: drag.preview.x, y: drag.preview.y },
    );
    this.app.insertNewElements(nodes);
    this.selectAndReveal(nodes[0], "none");
    this.captureUpdate();
  };

  cancelDrag = () => {
    if (!this.drag) {
      return;
    }
    const { handle, pointerId } = this.drag;
    this.drag = undefined;
    if (handle.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
    this.app.triggerRender(true);
  };

  get isCreatingChart() {
    return this.creator.isCreatingChart;
  }

  /** ends any in-progress flowchart creation/navigation session */
  clear = () => {
    this.cancelDrag();
    this.creator.clear();
    this.navigator.clear();
  };

  handleKeyEvent = (event: React.KeyboardEvent | KeyboardEvent): boolean => {
    if (event.type === "keydown" && event.key === KEYS.ESCAPE && this.drag) {
      event.preventDefault();
      this.cancelDrag();
      return true;
    }
    const operation = this.resolveKeyboardEventToOperation(event);

    switch (operation.type) {
      case "none":
        return false;
      case "canceled":
        this.app.triggerRender(true);
        return true;
      case "creating":
        event.preventDefault();
        if (operation.pending.length) {
          this.app.revealIfHidden(operation.pending);
        }
        return true;
      case "navigating": {
        event.preventDefault();
        const node =
          operation.nodeId &&
          this.app.scene.getNonDeletedElementsMap().get(operation.nodeId);
        if (node) {
          this.selectAndReveal(node);
        }
        return true;
      }
      case "committed": {
        if (operation.nodes.length) {
          this.app.insertNewElements(operation.nodes);
        }

        const firstNode = operation.nodes[0];
        if (firstNode) {
          this.selectAndReveal(firstNode);
        }

        this.captureUpdate();
        return true;
      }
      case "navigationEnded":
        this.captureUpdate();
        return true;
    }
  };

  private resolveKeyboardEventToOperation(
    event: React.KeyboardEvent | KeyboardEvent,
  ): FlowchartOperation {
    const { creator, navigator, app } = this;

    if (event.type === "keydown") {
      if (event.key === KEYS.ESCAPE && creator.isCreatingChart) {
        creator.clear();
        return { type: "canceled" };
      }

      if (!isArrowKey(event.key)) {
        return { type: "none" };
      }

      if (event[KEYS.CTRL_OR_CMD] && !event.shiftKey) {
        const selectedElements = getSelectedElements(
          app.scene.getNonDeletedElementsMap(),
          app.state,
        );

        if (
          selectedElements.length === 1 &&
          isFlowchartNodeElement(selectedElements[0])
        ) {
          creator.createNodes(
            selectedElements[0],
            app.state,
            AppFlowchart.getLinkDirectionFromKey(event.key),
            app.scene,
          );
        }

        return { type: "creating", pending: creator.pendingNodes ?? [] };
      }

      if (event.altKey) {
        const elementsMap = app.scene.getNonDeletedElementsMap();
        const selectedElements = getSelectedElements(elementsMap, app.state);

        if (selectedElements.length === 1) {
          return {
            type: "navigating",
            nodeId: navigator.exploreByDirection(
              selectedElements[0],
              elementsMap,
              AppFlowchart.getLinkDirectionFromKey(event.key),
            ),
          };
        }
      }

      return { type: "none" };
    }

    // keyup: releasing a modifier finalizes the workflow it was driving;
    // both can finalize on the same event
    const navigationEnded = !event.altKey && navigator.isExploring;
    if (navigationEnded) {
      navigator.clear();
    }

    if (!event[KEYS.CTRL_OR_CMD] && creator.isCreatingChart) {
      const nodes = creator.pendingNodes ?? [];
      creator.clear();
      return { type: "committed", nodes };
    }

    return navigationEnded ? { type: "navigationEnded" } : { type: "none" };
  }

  private selectAndReveal(
    node: NonDeletedExcalidrawElement,
    fit: "scale-down" | "none" = "scale-down",
  ) {
    this.app.setState((prevState) => ({
      selectedElementIds: makeNextSelectedElementIds(
        { [node.id]: true },
        prevState,
      ),
    }));
    this.app.revealIfHidden([node], fit);
  }

  private captureUpdate() {
    this.app.syncActionResult({
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  private static getLinkDirectionFromKey(key: string): LinkDirection {
    switch (key) {
      case KEYS.ARROW_UP:
        return "up";
      case KEYS.ARROW_DOWN:
        return "down";
      case KEYS.ARROW_RIGHT:
        return "right";
      case KEYS.ARROW_LEFT:
        return "left";
      default:
        return "right";
    }
  }
}
