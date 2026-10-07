import {
  isArrowKey,
  KEYS,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";

import {
  makeNextSelectedElementIds,
  CaptureUpdateAction,
  FlowChartCreator,
  FlowChartNavigator,
  getSelectedElements,
  isFlowchartNodeElement,
  type LinkDirection,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
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
  private dragToCreate: {
    source: NonDeleted<ExcalidrawFlowchartNodeElement>;
    direction: LinkDirection;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null = null;

  constructor(private app: App) {}

  get pendingNodes() {
    return this.creator.pendingNodes;
  }

  get isCreatingChart() {
    return this.creator.isCreatingChart;
  }

  get isDraggingToCreate() {
    return this.dragToCreate !== null;
  }

  get draggedSourceId() {
    return this.dragToCreate?.source.id;
  }

  /** ends any in-progress flowchart creation/navigation session */
  clear = () => {
    this.creator.clear();
    this.navigator.clear();
    this.dragToCreate = null;
  };

  startDragToCreate = (
    source: NonDeleted<ExcalidrawFlowchartNodeElement>,
    direction: LinkDirection,
    event: React.PointerEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    this.dragToCreate = {
      source,
      direction,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    this.creator.clear();
    this.creator.createNodes(source, this.app.state, direction, this.app.scene);
    this.app.triggerRender(true);
  };

  updateDragToCreate = (event: React.PointerEvent) => {
    const drag = this.dragToCreate;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8
    ) {
      return;
    }
    drag.moved = true;

    const pointer = viewportCoordsToSceneCoords(event, this.app.state);
    const gridSize =
      this.app.state.gridModeEnabled && this.app.state.gridSize > 0
        ? this.app.state.gridSize
        : null;
    const snap = (value: number) =>
      gridSize ? Math.round(value / gridSize) * gridSize : value;

    this.creator.createNodes(
      drag.source,
      this.app.state,
      drag.direction,
      this.app.scene,
      {
        x: snap(pointer.x - drag.source.width / 2),
        y: snap(pointer.y - drag.source.height / 2),
      },
    );
    this.app.triggerRender(true);
  };

  endDragToCreate = (event: React.PointerEvent) => {
    const drag = this.dragToCreate;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const pointer = viewportCoordsToSceneCoords(event, this.app.state);
    const cancelPadding = 8 / this.app.state.zoom.value;
    const releasedOverSource =
      pointer.x >= drag.source.x - cancelPadding &&
      pointer.x <= drag.source.x + drag.source.width + cancelPadding &&
      pointer.y >= drag.source.y - cancelPadding &&
      pointer.y <= drag.source.y + drag.source.height + cancelPadding;

    if (drag.moved && releasedOverSource) {
      this.cancelDragToCreate();
      return;
    }

    if (drag.moved) {
      this.updateDragToCreate(event);
    } else {
      // A click without a meaningful drag creates the usual one-gap successor.
      this.creator.createNodes(
        drag.source,
        this.app.state,
        drag.direction,
        this.app.scene,
      );
    }

    const nodes = this.creator.pendingNodes ?? [];
    this.dragToCreate = null;
    this.creator.clear();
    this.commitNodes(nodes);
  };

  cancelDragToCreate = (pointerId?: number) => {
    if (
      !this.dragToCreate ||
      (pointerId !== undefined && pointerId !== this.dragToCreate.pointerId)
    ) {
      return;
    }
    this.dragToCreate = null;
    this.creator.clear();
    this.app.triggerRender(true);
  };

  handleKeyEvent = (event: React.KeyboardEvent | KeyboardEvent): boolean => {
    const operation = this.resolveKeyboardEventToOperation(event);

    switch (operation.type) {
      case "none":
        return false;
      case "canceled":
        event.preventDefault();
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
        this.commitNodes(operation.nodes);
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
        if (this.dragToCreate) {
          this.cancelDragToCreate();
          return { type: "canceled" };
        }
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

  private selectAndReveal(node: NonDeletedExcalidrawElement) {
    this.app.setState((prevState) => ({
      selectedElementIds: makeNextSelectedElementIds(
        { [node.id]: true },
        prevState,
      ),
    }));
    this.app.revealIfHidden([node]);
  }

  private commitNodes(nodes: PendingExcalidrawElements) {
    if (nodes.length) {
      this.app.insertNewElements(nodes);
      this.selectAndReveal(nodes[0]);
    }
    this.captureUpdate();
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
