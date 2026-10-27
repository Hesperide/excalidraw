---
name: Video export timing
description: Why overlays timed off a <video> element's playback position disappear in the video export, and what to time them from instead.
---

Time overlays in video artifacts (highlight boxes, dimming, callouts) from the scene clock (`useSceneTimer`, relative to each scene's start). Don't time them from a requestAnimationFrame loop that reads `<video>.currentTime`.

**Why:** In the annotated idea-to-PR film, the boxes looked right in the preview and in a top-level headless Chromium run. They were still missing from the user's export, while the step list (driven by the scene clock) exported fine. The export renderer's time model doesn't reliably advance rAF loops or `<video>.currentTime`.

**How to apply:** For any footage-plus-annotation film, write the overlay timings as absolute film seconds. Convert them into per-scene `useSceneTimer` events, and keep seeking the media only when the scene changes. Preview checks can't catch this, so ask the user to re-export to confirm.
