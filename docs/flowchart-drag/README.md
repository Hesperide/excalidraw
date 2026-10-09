# Drag-to-create flowchart handles

Select one unlocked, unrotated, ungrouped rectangle or diamond. Drag one of
the four circular directional handles beyond the source to preview a same-type
step centered at the pointer. Release to add the styled step and bound elbow
connector together, with the new step selected for labeling. Release inside the
source, press Escape, cancel the pointer, or leave the window to discard the
preview without adding elements or history.

The handles stay screen-sized while their anchor positions follow zoom and
scroll. Creation uses the existing flowchart node/style cloning and elbow
binding code. Pending bindings use a copy of the source, avoiding dangling
`boundElements` when a drag is canceled.

## Browser evidence

These PNGs are actual browser captures, inspected before committing. They are
kept as normal documentation because this is a public repository.

- `flowchart-committed-labeled.png`: committed rectangle step, connector, new-step handles, and label.
- `diamond-connected-handles.png`: four handles on a selected diamond.
- `ellipse-no-handles.png`: unsupported ellipse has no connected-step handles.
- `flowchart-escape-cancelled.png`: canceled drag leaves the two-node flowchart unchanged.
- `flowchart-undo-removed-node.png`: one Undo removes the added step and connector together.
- `flowchart-redo-restored-node.png`: Redo restores both.
- `flowchart-zoom-pan-created.png`: creation after 50% zoom and canvas pan.

The browser driver performs a drag as one operation, so it could not save a
held-pointer preview screenshot. Escape was injected as a synthetic key event
during a real drag; cancellation and the pending state are also covered by
captured-pointer integration tests. The browser's early captures include a
small red diagnostics badge; it disappeared later, with no corresponding
browser-console error observed.

## Local verification

The 13 tests in `packages/excalidraw/tests/flowchartDrag.test.tsx` cover supported
and unsupported shapes, selection restrictions, style inheritance, source
binding invariants during preview/cancellation, arrow endpoint bindings, new
step selection, atomic undo/redo, Escape, pointer cancellation, and invalid
release. Existing keyboard flowchart tests remain unchanged.
