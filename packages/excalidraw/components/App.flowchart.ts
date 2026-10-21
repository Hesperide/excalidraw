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
  addNewNodes,
  deepCopyElement,
  Scene,
  type LinkDirection,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  ExcalidrawFlowchartNodeElement,
  NonDeleted,
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
  private dragPreview: PendingExcalidrawElements | null = null;
  private disposeDrag: (() => void) | null = null;

  constructor(private app: App) {}

  get pendingNodes() {
    return this.dragPreview ?? this.creator.pendingNodes;
  }

  get isCreatingChart() {
    return !!this.disposeDrag || this.creator.isCreatingChart;
  }

  /** ends any in-progress flowchart creation/navigation session */
  clear = () => {
    this.cancelDrag();
    this.creator.clear();
    this.navigator.clear();
  };

  cancelDrag = () => {
    this.disposeDrag?.();
    this.disposeDrag = null;
    this.dragPreview = null;
  };

  /**
   * Bindings mutate their endpoints. Preview against cloned scene elements,
   * and only create against the live scene once a valid drop is committed.
   */
  startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    source: NonDeleted<ExcalidrawFlowchartNodeElement>,
    direction: LinkDirection,
  ) => {
    if (event.button !== 0 || this.disposeDrag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.creator.clear();
    const { app } = this;
    const start = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    let position: { x: number; y: number } | null = null;

    const cancel = () => {
      this.cancelDrag();
      app.triggerRender(true);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) {
        return;
      }
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) {
        position = null;
        this.dragPreview = null;
        app.triggerRender(true);
        return;
      }
      const point = viewportCoordsToSceneCoords(e, app.state);
      position = {
        x: point.x - source.width / 2,
        y: point.y - source.height / 2,
      };
      // Keep the new node outside its source along the chosen axis.
      if (direction === "right") {
        position.x = Math.max(position.x, source.x + source.width + 20);
      } else if (direction === "left") {
        position.x = Math.min(position.x, source.x - source.width - 20);
      } else if (direction === "down") {
        position.y = Math.max(position.y, source.y + source.height + 20);
      } else {
        position.y = Math.min(position.y, source.y - source.height - 20);
      }
      const previewScene = new Scene();
      previewScene.replaceAllElements(
        app.scene.getElementsIncludingDeleted().map(deepCopyElement),
      );
      const previewSource = previewScene
        .getNonDeletedElementsMap()
        .get(source.id);
      if (previewSource && isFlowchartNodeElement(previewSource)) {
        this.dragPreview = addNewNodes(
          previewSource,
          app.state,
          direction,
          previewScene,
          1,
          null,
          position,
        ).nodes;
      }
      previewScene.destroy();
      app.triggerRender(true);
    };
    const drop = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) {
        return;
      }
      const { offsetLeft, offsetTop, width, height } = app.state;
      const target = app.scene.getNonDeletedElementsMap().get(source.id);
      if (
        position &&
        e.clientX >= offsetLeft &&
        e.clientX <= offsetLeft + width &&
        e.clientY >= offsetTop &&
        e.clientY <= offsetTop + height &&
        target &&
        !target.locked &&
        isFlowchartNodeElement(target)
      ) {
        const nodes = addNewNodes(
          target,
          app.state,
          direction,
          app.scene,
          1,
          null,
          position,
        ).nodes;
        this.cancelDrag();
        app.insertNewElements(nodes);
        this.selectAndReveal(nodes[0]);
        this.captureUpdate();
      } else {
        cancel();
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === KEYS.ESCAPE) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    const pointercancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        cancel();
      }
    };
    const doc = app.ownerDocument;
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", drop);
    doc.addEventListener("pointercancel", pointercancel);
    doc.addEventListener("keydown", keydown, true);
    app.ownerWindow.addEventListener("blur", cancel);
    this.disposeDrag = () => {
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("pointerup", drop);
      doc.removeEventListener("pointercancel", pointercancel);
      doc.removeEventListener("keydown", keydown, true);
      app.ownerWindow.removeEventListener("blur", cancel);
    };
    event.currentTarget.setPointerCapture?.(pointerId);
  };

  handleKeyEvent = (event: React.KeyboardEvent | KeyboardEvent): boolean => {
    // Modifier releases must never commit a second, keyboard-driven session
    // while the pointer owns the preview.
    if (this.disposeDrag) {
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
