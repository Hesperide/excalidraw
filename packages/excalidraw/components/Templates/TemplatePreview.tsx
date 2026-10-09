import { useEffect, useRef, useState } from "react";

import { exportToSvg } from "@excalidraw/utils/export";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";

import type { BinaryFiles } from "../../types";

export const TemplatePreview = ({
  elements,
  files,
  title,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  files?: BinaryFiles;
  title: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { theme } = useUIAppState();

  useEffect(() => {
    let disposed = false;
    const node = ref.current;
    setFailed(false);
    node?.replaceChildren();
    exportToSvg({
      elements,
      files: files ?? null,
      appState: {
        exportBackground: false,
        exportWithDarkMode: theme === "dark",
      },
      renderEmbeddables: false,
      skipInliningFonts: true,
    }).then(
      (svg) => {
        if (!disposed && node) {
          node.replaceChildren(node.ownerDocument.importNode(svg, true));
        }
      },
      (error) => {
        console.error("Could not render template preview", error);
        if (!disposed) {
          setFailed(true);
        }
      },
    );
    return () => {
      disposed = true;
      node?.replaceChildren();
    };
  }, [elements, files, theme]);

  return (
    <div className="templates__preview" role="img" aria-label={title}>
      <div ref={ref} />
      {failed && <span>{t("templates.previewFailed")}</span>}
    </div>
  );
};
