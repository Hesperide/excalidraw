import { invariant, toBrandedType, type Bounds } from "@excalidraw/common";

import {
  clamp,
  type GlobalPoint,
  pointFrom,
  type LocalPoint,
  pointRotateRads,
} from "@excalidraw/math";

import type {
  AppState,
  PendingExcalidrawElements,
} from "@excalidraw/excalidraw/types";

import {
  bindBindingElement,
  calculateFixedPointForElbowArrowBinding,
} from "./binding";
import { updateElbowArrowPoints } from "./elbowArrow";
import {
  HEADING_DOWN,
  HEADING_LEFT,
  HEADING_RIGHT,
  HEADING_UP,
  compareHeading,
  headingForPointFromElement,
  type Heading,
} from "./heading";
import { LinearElementEditor } from "./linearElementEditor";
import { mutateElement } from "./mutateElement";
import {
  newArrowElement,
  newElement,
  newStickyNoteElement,
} from "./newElement";
import { aabbForElement, getElementAbsoluteCoords } from "./bounds";
import { elementsAreInFrameBounds, elementOverlapsWithFrame } from "./frame";
import {
  isBindableElement,
  isElbowArrow,
  isFrameElement,
  isFlowchartNodeElement,
} from "./typeChecks";
import {
  type NonDeleted,
  type ElementsMap,
  type ExcalidrawBindableElement,
  type ExcalidrawElement,
  type ExcalidrawFlowchartNodeElement,
  type NonDeletedExcalidrawElement,
  type NonDeletedSceneElementsMap,
  type Ordered,
  type OrderedExcalidrawElement,
} from "./types";

import type { Scene } from "./Scene";

export type LinkDirection = "up" | "right" | "down" | "left";

export type FlowchartHandle = {
  direction: LinkDirection;
  point: GlobalPoint;
};

const FLOWCHART_HANDLE_OFFSET = 24;
const FLOWCHART_HANDLE_HIT_RADIUS = 14;

export const isDragFlowchartNodeElement = (
  element: ExcalidrawElement,
): element is ExcalidrawFlowchartNodeElement & {
  type: "rectangle" | "diamond";
} => element.type === "rectangle" || element.type === "diamond";

export const getFlowchartHandlePoints = (
  element: ExcalidrawFlowchartNodeElement,
  elementsMap: ElementsMap,
  zoom = 1,
): FlowchartHandle[] => {
  const [x1, y1, x2, y2, cx, cy] = getElementAbsoluteCoords(
    element,
    elementsMap,
    true,
  );
  const offset = FLOWCHART_HANDLE_OFFSET / zoom;
  const points: Array<{ direction: LinkDirection; x: number; y: number }> = [
    { direction: "up", x: cx, y: y1 - offset },
    { direction: "right", x: x2 + offset, y: cy },
    { direction: "down", x: cx, y: y2 + offset },
    { direction: "left", x: x1 - offset, y: cy },
  ];

  return points.map(({ direction, x, y }) => {
    const rotated = pointRotateRads(
      pointFrom(x, y),
      pointFrom(cx, cy),
      element.angle,
    );
    return {
      direction,
      point: pointFrom<GlobalPoint>(rotated[0], rotated[1]),
    };
  });
};

export const getFlowchartHandleAtPoint = (
  element: ExcalidrawFlowchartNodeElement,
  elementsMap: ElementsMap,
  point: GlobalPoint,
  zoom = 1,
): LinkDirection | null => {
  const radius = FLOWCHART_HANDLE_HIT_RADIUS / zoom;
  return (
    getFlowchartHandlePoints(element, elementsMap, zoom).find(
      ({ point: handlePoint }) =>
        Math.hypot(point[0] - handlePoint[0], point[1] - handlePoint[1]) <=
        radius,
    )?.direction ?? null
  );
};

const VERTICAL_OFFSET = 100;
const HORIZONTAL_OFFSET = 100;

type Interval = { start: number; end: number };

const mergeIntervals = (intervals: Interval[]): Interval[] => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
};

const intervalIsFree = (start: number, size: number, occupied: Interval[]) =>
  occupied.every((o) => start + size <= o.start || start >= o.end);

// Nearest `start` for a segment of `size` avoiding every occupied interval,
// searching both sides of `ideal`; a tie resolves toward the positive side.
const findNearestFreeSlot = (
  ideal: number,
  size: number,
  occupied: Interval[],
): number => {
  if (intervalIsFree(ideal, size, occupied)) {
    return ideal;
  }

  const gapStarts = [-Infinity, ...occupied.map((o) => o.end)];
  const gapEnds = [...occupied.map((o) => o.start), Infinity];

  let best = ideal;
  let bestDistance = Infinity;
  for (let i = 0; i < gapStarts.length; i++) {
    if (gapEnds[i] - gapStarts[i] < size) {
      continue;
    }
    const start = clamp(ideal, gapStarts[i], gapEnds[i] - size);
    const distance = Math.abs(start - ideal);
    if (distance <= bestDistance) {
      best = start;
      bestDistance = distance;
    }
  }

  return best;
};

// Walk the arrow bindings to collect every node that belongs to the same
// flowchart as `node` — the whole connected component acts as the obstacle
// set during placement (#8518).
const getConnectedFlowchartNodes = (
  node: ExcalidrawBindableElement,
  elementsMap: ElementsMap,
): ExcalidrawBindableElement[] => {
  const arrows = [...elementsMap.values()].filter(isElbowArrow);
  const visited = new Set<string>([node.id]);
  const queue: string[] = [node.id];
  const connected: ExcalidrawBindableElement[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const arrow of arrows) {
      const startId = arrow.startBinding?.elementId;
      const endId = arrow.endBinding?.elementId;

      let neighborId: string | undefined;
      if (startId === currentId) {
        neighborId = endId;
      } else if (endId === currentId) {
        neighborId = startId;
      }

      if (!neighborId || visited.has(neighborId)) {
        continue;
      }

      visited.add(neighborId);
      const neighbor = elementsMap.get(neighborId);
      if (neighbor && isBindableElement(neighbor)) {
        connected.push(neighbor);
        queue.push(neighborId);
      }
    }
  }

  return connected;
};

// Place a cluster of `count` equally-sized nodes next to `parent`:
// - the primary axis (the creation direction) is fixed at exactly one gap
//   away from the parent, forming a search band the cluster will occupy
// - along the cross axis the cluster slides into the free slot nearest the
//   parent-centered ideal, treating band obstacles as immovable
// - `stickyCrossStart` anchors an already-visible pending cluster: growing it
//   extends it at either end so the existing pending nodes keep their
//   positions, unless the grown cluster no longer fits there
const placeCluster = (
  parent: ExcalidrawFlowchartNodeElement,
  direction: LinkDirection,
  count: number,
  obstacles: readonly Bounds[],
  stickyCrossStart: number | null,
): { positions: { x: number; y: number }[]; crossStart: number } => {
  const horizontal = direction === "left" || direction === "right";
  // INSIGHT: new nodes copy the parent's dimensions
  const nodePrimarySize = horizontal ? parent.width : parent.height;
  const nodeCrossSize = horizontal ? parent.height : parent.width;
  const primaryGap = horizontal ? HORIZONTAL_OFFSET : VERTICAL_OFFSET;
  const crossGap = horizontal ? VERTICAL_OFFSET : HORIZONTAL_OFFSET;

  const parentPrimaryStart = horizontal ? parent.x : parent.y;
  const parentCrossCenter = horizontal
    ? parent.y + parent.height / 2
    : parent.x + parent.width / 2;

  const primaryStart =
    direction === "right" || direction === "down"
      ? parentPrimaryStart + nodePrimarySize + primaryGap
      : parentPrimaryStart - primaryGap - nodePrimarySize;

  // cross-axis intervals of the obstacles sharing the band, inflated so the
  // cluster keeps at least one gap of clearance
  const occupied = mergeIntervals(
    obstacles
      .filter((bounds) => {
        const start = horizontal ? bounds[0] : bounds[1];
        const end = horizontal ? bounds[2] : bounds[3];
        return start < primaryStart + nodePrimarySize && end > primaryStart;
      })
      .map((bounds) => ({
        start: (horizontal ? bounds[1] : bounds[0]) - crossGap,
        end: (horizontal ? bounds[3] : bounds[2]) + crossGap,
      })),
  );

  const step = nodeCrossSize + crossGap;
  const clusterCrossSize = count * nodeCrossSize + (count - 1) * crossGap;

  const anchoredStart =
    stickyCrossStart === null
      ? null
      : [stickyCrossStart, stickyCrossStart - step]
          .filter((start) => intervalIsFree(start, clusterCrossSize, occupied))
          .sort(
            (a, b) =>
              Math.abs(a + clusterCrossSize / 2 - parentCrossCenter) -
              Math.abs(b + clusterCrossSize / 2 - parentCrossCenter),
          )[0] ?? null;

  const crossStart =
    anchoredStart ??
    findNearestFreeSlot(
      parentCrossCenter - clusterCrossSize / 2,
      clusterCrossSize,
      occupied,
    );

  const positions = Array.from({ length: count }, (_, index) => {
    const cross = crossStart + index * step;
    return horizontal
      ? { x: primaryStart, y: cross }
      : { x: cross, y: primaryStart };
  });

  return { positions, crossStart };
};

const cloneFlowchartNode = (
  template: ExcalidrawFlowchartNodeElement,
  x: number,
  y: number,
) => {
  const commonNodeProps = {
    x,
    y,
    width: template.width,
    height: template.height,
    roundness: template.roundness,
    roughness: template.roughness,
    backgroundColor: template.backgroundColor,
    strokeColor: template.strokeColor,
    strokeWidth: template.strokeWidth,
    opacity: template.opacity,
    fillStyle: template.fillStyle,
    strokeStyle: template.strokeStyle,
  };

  const node =
    template.type === "stickynote"
      ? newStickyNoteElement({
          type: "stickynote",
          ...commonNodeProps,
          baseHeight: template.baseHeight,
        })
      : newElement({
          type: template.type,
          ...commonNodeProps,
        });

  invariant(
    isFlowchartNodeElement(node),
    "not an ExcalidrawFlowchartNodeElement",
  );

  return node;
};

export const addNewNodes = (
  startNode: NonDeleted<ExcalidrawFlowchartNodeElement>,
  appState: AppState,
  direction: LinkDirection,
  scene: Scene,
  numberOfNodes: number,
  stickyCrossStart: number | null = null,
) => {
  const elementsMap = scene.getNonDeletedElementsMap();
  const obstacles = getConnectedFlowchartNodes(startNode, elementsMap).map(
    (node) => aabbForElement(node, elementsMap),
  );

  const { positions, crossStart } = placeCluster(
    startNode,
    direction,
    numberOfNodes,
    obstacles,
    stickyCrossStart,
  );

  const nodes: NonDeletedExcalidrawElement[] = [];
  for (const position of positions) {
    const nextNode = cloneFlowchartNode(startNode, position.x, position.y);
    const bindingArrow = createBindingArrow(
      startNode,
      nextNode,
      direction,
      appState,
      scene,
    );

    nodes.push(nextNode, bindingArrow);
  }

  return { nodes, crossStart };
};

const addNewNodeAt = (
  startNode: NonDeleted<ExcalidrawFlowchartNodeElement>,
  appState: AppState,
  direction: LinkDirection,
  scene: Scene,
  x: number,
  y: number,
) => {
  const nextNode = cloneFlowchartNode(startNode, x, y);
  const bindingArrow = createBindingArrow(
    startNode,
    nextNode,
    direction,
    appState,
    scene,
    false,
  );
  return [nextNode, bindingArrow] as NonDeletedExcalidrawElement[];
};

const createBindingArrow = (
  startBindingElement: NonDeleted<ExcalidrawFlowchartNodeElement>,
  endBindingElement: NonDeleted<ExcalidrawFlowchartNodeElement>,
  direction: LinkDirection,
  appState: AppState,
  scene: Scene,
  mutateBindings = true,
) => {
  let startX: number;
  let startY: number;

  const PADDING = 6;

  switch (direction) {
    case "up": {
      startX = startBindingElement.x + startBindingElement.width / 2;
      startY = startBindingElement.y - PADDING;
      break;
    }
    case "down": {
      startX = startBindingElement.x + startBindingElement.width / 2;
      startY = startBindingElement.y + startBindingElement.height + PADDING;
      break;
    }
    case "right": {
      startX = startBindingElement.x + startBindingElement.width + PADDING;
      startY = startBindingElement.y + startBindingElement.height / 2;
      break;
    }
    case "left": {
      startX = startBindingElement.x - PADDING;
      startY = startBindingElement.y + startBindingElement.height / 2;
      break;
    }
  }

  let endX: number;
  let endY: number;

  switch (direction) {
    case "up": {
      endX = endBindingElement.x + endBindingElement.width / 2 - startX;
      endY = endBindingElement.y + endBindingElement.height - startY + PADDING;
      break;
    }
    case "down": {
      endX = endBindingElement.x + endBindingElement.width / 2 - startX;
      endY = endBindingElement.y - startY - PADDING;
      break;
    }
    case "right": {
      endX = endBindingElement.x - startX - PADDING;
      endY = endBindingElement.y - startY + endBindingElement.height / 2;
      break;
    }
    case "left": {
      endX = endBindingElement.x + endBindingElement.width - startX + PADDING;
      endY = endBindingElement.y - startY + endBindingElement.height / 2;
      break;
    }
  }

  const bindingArrow = newArrowElement({
    type: "arrow",
    x: startX,
    y: startY,
    startArrowhead: null,
    endArrowhead: appState.currentItemEndArrowhead,
    strokeColor: startBindingElement.strokeColor,
    strokeStyle: startBindingElement.strokeStyle,
    strokeWidth: startBindingElement.strokeWidth,
    opacity: startBindingElement.opacity,
    roughness: startBindingElement.roughness,
    points: [pointFrom(0, 0), pointFrom(endX, endY)],
    elbowed: true,
  });

  const elementsMap = scene.getNonDeletedElementsMap();

  if (mutateBindings) {
    bindBindingElement(
      bindingArrow,
      startBindingElement,
      "orbit",
      "start",
      scene,
    );
    bindBindingElement(bindingArrow, endBindingElement, "orbit", "end", scene);
  } else {
    const previewElementsMap = toBrandedType<NonDeletedSceneElementsMap>(
      new Map([
        ...scene.getNonDeletedElementsMap().entries(),
        [startBindingElement.id, startBindingElement],
        [endBindingElement.id, endBindingElement],
        [bindingArrow.id, bindingArrow],
      ] as [string, Ordered<NonDeletedExcalidrawElement>][]),
    );
    bindingArrow.startBinding = {
      elementId: startBindingElement.id,
      mode: "orbit",
      ...calculateFixedPointForElbowArrowBinding(
        bindingArrow,
        startBindingElement,
        "start",
        previewElementsMap,
      ),
    };
    bindingArrow.endBinding = {
      elementId: endBindingElement.id,
      mode: "orbit",
      ...calculateFixedPointForElbowArrowBinding(
        bindingArrow,
        endBindingElement,
        "end",
        previewElementsMap,
      ),
    };
  }

  const changedElements = new Map<string, OrderedExcalidrawElement>();
  changedElements.set(
    startBindingElement.id,
    startBindingElement as OrderedExcalidrawElement,
  );
  changedElements.set(
    endBindingElement.id,
    endBindingElement as OrderedExcalidrawElement,
  );
  changedElements.set(
    bindingArrow.id,
    bindingArrow as OrderedExcalidrawElement,
  );

  LinearElementEditor.movePoints(
    bindingArrow,
    scene,
    new Map([
      [
        1,
        {
          point: bindingArrow.points[1],
        },
      ],
    ]),
  );

  const update = updateElbowArrowPoints(
    bindingArrow,
    toBrandedType<NonDeletedSceneElementsMap>(
      new Map([
        ...elementsMap.entries(),
        [startBindingElement.id, startBindingElement],
        [endBindingElement.id, endBindingElement],
        [bindingArrow.id, bindingArrow],
      ] as [string, Ordered<NonDeletedExcalidrawElement>][]),
    ),
    { points: bindingArrow.points },
  );

  return {
    ...bindingArrow,
    ...update,
    isDeleted: bindingArrow.isDeleted,
  };
};

export class FlowChartNavigator {
  isExploring: boolean = false;
  // nodes that are ONE link away (successor and predecessor both included)
  private sameLevelNodes: ExcalidrawElement[] = [];
  private sameLevelIndex: number = 0;
  // set it to the opposite of the defalut creation direction
  private direction: LinkDirection | null = null;
  // for speedier navigation
  private visitedNodes: Set<ExcalidrawElement["id"]> = new Set();

  clear() {
    this.isExploring = false;
    this.sameLevelNodes = [];
    this.sameLevelIndex = 0;
    this.direction = null;
    this.visitedNodes.clear();
  }

  exploreByDirection(
    element: ExcalidrawElement,
    elementsMap: ElementsMap,
    direction: LinkDirection,
  ): ExcalidrawElement["id"] | null {
    if (!isBindableElement(element)) {
      return null;
    }

    // clear if going at a different direction
    if (direction !== this.direction) {
      this.clear();
    }

    // add the current node to the visited
    if (!this.visitedNodes.has(element.id)) {
      this.visitedNodes.add(element.id);
    }

    /**
     * CASE:
     * - already started exploring, AND
     * - there are multiple nodes at the same level, AND
     * - still going at the same direction, AND
     *
     * RESULT:
     * - loop through nodes at the same level
     *
     * WHY:
     * - provides user the capability to loop through nodes at the same level
     */
    if (
      this.isExploring &&
      direction === this.direction &&
      this.sameLevelNodes.length > 1
    ) {
      this.sameLevelIndex =
        (this.sameLevelIndex + 1) % this.sameLevelNodes.length;

      return this.sameLevelNodes[this.sameLevelIndex].id;
    }

    const nodes = [
      ...FlowChartNavigator.getSuccessors(element, elementsMap, direction),
      ...FlowChartNavigator.getPredecessors(element, elementsMap, direction),
    ];

    /**
     * CASE:
     * - just started exploring at the given direction
     *
     * RESULT:
     * - go to the first node in the given direction
     */
    if (nodes.length > 0) {
      this.sameLevelIndex = 0;
      this.isExploring = true;
      this.sameLevelNodes = nodes;
      this.direction = direction;
      this.visitedNodes.add(nodes[0].id);

      return nodes[0].id;
    }

    /**
     * CASE:
     * - (just started exploring or still going at the same direction) OR
     * - there're no nodes at the given direction
     *
     * RESULT:
     * - go to some other unvisited linked node
     *
     * WHY:
     * - provide a speedier navigation from a given node to some predecessor
     *   without the user having to change arrow key
     */
    if (direction === this.direction || !this.isExploring) {
      if (!this.isExploring) {
        // just started and no other nodes at the given direction
        // so the current node is technically the first visited node
        // (this is needed so that we don't get stuck between looping through )
        this.visitedNodes.add(element.id);
      }

      const otherDirections: LinkDirection[] = [
        "up",
        "right",
        "down",
        "left",
      ].filter((dir): dir is LinkDirection => dir !== direction);

      const otherLinkedNodes = otherDirections
        .map((dir) => [
          ...FlowChartNavigator.getSuccessors(element, elementsMap, dir),
          ...FlowChartNavigator.getPredecessors(element, elementsMap, dir),
        ])
        .flat()
        .filter((linkedNode) => !this.visitedNodes.has(linkedNode.id));

      for (const linkedNode of otherLinkedNodes) {
        if (!this.visitedNodes.has(linkedNode.id)) {
          this.visitedNodes.add(linkedNode.id);
          this.isExploring = true;
          this.direction = direction;
          return linkedNode.id;
        }
      }
    }

    return null;
  }

  private static getNodeRelatives(
    type: "predecessors" | "successors",
    node: ExcalidrawBindableElement,
    elementsMap: ElementsMap,
    direction: LinkDirection,
  ) {
    const items = [...elementsMap.values()].reduce(
      (
        acc: { relative: ExcalidrawBindableElement; heading: Heading }[],
        el,
      ) => {
        let oppositeBinding;
        if (
          isElbowArrow(el) &&
          // we want check existence of the opposite binding, in the direction
          // we're interested in
          (oppositeBinding =
            el[type === "predecessors" ? "startBinding" : "endBinding"]) &&
          // similarly, we need to filter only arrows bound to target node
          el[type === "predecessors" ? "endBinding" : "startBinding"]
            ?.elementId === node.id
        ) {
          const relative = elementsMap.get(oppositeBinding.elementId);

          if (!relative) {
            return acc;
          }

          invariant(
            isBindableElement(relative),
            "not an ExcalidrawBindableElement",
          );

          const edgePoint = (
            type === "predecessors" ? el.points[el.points.length - 1] : [0, 0]
          ) as Readonly<LocalPoint>;

          const heading = headingForPointFromElement(
            node,
            aabbForElement(node, elementsMap),
            [edgePoint[0] + el.x, edgePoint[1] + el.y] as Readonly<GlobalPoint>,
          );

          acc.push({
            relative,
            heading,
          });
        }
        return acc;
      },
      [],
    );

    switch (direction) {
      case "up":
        return items
          .filter((item) => compareHeading(item.heading, HEADING_UP))
          .map((item) => item.relative);
      case "down":
        return items
          .filter((item) => compareHeading(item.heading, HEADING_DOWN))
          .map((item) => item.relative);
      case "right":
        return items
          .filter((item) => compareHeading(item.heading, HEADING_RIGHT))
          .map((item) => item.relative);
      case "left":
        return items
          .filter((item) => compareHeading(item.heading, HEADING_LEFT))
          .map((item) => item.relative);
    }
  }

  private static getSuccessors(
    node: ExcalidrawBindableElement,
    elementsMap: ElementsMap,
    direction: LinkDirection,
  ) {
    return FlowChartNavigator.getNodeRelatives(
      "successors",
      node,
      elementsMap,
      direction,
    );
  }

  private static getPredecessors(
    node: ExcalidrawBindableElement,
    elementsMap: ElementsMap,
    direction: LinkDirection,
  ) {
    return FlowChartNavigator.getNodeRelatives(
      "predecessors",
      node,
      elementsMap,
      direction,
    );
  }
}

export class FlowChartCreator {
  isCreatingChart: boolean = false;
  private numberOfNodes: number = 0;
  private direction: LinkDirection | null = null;
  // cross-axis anchor of the pending cluster, so growing it keeps the
  // already-visible pending nodes in place
  private clusterCrossStart: number | null = null;
  pendingNodes: PendingExcalidrawElements | null = null;
  private dragStartNode: NonDeleted<ExcalidrawFlowchartNodeElement> | null =
    null;
  private dragDirection: LinkDirection | null = null;
  private dragAppState: AppState | null = null;
  private dragScene: Scene | null = null;
  private dragMoved = false;

  get isDragging() {
    return this.dragStartNode !== null;
  }

  get draggingDirection() {
    return this.dragDirection;
  }

  get draggingStartNode() {
    return this.dragStartNode;
  }

  createNodes(
    startNode: NonDeleted<ExcalidrawFlowchartNodeElement>,
    appState: AppState,
    direction: LinkDirection,
    scene: Scene,
  ) {
    const elementsMap = scene.getNonDeletedElementsMap();

    if (direction !== this.direction) {
      this.numberOfNodes = 1;
      this.clusterCrossStart = null;
    } else {
      this.numberOfNodes += 1;
    }

    const { nodes, crossStart } = addNewNodes(
      startNode,
      appState,
      direction,
      scene,
      this.numberOfNodes,
      this.clusterCrossStart,
    );

    this.isCreatingChart = true;
    this.direction = direction;
    this.clusterCrossStart = crossStart;
    this.pendingNodes = nodes;

    // add pending nodes to the same frame as the start node
    // if every pending node is at least intersecting with the frame
    if (startNode.frameId) {
      const frame = elementsMap.get(startNode.frameId);

      invariant(
        frame && isFrameElement(frame),
        "not an ExcalidrawFrameElement",
      );

      if (
        frame &&
        this.pendingNodes.every(
          (node) =>
            elementsAreInFrameBounds([node], frame, elementsMap) ||
            elementOverlapsWithFrame(node, frame, elementsMap),
        )
      ) {
        this.pendingNodes = this.pendingNodes.map((node) =>
          mutateElement(node, elementsMap, {
            frameId: startNode.frameId,
          }),
        );
      }
    }
  }

  beginDrag(
    startNode: NonDeleted<ExcalidrawFlowchartNodeElement>,
    direction: LinkDirection,
    appState: AppState,
    scene: Scene,
  ) {
    this.clear();
    this.dragStartNode = startNode;
    this.dragDirection = direction;
    this.dragAppState = appState;
    this.dragScene = scene;
    this.isCreatingChart = true;
    this.pendingNodes = null;
    this.dragMoved = false;
  }

  updateDrag(point: GlobalPoint) {
    if (
      !this.dragStartNode ||
      !this.dragDirection ||
      !this.dragAppState ||
      !this.dragScene
    ) {
      return;
    }

    const node = this.dragStartNode;
    const halfWidth = node.width / 2;
    const halfHeight = node.height / 2;
    let x = point[0] - halfWidth;
    let y = point[1] - halfHeight;

    switch (this.dragDirection) {
      case "right":
        x = Math.max(x, node.x + node.width + HORIZONTAL_OFFSET);
        break;
      case "left":
        x = Math.min(x, node.x - HORIZONTAL_OFFSET - node.width);
        break;
      case "down":
        y = Math.max(y, node.y + node.height + VERTICAL_OFFSET);
        break;
      case "up":
        y = Math.min(y, node.y - VERTICAL_OFFSET - node.height);
        break;
    }

    this.dragMoved =
      this.dragMoved ||
      Math.hypot(
        point[0] - (node.x + node.width / 2),
        point[1] - (node.y + node.height / 2),
      ) > 4;
    this.pendingNodes = addNewNodeAt(
      node,
      this.dragAppState,
      this.dragDirection,
      this.dragScene,
      x,
      y,
    );
  }

  commitDrag() {
    if (!this.isDragging || !this.dragMoved) {
      this.clear();
      return null;
    }
    const nodes = this.pendingNodes;
    const startNode = this.dragStartNode;
    this.dragStartNode = null;
    this.dragDirection = null;
    this.dragAppState = null;
    this.dragScene = null;
    this.pendingNodes = null;
    this.isCreatingChart = false;
    this.dragMoved = false;
    return nodes && startNode ? { nodes, startNode } : null;
  }

  cancelDrag() {
    if (!this.isDragging) {
      return;
    }
    this.clear();
  }

  clear() {
    this.isCreatingChart = false;
    this.pendingNodes = null;
    this.direction = null;
    this.numberOfNodes = 0;
    this.clusterCrossStart = null;
    this.dragStartNode = null;
    this.dragDirection = null;
    this.dragAppState = null;
    this.dragScene = null;
    this.dragMoved = false;
  }
}

export const isNodeInFlowchart = (
  element: ExcalidrawFlowchartNodeElement,
  elementsMap: ElementsMap,
) => {
  for (const [, el] of elementsMap) {
    if (
      el.type === "arrow" &&
      (el.startBinding?.elementId === element.id ||
        el.endBinding?.elementId === element.id)
    ) {
      return true;
    }
  }

  return false;
};
