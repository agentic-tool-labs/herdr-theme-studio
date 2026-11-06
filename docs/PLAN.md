# Theme Studio — build plan

Design: https://claude.ai/artifact/DRppYnTKDVgabwYix9xWKd (`docs/theme-studio-design.html`).
Target: Herdr app 0.1.13, macOS. A herdr-app mod at `~/.config/herdr-app/mods/theme-studio/`.
The source lives in this repo, and `mods/theme-studio` is symlinked into the Herdr home.

## Decisions (5 Nov 2026)

- Name `theme-studio`, opened with ⌃⇧Y (not bound in `keys.json`; confirm against `keys()` at runtime).
- The frosted-wallpaper background ships in v1, labelled "wallpaper only".
- Desktop only. No sync to the TUI's `~/.config/herdr/config.toml`.
- Real window blur: herdr-app#190 already asks for it (`window_opacity`, `window_blur`, and the author has a draft PR). Add a use-case comment there rather than open a duplicate. The Studio keeps a disabled "True window blur" switch that turns on when `settings()` reports those keys.

## Phase 0 — Spike (answers decide what the later phases build)

Throwaway scripts, run against the live app. Snapshot `settings.json` and `layouts/.state/` first; restore them afterwards.

| # | Question | How | If no |
|---|---|---|---|
| S1 | Does `layout.set` on shipped `main` accept `terminal_opacity`, root `background` and the tab block's `pane`? | `herdr-app do layout.set` with a modified `layout()` tree, check `layout.error`, `herdr-app shot` | Glass works only on a Studio-owned clone `studio-main` (`layout.clone`), and the Studio switches to it |
| S2 | Does a `#rrggbbaa` `chrome` override let the root background image show through the sidebar and tab bar? (#190 warns that alpha layers stack until nearly solid) | settings `colors.chrome = "#19191e80"` over an image background, then `shot` | Drop the chrome-opacity slider |
| S3 | Does `osascript -l JavaScript` with CIGaussianBlur read the wallpaper and write a JPEG with no permission prompt? | `frost.js` standalone, `exec` from a scratch mod | Fall back to `swift` if it's installed; otherwise hide Frosted wallpaper |
| S4 | How quickly does the app pick up debounced writes? | slider write loop, watch `shot` timestamps | Raise the debounce |

Exit: each answer recorded in this file, and the design artifact updated where an answer removes a feature.

## Phase 1 — Skeleton and pure core

- `mod.json` `{ "place": "none", "focusable": true }`; `main.js` opens as `openOverlay({kind:"window", key:"theme-studio", keep:true})`, with tabs Themes / Colors / Type / Glass / Library.
- `keys.json`: merge `ctrl-shift-y → mod.open {name:"theme-studio"}` without replacing anything the user has bound.
- `lib.js`, pure with no `herdr` imports:
  - `contrast(a, b)`: WCAG ratio
  - `mergeSettings(old, patch)`: key-level merge that preserves unknown keys
  - `toThemeFile(palette, overrides)`: writes only the tokens that were touched
  - `parseGhostty`, `parseKitty`, `parseAlacritty` → palette
- `lib.test.mjs`: plain `node:assert`, with one case per parser (a real theme file from each tool), contrast against known pairs (#000/#fff = 21), and a merge that preserves foreign keys. It must fail when it should: break a parser once, see the test go red, then revert.
- `store.js`: the only module that writes. `writeTextFile(path, text, expected)` for settings, `run("layout.set")` for layouts, debounced to 120 ms. After each write it reads `*.error` and shows any problem as a toast.
- Snapshot on first write → `data/theme-studio/backup-<time>.json`, with `restore()`.

Done when `node lib.test.mjs` passes, `herdr-app check mods/theme-studio` passes, and ⌃⇧Y opens an empty tabbed window.

## Phase 2 — Themes, Colors, Type

- **Themes:** cards from `themes()` plus `presets/*.json` (Tokyo Night, Catppuccin Mocha and Latte, Gruvbox, Nord, Rosé Pine, Dracula, Kanagawa, Everforest, Solarized dark and light, One Light: MIT or similar, with a license line in each file). Separate dark and light picks write `theme: {light, dark}`. A preset is copied to `themes/studio-<name>.json` when first used.
- **Colors:** grouped tokens (Surfaces, Lines, Text, Accent, Status, ANSI 0–15, cursor, selection), each a swatch and a hex input. Contrast badges on text tokens (4.5:1, and 3:1 for dim and accent). A Reset button per token removes its override. Editing a shipped theme forks it to `studio-<name>-custom`.
- **Type:** terminal font from `fonts()` with a monospace-first sort, size slider, UI font, ligatures, `minimum_contrast`. "Add font file…" copies a `.ttf`/`.otf` into the home's `fonts/`.

Done when each control changes the real window, as confirmed by `herdr-app shot` for one control per tab, and light and dark switching with system appearance picks the right theme.

## Phase 3 — Glass and frames

- Background: solid / gradient (two theme colors plus an angle) / image (`pickFolder` isn't a file picker, so use a typed path or drop with `.on_drop`) / frosted wallpaper.
- `frost.js`: wallpaper path → blur radius, dim and saturation knobs → `backgrounds/studio-frost.jpg`. A 60 s timer compares the wallpaper path and rebuilds only when it changes.
- Sliders for terminal opacity, pane radius, gap and border width; focus border color; shadow sm/md/lg; chrome opacity if S2 passed.
- Write path: S1's answer (layout.set on `main`, or on the clone).

Done when frosted wallpaper with 0.8 opacity matches the mock in a `shot`, and Revert restores the before-Studio `shot`.

## Phase 4 — Library

- Saved looks: a named bundle of theme, fonts, overrides and glass in `data/theme-studio/looks.json`; apply in one click.
- Import: a paste box auto-detects Ghostty, kitty or Alacritty → `lib.js` parser → preview → save as a theme.
- Export: "Copy theme JSON", and "Export for herdr.dev", which writes `export/<name>/` with the mod and theme files, `RECIPE.md` and a `preview.png` from `herdr-app shot`.
- Done 5 Nov: use-case comment posted on herdr-app#190 (https://github.com/herdrdev/herdr-app/issues/190#issuecomment-6666669587). Follow the draft PR there.

## Risks

- Herdr rewrites its shipped files on start, so the Studio never edits shipped themes, layouts or mods.
- Two writers to `settings.json` (the Studio and Settings → Look): the `expected` content guard stops either losing the other's edit.
- A redraw on every slider tick costs battery, so writes are debounced and the Studio's own preview is drawn locally.
- `layout.set` on a shipped layout records "clicks" in `.state/`; Revert must clear those too, using `layout.reset` as a last resort.

## Status (5 Nov 2026): built, phases 0–4 done

Spike answers:
- **S1:** `layout.set` on shipped `main` accepts `background` only. `terminal_opacity` and `pane` are refused, so the Glass tab makes a personal copy (`<layout>-glass`). Settings-level `terminal_opacity` is ignored.
- **S2:** `#rrggbbaa` works for `chrome`, `canvas` and pane backgrounds. Translucent chrome shows the layout background.
- **S3:** JXA Core Image blur: 0.4 s, no permission prompt (NSWorkspace, not System Events).
- **S4:** `layout.set` applies in about 1 s; edits to a layout file take about 4 s. Theme file edits don't apply until the theme is picked again, so the Studio re-picks after each write.

Found during the build:
- A layout switch closes overlay windows and ends their tasks, so post-switch steps run as a detached `herdr-app do` script that reopens the Studio.
- Herdr paints a terminal's background square inside a rounded card. Fix: `terminal_opacity: 0`, with the alpha on `pane.background`, which Herdr clips to the radius.
- The shipped `pane` header paints square corners. Fix: a patched clone, `mods/pane-rounded`.
- Herdr doesn't paint a tab block's own `background`; "behind panes" goes on its parent node.
- Hot reload doesn't follow a symlinked mod folder, so `install.sh` copies. An open window keeps its build until reopened.
- Herdr's Settings frame is rewritten on every start and can't be extended. The launch point is a sidebar row above Settings, on the personal layout.

Added beyond the plan: sidebar launch row, behind-panes color, rounded pane headers, iTerm2 import, dropping a theme file, and a `theme-studio.<command>` API.
Dropped: "Export for herdr.dev". Themes aren't a herdr.dev share type; Copy theme JSON and Show themes folder cover sharing.
