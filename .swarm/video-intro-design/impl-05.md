---
step: 5
agent: implementer
task: Scene 5 Python Sandbox composition + narration TTS
upstream:
  - .swarm/video-intro-design/plan.md
  - .swarm/video-intro-design/design.md
  - .swarm/video-intro-design/context.md
  - .swarm/video-intro-design/narration.txt
produced_at: 2026-06-11T06:45:00+08:00
status: completed
estimated_time: 35m
---

## Implementation Summary

Created **Scene 5 (Python Sandbox)** as a standalone HyperFrames sub-composition and generated the full narration audio track using Kokoro TTS.

### Scene 5 — Python Sandbox (`scene-05-sandbox.html`)

- **Duration:** 34 seconds (1:52–2:26)
- **Dimensions:** 1920×1080
- **Background:** `#0A0A0F` with subtle amber radial glow (`#F59E0B` at 12% opacity, center-left)
- **Layout:**
  - Top label: "PYTHON SANDBOX" in JetBrains Mono 16px uppercase, amber
  - Hero headline: "Need deeper analysis?" in Oswald 500, 72px
  - Three platform cards (Browser/Desktop/MCP) with SVG icons
  - Code lines per card with syntax highlighting (amber/cyan/green)
  - Blinking cyan cursor on last line
  - Bottom badge: "bsky_tools library · 33 methods" in amber-bordered pill

**Animation choreography:**
| Time | Element | Animation |
|------|---------|-----------|
| 0.2s | Top label | fade + slide down (power3.out) |
| 0.5s | Headline | slide up from y:40 (power3.out) |
| 1.2s | Three cards | stagger in from y:60 (power3.out, 0.15s stagger) |
| 2.2–5.2s | Code lines | sequential opacity reveal per card (power2.out) |
| 5.6s | Cursor | blink (steps, 28 repeats, yoyo) |
| 28.0s | Bottom badge | scale in (back.out) |

- NO exit animations (transition handles scene change)
- All animations use `gsap.fromTo()`
- NO `repeat: -1`
- NO `Math.random()`

### Narration TTS (`narration.wav`)

- **Voice:** `af_bella` (warm, professional female)
- **Engine:** Kokoro-82M (local, no API key)
- **Duration:** 85.23 seconds
- **Script:** Clean text extracted from `narration.txt` (scene markers removed)

## Lint / Validate Results

```
npx hyperframes lint .swarm/video-intro-design
→ 0 errors, 0 warnings

npx hyperframes validate .swarm/video-intro-design
→ No console errors
```

**Note:** `npx hyperframes inspect` could not run because the root `index.html` is not yet assembled (handled by Group C agent per project plan). Scene-level lint/validate both pass cleanly.

## Issues Encountered

1. **TTS dependency path issue:** `kokoro-onnx` was initially installed to a custom pip target directory (`E:\dev_app_files\pip\`) rather than the Python site-packages path that the HyperFrames CLI searches. Resolved by reinstalling with `--target` pointing to the correct Windows Store Python site-packages directory.

2. **CSS scoping warning:** Linter flagged `[data-composition-id="scene-05"]` as potentially leaking to sibling instances. Fixed by adding `id="scene-05"` to the root div and scoping CSS with `#scene-05`.

## Files Created / Modified

- `.swarm/video-intro-design/compositions/scene-05-sandbox.html` — Scene 5 sub-composition
- `.swarm/video-intro-design/audio/narration_script.txt` — Clean TTS input script
- `.swarm/video-intro-design/audio/narration.wav` — Generated narration audio (85.23s)

## Downstream Dependencies

- Root `index.html` assembly (Group C) needs to import `scene-05-sandbox.html` via `data-composition-src` with `data-start="112"` and `data-duration="34"`.
- Scene 5 should be placed on a track that doesn't overlap with adjacent scenes.
