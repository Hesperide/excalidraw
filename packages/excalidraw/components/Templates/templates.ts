import { convertToExcalidrawElements } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element/transform";

import { t } from "../../i18n";

export const TEMPLATE_CATEGORIES = [
  "all",
  "product",
  "planning",
  "workshops",
] as const;

export const TEMPLATE_IDS = [
  "userFlow",
  "mindMap",
  "retrospective",
  "customerJourney",
  "projectKickoff",
  "decisionTree",
] as const;

export type TemplateId = typeof TEMPLATE_IDS[number];
export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number];

const definitions: Record<
  TemplateId,
  {
    category: Exclude<TemplateCategory, "all">;
    positions: readonly (readonly [number, number])[];
    edges: readonly (readonly [number, number])[];
  }
> = {
  userFlow: {
    category: "product",
    positions: [
      [0, 150],
      [300, 150],
      [600, 0],
      [600, 300],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
    ],
  },
  mindMap: {
    category: "planning",
    positions: [
      [300, 150],
      [0, 0],
      [0, 300],
      [600, 0],
      [600, 300],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  retrospective: {
    category: "workshops",
    positions: [
      [0, 0],
      [260, 0],
      [520, 0],
      [0, 140],
      [260, 140],
      [520, 140],
      [0, 280],
      [260, 280],
      [520, 280],
    ],
    edges: [],
  },
  customerJourney: {
    category: "product",
    positions: [
      [0, 0],
      [250, 0],
      [500, 0],
      [750, 0],
      [0, 160],
      [250, 160],
      [500, 160],
      [750, 160],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  projectKickoff: {
    category: "planning",
    positions: [
      [0, 0],
      [260, 0],
      [520, 0],
      [0, 160],
      [260, 160],
      [520, 160],
    ],
    edges: [],
  },
  decisionTree: {
    category: "planning",
    positions: [
      [0, 150],
      [300, 150],
      [600, 0],
      [600, 300],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
    ],
  },
};

const colors = ["#f3edfc", "#fff6d9", "#e9f2ef", "#f8e8ec"];

/** Build on demand so language changes are reflected in labels and previews. */
export const getTemplates = () =>
  TEMPLATE_IDS.map((id) => {
    const definition = definitions[id];
    const labels = t(`templates.items.${id}.labels`).split("|");
    const branchLabels =
      id === "userFlow" || id === "decisionTree"
        ? t(`templates.items.${id}.branches`).split("|")
        : [];
    const skeletons: ExcalidrawElementSkeleton[] = definition.positions.map(
      ([x, y], index) => ({
        id: `${id}-${index}`,
        type: "rectangle",
        x,
        y,
        width: 180,
        height: 85,
        backgroundColor:
          colors[
            id === "retrospective" || id === "projectKickoff"
              ? [1, 2, 0][index % 3]
              : id === "mindMap"
              ? [1, 0, 2, 3, 0][index]
              : index % colors.length
          ],
        fillStyle: "solid",
        strokeColor: "#9280bd",
        strokeWidth: 1,
        label: {
          text: labels[index],
          fontSize: 18,
          strokeColor: "#655476",
        },
      }),
    );
    for (const [from, to] of definition.edges) {
      const [fromX, fromY] = definition.positions[from];
      const [toX, toY] = definition.positions[to];
      const pointsRight = toX >= fromX;
      const startX = fromX + (pointsRight ? 180 : 0);
      const endX = toX + (pointsRight ? 0 : 180);
      skeletons.push({
        type: "arrow",
        x: startX,
        y: fromY + 42.5,
        points: [pointFrom(0, 0), pointFrom(endX - startX, toY - fromY)],
        start: { id: `${id}-${from}` },
        end: { id: `${id}-${to}` },
        strokeColor: "#9280bd",
        strokeWidth: 1,
        ...(from === 1 && branchLabels[to - 2]
          ? {
              label: {
                text: branchLabels[to - 2],
                fontSize: 14,
              },
            }
          : {}),
      });
    }
    return {
      id,
      title: t(`templates.items.${id}.title`),
      subtitle: t(`templates.items.${id}.subtitle`),
      category: definition.category,
      elements: convertToExcalidrawElements(skeletons),
    };
  });
