import { useEffect, useMemo, useRef, useState } from "react";

import { LIBRARY_DISABLED_TYPES, randomId } from "@excalidraw/common";

import { useI18n } from "../../i18n";

import { useApp, useAppProps, useExcalidrawSetAppState } from "../App";
import { Dialog } from "../Dialog";
import { MagicIcon, PlusIcon, searchIcon } from "../icons";
import { FilledButton } from "../FilledButton";

import { TemplatePreview } from "./TemplatePreview";
import { getTemplates, TEMPLATE_CATEGORIES } from "./templates";

import "./Templates.scss";

import type { TemplateCategory, TemplateId } from "./templates";
import type { ExcalidrawProps } from "../../types";

type Draft = Awaited<
  ReturnType<NonNullable<ExcalidrawProps["onGenerateTemplate"]>>
>;
type Detail = Parameters<
  NonNullable<ExcalidrawProps["onGenerateTemplate"]>
>[0]["detail"];

export const Templates = () => {
  const app = useApp();
  const { onGenerateTemplate, aiEnabled } = useAppProps();
  const { t, langCode } = useI18n();
  const setAppState = useExcalidrawSetAppState();
  // `t` reads the current language globally; rebuild only when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const templates = useMemo(() => getTemplates(), [langCode]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("all");
  const [selectedId, setSelectedId] = useState<TemplateId | "custom" | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [detail, setDetail] = useState<Detail>("balanced");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const promptId = `${app.id}-template-prompt`;
  const nameId = `${app.id}-template-name`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const selected = templates.find((template) => template.id === selectedId);
  const preview = draft ?? selected;
  const title = selected?.title ?? t("templates.customTitle");
  const canGenerate = aiEnabled && !!onGenerateTemplate;
  const filtered = templates.filter(
    (template) =>
      (category === "all" || template.category === category) &&
      `${template.title} ${template.subtitle}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );

  const open = (id: typeof selectedId) => {
    controller.current?.abort();
    controller.current = null;
    setPending(false);
    setSelectedId(id);
    setDraft(null);
    setError(false);
    setPrompt("");
  };

  const generate = async () => {
    if (
      !canGenerate ||
      !onGenerateTemplate ||
      pending ||
      prompt.trim().length < 5
    ) {
      return;
    }
    const request = new app.ownerWindow.AbortController();
    controller.current?.abort();
    controller.current = request;
    setPending(true);
    setError(false);
    try {
      const result = await onGenerateTemplate({
        prompt: prompt.trim(),
        template: selected?.title,
        detail,
        signal: request.signal,
      });
      if (request.signal.aborted || !mounted.current) {
        return;
      }
      if (!result.elements.some((element) => !element.isDeleted)) {
        throw new Error("Template generation returned no visible elements");
      }
      setDraft({
        ...result,
        elements: result.elements.filter((element) => !element.isDeleted),
      });
    } catch (error) {
      if (!request.signal.aborted && mounted.current) {
        console.error("Template generation failed", error);
        setError(true);
      }
    } finally {
      if (controller.current === request && mounted.current) {
        controller.current = null;
        setPending(false);
      }
    }
  };

  const insert = () => {
    if (!preview) {
      return;
    }
    app.addElementsFromPasteOrLibrary({
      elements: preview.elements,
      files: draft?.files ?? null,
      position: "center",
      fit: "scale-down",
    });
    setAppState({ openSidebar: null });
    app.focusContainer();
  };

  // Native library items cannot carry binary files or embedded content.
  const canSave =
    !!preview &&
    !preview.elements.some((element) =>
      Array.from(LIBRARY_DISABLED_TYPES).some((type) => type === element.type),
    );

  const save = async () => {
    if (!preview || !saveName?.trim() || saving || !canSave) {
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      await app.library.setLibrary((items) => [
        {
          id: randomId(),
          status: "unpublished",
          created: Date.now(),
          name: saveName.trim(),
          elements: [...preview.elements],
        },
        ...items,
      ]);
      if (mounted.current) {
        setSaveName(null);
        setAppState({ toast: { message: t("templates.saved") } });
      }
    } catch (error) {
      console.error("Could not save template", error);
      if (mounted.current) {
        setSaveError(true);
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  };

  return (
    <div
      className="templates"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selectedId && saveName === null) {
          event.stopPropagation();
          open(null);
        }
      }}
    >
      {selectedId ? (
        <div className="templates__detail">
          <button className="templates__back" onClick={() => open(null)}>
            {t("templates.back")}
          </button>
          {preview ? (
            <TemplatePreview
              elements={preview.elements}
              files={draft?.files}
              title={title}
            />
          ) : (
            <div className="templates__custom">
              {MagicIcon}
              <span>{t("templates.customHint")}</span>
            </div>
          )}
          <span className="templates__badge">
            {draft
              ? t("templates.draft")
              : selected
              ? t(`templates.categories.${selected.category}`)
              : t("templates.createWithAI")}
          </span>
          <h2>{title}</h2>
          <p>
            {draft ? t("templates.review") : t("templates.detailDescription")}
          </p>
          {preview && (
            <>
              <FilledButton
                label={t("templates.insert")}
                icon={PlusIcon}
                onClick={insert}
                disabled={pending}
              />
              <button
                className="templates__secondary"
                disabled={pending || !canSave}
                onClick={() => {
                  setSaveError(false);
                  setSaveName(title);
                }}
              >
                {t("templates.save")}
              </button>
              {!canSave && (
                <p className="templates__note">{t("templates.cannotSave")}</p>
              )}
              <p className="templates__note">{t("templates.previewOnly")}</p>
            </>
          )}
          {aiEnabled && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void generate();
              }}
            >
              <label htmlFor={promptId}>{t("templates.promptLabel")}</label>
              <textarea
                id={promptId}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t("templates.promptPlaceholder")}
                minLength={5}
                maxLength={2900}
                required
                disabled={pending || !canGenerate}
              />
              <fieldset disabled={pending || !canGenerate}>
                <legend>{t("templates.detailLevel")}</legend>
                <div className="templates__choices">
                  {(["simple", "balanced", "detailed"] as const).map(
                    (value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={detail === value}
                        onClick={() => setDetail(value)}
                      >
                        {t(`templates.detail.${value}`)}
                      </button>
                    ),
                  )}
                </div>
              </fieldset>
              {error && (
                <p className="templates__error" role="alert">
                  {t("templates.error")}
                </p>
              )}
              {!canGenerate && (
                <p className="templates__note">{t("templates.unavailable")}</p>
              )}
              <FilledButton
                onClick={() => void generate()}
                label={
                  pending
                    ? t("templates.generating")
                    : error
                    ? t("templates.retry")
                    : draft
                    ? t("templates.regenerate")
                    : t("templates.generate")
                }
                icon={MagicIcon}
                disabled={!canGenerate || pending || prompt.trim().length < 5}
              />
              {pending && (
                <button
                  type="button"
                  className="templates__secondary"
                  onClick={() => {
                    controller.current?.abort();
                    controller.current = null;
                    setPending(false);
                  }}
                >
                  {t("buttons.cancel")}
                </button>
              )}
              <p className="templates__note" role="status">
                {pending
                  ? t("templates.generatingHint")
                  : t("templates.editable")}
              </p>
            </form>
          )}
        </div>
      ) : (
        <>
          {aiEnabled && (
            <div className="templates__banner">
              <span className="templates__badge">
                {MagicIcon}
                {t("templates.startWithAI")}
              </span>
              <h3>{t("templates.headStart")}</h3>
              <p>{t("templates.bannerDescription")}</p>
              <FilledButton
                label={t("templates.createCustom")}
                icon={PlusIcon}
                onClick={() => open("custom")}
              />
            </div>
          )}
          <div className="templates__search">
            {searchIcon}
            <input
              aria-label={t("templates.search")}
              placeholder={t("templates.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            className="templates__categories"
            aria-label={t("templates.category")}
          >
            {TEMPLATE_CATEGORIES.map((value) => (
              <button
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {t(`templates.categories.${value}`)}
              </button>
            ))}
          </div>
          <div className="templates__heading">
            <span>{t("templates.galleryHeading")}</span>
            <span role="status">
              {t("templates.count", { count: filtered.length })}
            </span>
          </div>
          <div className="templates__grid">
            {filtered.map((template) => (
              <button
                className="templates__card"
                key={template.id}
                onClick={() => open(template.id)}
              >
                <TemplatePreview
                  elements={template.elements}
                  title={template.title}
                />
                <strong>{template.title}</strong>
                <span>{template.subtitle}</span>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <div className="templates__empty">
              {searchIcon}
              <h3>{t("templates.noResults")}</h3>
              <p>{t("templates.noResultsHint")}</p>
              <button
                className="templates__secondary"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                {t("templates.clearFilters")}
              </button>
            </div>
          )}
        </>
      )}
      {saveName !== null && (
        <Dialog
          title={t("templates.save")}
          size="small"
          onCloseRequest={() => {
            if (!saving) {
              setSaveName(null);
            }
          }}
        >
          <form
            className="templates templates__save"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label htmlFor={nameId}>{t("templates.name")}</label>
            <input
              id={nameId}
              value={saveName}
              required
              maxLength={100}
              disabled={saving}
              onChange={(event) => setSaveName(event.target.value)}
            />
            {saveError && (
              <p role="alert" className="templates__error">
                {t("templates.saveError")}
              </p>
            )}
            <div className="templates__choices">
              <button
                type="button"
                className="templates__secondary"
                disabled={saving}
                onClick={() => setSaveName(null)}
              >
                {t("buttons.cancel")}
              </button>
              <FilledButton
                onClick={() => void save()}
                label={t("templates.saveConfirm")}
                disabled={saving || !saveName.trim()}
              />
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
};
