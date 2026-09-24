import { isArrowKey, KEYS } from "@excalidraw/common";

import { pointFrom, type GlobalPoint } from "@excalidraw/math";

import {
  makeNextSelectedElementIds,
  CaptureUpdateAction,
  FlowChartCreator,
  FlowChartNavigator,
  addNewNodes,
  getFlowchartControlAtPoint,
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

  constructor(private app: App) {}

  get pendingNodes() {
    return this.creator.pendingNodes;
  }

  get isCreatingChart() {
    return this.creator.isCreatingChart;
  }

  handlePointerDown = (point: { x: number; y: number }): boolean => {
    if (
      !this.app.isInteractionEnabled() ||
      this.app.state.viewModeEnabled ||
      this.app.state.activeTool.type !== "selection" ||
      this.app.state.editingTextElement ||
      this.app.state.selectionElement ||
      this.app.state.newElement ||
      this.app.state.multiElement ||
      this.app.state.selectedLinearElement ||
      this.app.state.isCropping ||
      this.app.state.croppingElementId ||
      this.app.state.isRotating ||
      this.app.state.selectedElementsAreBeingDragged ||
      this.app.state.activeEmbeddable ||
      this.isCreatingChart
    ) {
      return false;
    }

    const selectedElements = getSelectedElements(
      this.app.scene.getNonDeletedElementsMap(),
      this.app.state,
    );
    const selectedElement = selectedElements[0];

    if (
      selectedElements.length !== 1 ||
      !selectedElement ||
      selectedElement.locked ||
      (selectedElement.type !== "rectangle" &&
        selectedElement.type !== "diamond")
    ) {
      return false;
    }

    const direction = getFlowchartControlAtPoint(
      selectedElement,
      pointFrom<GlobalPoint>(point.x, point.y),
      this.app.state.zoom.value,
    );
    if (!direction) {
      return false;
    }

    const { nodes } = addNewNodes(
      selectedElement,
      this.app.state,
      direction,
      this.app.scene,
      1,
    );
    this.captureUpdate();
    this.app.insertNewElements(nodes);

    const firstNode = nodes[0];
    if (firstNode && isFlowchartNodeElement(firstNode)) {
      this.selectAndReveal(firstNode);
    }
    return true;
  };

  /** ends any in-progress flowchart creation/navigation session */
  clear = () => {
    this.creator.clear();
    this.navigator.clear();
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
