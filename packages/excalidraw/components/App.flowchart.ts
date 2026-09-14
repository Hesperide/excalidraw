import {
  isArrowKey,
  KEYS,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import { pointFrom, type GlobalPoint } from "@excalidraw/math";

import {
  bindBindingElement,
  getFlowchartHandleAtPoint,
  getFlowchartHandlePoints,
  isArrowElement,
  isDragFlowchartNodeElement,
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
  private dragPointerId: number | null = null;
  private removeDragListeners: (() => void) | null = null;

  constructor(private app: App) {}

  get pendingNodes() {
    return this.creator.pendingNodes;
  }

  get isCreatingChart() {
    return this.creator.isCreatingChart;
  }

  /** ends any in-progress flowchart creation/navigation session */
  clear = () => {
    this.removeDragListeners?.();
    this.removeDragListeners = null;
    this.dragPointerId = null;
    this.creator.clear();
    this.navigator.clear();
  };

  isDragging = () => this.creator.isDragging;

  getDirectionalHandlePoints = (element: NonDeletedExcalidrawElement) =>
    isDragFlowchartNodeElement(element)
      ? getFlowchartHandlePoints(
          element,
          this.app.scene.getNonDeletedElementsMap(),
          this.app.state.zoom.value,
        )
      : [];

  handlePointerDown = (event: React.PointerEvent<HTMLElement>): boolean => {
    if (
      this.dragPointerId !== null ||
      this.app.state.viewModeEnabled ||
      this.app.state.activeTool.type !== "selection"
    ) {
      return false;
    }

    const selectedElements = this.app.scene.getSelectedElements(this.app.state);
    const selectedElement = selectedElements[0];
    if (
      selectedElements.length !== 1 ||
      !selectedElement ||
      !isDragFlowchartNodeElement(selectedElement) ||
      selectedElement.locked ||
      this.app.state.selectedLinearElement
    ) {
      return false;
    }

    const pointer = viewportCoordsToSceneCoords(event, this.app.state);
    const direction = getFlowchartHandleAtPoint(
      selectedElement,
      this.app.scene.getNonDeletedElementsMap(),
      pointFrom<GlobalPoint>(pointer.x, pointer.y),
      this.app.state.zoom.value,
    );
    if (!direction) {
      return false;
    }

    this.dragPointerId = event.pointerId;
    this.creator.beginDrag(
      selectedElement,
      direction,
      this.app.state,
      this.app.scene,
    );
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== this.dragPointerId) {
        return;
      }
      const next = viewportCoordsToSceneCoords(
        {
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
        },
        this.app.state,
      );
      this.creator.updateDrag(pointFrom<GlobalPoint>(next.x, next.y));
      this.app.triggerRender(true);
    };
    const onPointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== this.dragPointerId) {
        return;
      }
      this.finishDrag(upEvent.type === "pointerup");
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === KEYS.ESCAPE) {
        keyEvent.preventDefault();
        this.cancelDrag();
      }
    };

    this.removeDragListeners = () => {
      this.app.ownerWindow.removeEventListener("pointermove", onPointerMove);
      this.app.ownerWindow.removeEventListener("pointerup", onPointerUp);
      this.app.ownerWindow.removeEventListener("pointercancel", onPointerUp);
      this.app.ownerWindow.removeEventListener("keydown", onKeyDown);
    };
    this.app.ownerWindow.addEventListener("pointermove", onPointerMove);
    this.app.ownerWindow.addEventListener("pointerup", onPointerUp);
    this.app.ownerWindow.addEventListener("pointercancel", onPointerUp);
    this.app.ownerWindow.addEventListener("keydown", onKeyDown);
    return true;
  };

  private finishDrag = (commit: boolean) => {
    this.removeDragListeners?.();
    this.removeDragListeners = null;
    this.dragPointerId = null;

    if (!commit) {
      this.creator.cancelDrag();
      this.app.triggerRender(true);
      return;
    }

    const result = this.creator.commitDrag();
    if (!result) {
      this.app.triggerRender(true);
      return;
    }

    this.app.insertNewElements(result.nodes);
    const nextNode = result.nodes.find(
      (element) => element.type === "rectangle" || element.type === "diamond",
    );
    const arrow = result.nodes.find(isArrowElement);
    if (arrow && nextNode && isDragFlowchartNodeElement(nextNode)) {
      bindBindingElement(
        arrow,
        result.startNode,
        "orbit",
        "start",
        this.app.scene,
      );
      bindBindingElement(arrow, nextNode, "orbit", "end", this.app.scene);
    }
    if (nextNode) {
      this.selectAndReveal(nextNode);
    }
    this.captureUpdate();
  };

  private cancelDrag = () => {
    if (!this.creator.isDragging) {
      return;
    }
    this.finishDrag(false);
  };

  handlePointerCancel = () => {
    this.cancelDrag();
  };

  handleKeyEvent = (event: React.KeyboardEvent | KeyboardEvent): boolean => {
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
        if (creator.isDragging) {
          this.cancelDrag();
        } else {
          creator.clear();
        }
        return { type: "canceled" };
      }

      if (creator.isDragging) {
        return { type: "none" };
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

    if (
      !creator.isDragging &&
      !event[KEYS.CTRL_OR_CMD] &&
      creator.isCreatingChart
    ) {
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
