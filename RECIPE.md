# Theme Studio

One floating window for the Herdr app's whole look: pick or import a theme, edit any of its
color tokens, choose terminal and panel fonts, and give the window glass: a gradient, image or
blurred-wallpaper background showing through translucent terminals and sidebars, with
rounded pane cards whose corners stay clean. Every change lands in the real window within a
second or two. A Revert button puts back how things were before the Studio's first change.

![Theme Studio](preview.png)

## What you see

A window 520×720 px (`mod.json` overlay, `kind: "window"`), on the `popover` background,
`foreground` text, base type 13px. Top to bottom:

- **Title bar**, 14px side padding, 12px above, 8px below: "Theme Studio" 14px semibold over
  a 11.5px `muted` line `<theme> · dark|light · <layout>`; a **Close** button on the right.
  Pressing anywhere here drags the window.
- **Tabs**: Themes, Colors, Type, Glass, Library, as pills 12.5px, radius 7, 10px side
  padding. The chosen one is `accent` with `accent_foreground` text; the rest have a
  `border` outline. A 1px `border` line below.
- **Body**, scrolling, 14px padding, 16px between sections. Each section has an 11px
  semibold uppercase `muted` label and an optional 11.5px `dim` note under it.
  - **Themes**: cards 132px wide, radius 8: a 40px swatch strip on the theme's
    background with six bars in ansi 1–6 (heights 8–27px), over a `raised` caption row with
    the name and "dark"/"light". The current theme's card has an `accent` border. "Your
    themes" is `themes()` minus themes named like a layout (Herdr offers those only on
    their layout); "More themes" is the bundled presets not yet installed.
  - **Colors**: pinned above the scrolling part, the mock window (below) and the apply row.
    Then a dim line naming the theme file it saves to, and groups (Surfaces, Lines, Text,
    Accent, Agent status) of rows: 16px swatch, name, a contrast badge where it applies,
    the hex in `dim` (the staged hex, or "reset", in `accent`). First comes a Cursor section:
    pills Block, Underline, Bar, a Blink checkbox and a Color chip (the theme's `cursor`), and,
    until `~/.zshrc` sources `cursor.zsh`, a note with **Copy line**. Values are the theme's own,
    not the layout's translucent overrides. Terminal ANSI is two rows of eight 22px swatches.
    Clicking a color selects it (`selected` row, or a 2px `foreground` ring on an ANSI swatch)
    and opens the color editor under it; clicking again closes it. Last, Behind panes: pills
    Window background, Canvas, Chrome, Terminal and a Custom color chip, with a note that
    this one saves to the layout, that Window background paints nothing, and that the token
    pills follow the theme while a custom color stays. Badges are `r:1` pills, `done` when the
    ratio meets the bar (4.5, or 3 for `dim` and `accent`), `working` when not.
  - **Color editor** (one, for whichever color is selected): on `raised`, a 56px swatch beside
    four sliders (H 0–359, S, L, A 0–100), each over a 10px strip of 48 bands showing what
    that slider would give; a hex input with **Set**, and **Reset** for theme tokens. Clearing
    the hex of a glass color goes back to its default.
  - **Mock window** (Colors and Glass), 170px: the backdrop (canvas; the gradient's two colors
    as bands snapped to the nearest of four directions; the frost, bloom or image file); a
    72px sidebar and 20px tab bar in the sidebar glass color at its opacity; two pane cards
    in the terminal glass color at the terminal opacity, with the real radius and gap over
    the behind color; text in the staged ANSI colors.
  - **Apply row** (Type, Colors, Glass): "N changes not applied (Colors, Glass)" naming the
    tabs with changes, **Cancel**, and **Apply**, which writes every tab's staged changes.
  - **Type**: pinned above the scrolling part, a sample terminal (theme background, ANSI
    colors, the picked font and size, ligatures, contrast lift, a line in the panel font) and
    "N changes not applied" with **Cancel** and **Apply**. Below, scrolling, a native-style
    font row: "Terminal" label (64px, `muted`), a font dropdown filling the row and a size
    stepper (value plus ▲/▼, 8 to 32); under it a "Use ligatures" checkbox (16px box, `accent`
    with ✓ when on); then "Panels" with its own dropdown. Each dropdown is a 32px trigger in
    its own font, opening a `Popup` (anchored `top_left`) with a filter input and a 220px list
    (each family drawn in itself, 14px, with a `dim` "Ag 0O il1 =>" sample; monospaced-looking
    families only for the terminal until you type); it closes on a pick or a press outside.
    Then Minimum contrast pills (1 / 1.6 / 3 / 4.5 / 7) and **Open fonts folder**. No scroller
    inside the scrolling body. Herdr has no font weight, spacing, line height or anti-aliasing
    setting (its settings struct: zoom, sounds, core, font, font_size, font_ligatures, ui_font,
    telemetry, clipboard_write, pane_scrollbars, minimum_contrast, option_as_alt, appearance,
    theme, colors), so the tab says so instead of offering them.
  - **Glass**: on Herdr's own layouts, one card: "Glass needs your own copy of this layout"
    and **Make my copy of <layout>**. On a personal layout: the mock window and apply row
    pinned, then Presets (Solid, Tinted, Frosted); Window background pills (Theme, Gradient,
    Bloom, Frosted wallpaper, Image) with the matching controls under them: color chips From
    and To plus the angle slider; chips Base, Glow 1–3 plus Glow strength 0–200%; Rebuild;
    the image path. Glass surfaces: Sidebar and bar opacity 0.2–1, Terminal opacity 0.3–1;
    their color is always the theme's chrome and terminal color (no separate tint: one set
    quietly covered every theme). Pane frames: Corner radius 0–20, Margin around panes 0–32, Gap between panes 0–24, with a note that
    the gap's color is on Colors. A chip is a 28px pill with a 14px color dot; the selected
    one opens the color editor under its row. Sliders are a 4px `input` groove, `accent`
    fill, a 24×16 `foreground` pill thumb ringed in `accent`, centered on the groove
    (`ml(-12).mt(-6)`), the value on the right of the label.
  - **Library**: Saved looks (pills with a × each, a name input, **Save current**). A look holds
    the dark and light theme picks, the Type settings, the cursor shape and blink, and the glass
    (without rendered picture paths: Bloom and Frosted are rendered again on apply, since old
    renders get deleted). Applying one cancels staged changes and puts its glass on the shown
    personal layout; a look without glass, or on Herdr's own layout, switches to its layout. Import a
    theme (a 130px textarea that also takes a dropped file, a name input, **From clipboard**,
    **Import**); Sidebar button (**Add to sidebar** / **Remove from sidebar**); This theme
    (**Copy theme JSON**, **Show themes folder**).
- **Status bar**, 1px `border` line above: the last result in 12px (`done` for success,
  `blocked` for errors, `muted` while working; "Changes save as you make them." at rest),
  and **Revert** on the right once a backup exists.

On a personal layout with the icon: in the sidebar footer's Settings row, to the right of
"Settings", a 26px square button, radius 6, `palette.svg` at 14px in `muted`, `hover`
background and `foreground` under the pointer, the same as the sidebar header's buttons.
On the narrow sidebar rail (under 160px) it moves to its own 28px row under Settings, and the
footer block grows by that row (`layout.resize`), shrinking back when the sidebar widens.

## How it behaves

- **⌃⇧Y** (`keys.json`) toggles the window; the palette icon opens it. It doesn't take the
  keyboard when it opens. The last tab is remembered (shared `theme-studio.tab`).
- No agent statuses: the Studio is about the look, not the agents. The Agent status colors
  (`working`, `blocked`, `done`, `idle`, `unknown`) are editable tokens like any other.
- **Picking a theme** stages it (the mock window shows it; a preset's panel colors are guessed
  from its background until Herdr derives them). Apply runs `app.theme {name}`, which sets the
  half that matches its lightness; a preset is first written to `themes/<name>.json` and the
  Studio waits for `themes()` to list it. Glass colors set to a fixed hex (glows,
  gradient ends, behind panes) go back to their theme-following defaults in the same Apply, and
  translucent glass is pushed again: its colors are hexes of the theme's. Staging a theme drops
  staged color edits, which were for the old theme.
- **Setting a color** writes the theme file and then picks the theme again: Herdr reads a
  theme file only when it's picked. Panel tokens go in the file's `colors` block (Reset
  deletes them); `background`, `terminal_foreground`, `selection`, `cursor` and `ansiN` are
  the file's own fields. A theme the Studio didn't write is forked to `<name>-custom` first.
- **Type** writes `settings.json` (`font`, `font_size`, `ui_font`, `font_ligatures`,
  `minimum_contrast`), merged key by key through `writeTextFile(path, text, expected)` with
  one retry if the file changed under it.
- **Staging**: Themes, Type, Colors and Glass controls stage into drafts (theme pick, settings,
  theme tokens, glass); previews, sliders and the picker show them. **Apply** writes them in one
  guarded task: the theme pick, `settings.json`, then the theme file (all tokens in one write),
  then one `layout.set` of the whole personal tree. Cancel drops them all.
- **Cursor shape** isn't a Herdr setting; terminals take DECSCUSR (`ESC [ n SP q`: block 2,
  underline 4, bar 6, blinking one less). Apply writes `cursor-shape` (the number) and
  `cursor.zsh` (a zsh precmd hook, only when `TERM_PROGRAM=ghostty`, that sends it) to the app
  home, keeps `{shape, blink}` in shared `theme-studio.cursor`, and writes the code to the tty of
  every herdr-core child process so open panes change at once. The Studio never edits
  `~/.zshrc`; it offers the `source` line to copy and checks whether it's there. The mock window
  draws the cursor after the last prompt.
- **Glass** colors (gradient From/To, bloom base and glows) are tokens or hex. Bloom colors
  can't be read back from the tree, so they're kept per layout in shared
  `theme-studio.glass-extra`.
- **Bloom**: Herdr paints only a color, a two-color linear gradient or a picture behind panes,
  and a mod can't draw behind them. So `bloom.jxa.js` renders the base color and three radial
  glows (Core Image, blurred 90px) into `backgrounds/studio-bloom-<time>.jpg`, 250 ms after the
  last change; the preview shows it before Apply. Re-rendered when the theme changes; old
  renders are deleted, all of them when the background leaves Bloom. **Make my copy** runs `layout.clone`, which
  switches layouts and so closes the window; a detached `herdr-app do` script reopens it,
  and the new copy (seeing shared `theme-studio.add-button`) adds the palette icon. Library
  offers the same copy for the icon alone.
- **Frosted wallpaper** is rebuilt when the window opens and the wallpaper path has changed,
  or on Rebuild. Old `studio-frost-*.jpg` files are deleted.
- When the theme changes anywhere (a 1 s check), translucent chrome and cards are rewritten
  from the new theme's colors.
- **Revert** writes back the `settings.json` text saved before the first change, re-picks
  the saved dark and light themes, and switches back to the saved layout (via the detached
  script when that switch would close the window). Themes and layout copies stay.
- **Commands**: `herdr-app do theme-studio.<command>` or `"theme-studio:<command>"` in
  keys.json: `tab=`, `theme=`, `color=<token>:<hex>`, `reset=`, `font=`, `ui-font=`,
  `size=`, `stage=<key>:<value>`, `glass-color=<key>:<hex|>`, `pick=<tok:token|glass:key>`,
  `cursor=block|underline|bar`, `cursor-blink=on|off`, `apply`, `cancel` (every tab's drafts),
  `glass=Solid|Tinted|Frosted`, `bg=`, `opacity|chrome|radius|gap|angle=<n>`, `behind=`
  (the glass ones stage), `button=on|off`, `copy-layout`, `import=<name>` (clipboard),
  `import-file=<path>`, `look=`, `save-look=`, `delete-look=`, `revert`.

## Built from

- `mods/theme-studio/mod.json`: `{ "place": "none", "title": "Theme Studio", "overlay":
  { "kind": "window", "width": 520, "height": 720 } }`.
- `main.js`: one `View`. A block with `props().part === "button"` (an older sidebar row) draws
  nothing and skips all setup, because a second copy must not also answer commands. `gpui-kit`: `View`, `div`, `svg`;
  `gpui-base`: `v_flex`, `h_flex`, `InputState`/`Input`, `TextareaState`/`Textarea`,
  `SliderState`/`Slider`/`SliderTrack`/`SliderIndicator`/`SliderThumb` (all four parts, or
  the slider can't move). `herdr`: `theme`, `themes`, `settings`, `fonts`, `layout`,
  `layouts`, `nextCommand`, `shared`/`setShared`, `run` (`app.theme`, `layout.set`,
  `layout.clone`, `layout.switch`, `mod.clone`, `mod.open`), `exec`, `appHome`, `props`,
  `closeOverlay`, `readTextFile`/`writeTextFile`; `fs/promises` for presets and backgrounds;
  `cx.write_to_clipboard`/`read_from_clipboard`.
- `lib.js`: pure, tested by `node mods/theme-studio/lib.test.mjs`: `contrast` (WCAG,
  translucent text composited first), `withAlpha`, `normHex`, `mergeSettings`,
  `themeFileFrom` (theme() colors → a theme file), `setToken`, `parseTheme` (iTerm2 plist,
  Ghostty `palette = N=#hex`, kitty `colorN #hex`, Alacritty `[colors.normal|bright]`, Herdr
  JSON), `applyGlass`/`readGlass`, `withButton`/`hasButton`, `patchHeader`, `sortFonts`, `hexToHsla`/`hslaToHex`, `bloomSpec`, `cursorCode`.
- `frost.jxa.js`: `osascript -l JavaScript frost.jxa.js <out.jpg> 40 -0.15 1.2`. NSWorkspace
  gives the desktop picture (no permission prompt); Core Image scales it to 1600px wide,
  Gaussian-blurs it (clamped, then cropped back) and dims it; it prints
  `{ok, wallpaper, out}`.
- `presets/`: 12 theme files (`background`, `foreground`, `selection`, `cursor`, `ansi[16]`),
  sources in `presets/SOURCES.md`. `palette.svg`: a 16px palette outline in `currentColor`.
- What `applyGlass` writes to a layout: root `background` (`"canvas"`, `{gradient: ["accent",
  "canvas"], angle}`, or `{image, fit: "cover"}`), root `terminal_opacity: 0` when see-through,
  root `colors.chrome` = the theme's chrome with alpha; on each `{tab: "active"}` block's
  `pane`: `radius`, `gap`, `background` = the theme's background with the opacity as alpha,
  and the header mod swapped to `pane-rounded` while the radius is above 0; on the tab block's
  parent: `background` = the behind-panes color, `padding` = the margin, `gap` = the gap. Herdr's
  pane `gap` shows only between split panes, so a lone pane's margin is that parent's padding.
- `workspace-chrome-studio`: `mod.clone {name: "workspace-chrome"}`, then `patchFooter` adds a
  `studioIcon(t)` helper and wraps the footer's Settings row in an `h_flex` with
  `.when(!collapsed, el => el.child(studioIcon(t)))`, plus `studioRail(t)` under it on the rail and
  `studioFit(cx)` at the top of `render` for the footer height. It is rebuilt from Herdr's current
  `workspace-chrome` each time the icon is added, and Herdr doesn't reload a mounted clone it
  wrote, so the Studio remounts the footer after a rewrite. `withFooterIcon` points the layout's
  `sidebar-footer` block at it (the `brand` block stays on Herdr's own).
- `pane-rounded`: `mod.clone {name: "pane"}`, then `patchHeader` adds a `studioRadius()`
  helper (the tab block's `pane.radius` less its border width) and `.rounded_t(studioRadius())`
  on the header's root.
- Shared keys: `theme-studio.tab`, `.owned` (themes the Studio wrote), `.backup`, `.looks`,
  `.wallpaper`, `.add-button`.

## Watch out

- Herdr's Settings screen (`frame/settings`) and its shipped mods are rewritten on every
  start; the only lasting way in is a clone the personal layout points at.
- Herdr's own layouts take only click and look fields through `layout.set`, and of the
  look only `background`. `terminal_opacity` and `pane` are refused, and `terminal_opacity`
  in `settings.json` is ignored. Glass needs a personal copy.
- A `layout.set` built from `layouts/.state/<name>.json`'s `file` drops the layout's clicks
  (sidebar width, stack choice). Build from `layout()`.
- Herdr paints a terminal's background square inside a rounded card, so `terminal_opacity`
  below 1 gives sharp dark corners. Put the alpha on `pane.background` (which Herdr clips to
  the radius) and set `terminal_opacity` to 0. The shipped `pane` header has square corners
  too, hence `pane-rounded`.
- A tab block's own `background` isn't painted. Paint its parent.
- A layout switch (`layout.clone`, `layout.switch`) closes every overlay window and ends its
  tasks; anything after it must run outside the mod.
- Theme file edits don't show until the theme is picked again.
- File edits to a layout take about 4 s to show; `layout.set` about 1 s. Font changes in
  settings take a few seconds.
- Hot reload doesn't follow a symlinked mod folder, and an open window keeps its old build
  until it's closed and opened again.
- `structuredClone` isn't there; copy trees with JSON. Slider `set_value` from `render` is a
  side effect; sync sliders from a timer or a handler.
- Downloads and Desktop are privacy-protected: the first read from Herdr (`plutil`, `readdir`,
  `readTextFile`) waits on a macOS permission prompt, which can sit behind other windows. Until
  it's answered the import looks like it did nothing. iTerm2 also saves `.itermcolors` as a
  binary plist sometimes, and newer themes may carry only `(Dark)`/`(Light)` variants of each key.
- Herdr rereads `settings.json` on a poll, measured at 0.1 to 10.4 s, and no command forces it
  (`app.theme`, `layout.switch` and a no-op `layout.set` don't; zoom keys rewrite the file from
  memory and lose the change). A personal layout's `font`/`font_size`/`ui_font` apply at once, so
  the Type tab also sets them there and removes them 15 s later (shared `theme-studio.held`).
  Ligatures and `minimum_contrast` exist only in settings.json, so the Type tab stages picks
  in a sample (ligatures broken with U+200C when off, since gpui-kit has no font-feature
  switch; colors lifted by `liftContrast`) and writes them on Apply.
  `settings()` reports the layout's look, so it can't tell when the file was read.
- `"code"` in a font-name filter catches "Arial Unicode MS"; match it as a word.
- True see-through windows need a Herdr setting that doesn't exist yet (herdr-app#190). The
  frosted wallpaper shows the wallpaper only and doesn't follow the window.

## Done when

- `node mods/theme-studio/lib.test.mjs` passes, and fails when an importer is broken.
- `herdr-app check ~/.config/herdr-app/mods/theme-studio` passes.
- ⌃⇧Y opens the window; `theme=tokyo-night` writes `themes/tokyo-night.json` and the
  window turns Tokyo Night.
- `color=accent:#bb9af7` shows the new accent on the focused pane's border within 3 s.
- `size=15` and `font=Menlo` change the terminal text.
- On `main`, Library offers a copy; after it the window reopens on `main-studio` with a
  palette icon beside Settings that opens the Studio.
- `glass=Frosted` gives a blurred-wallpaper background, translucent sidebar and terminals,
  and rounded pane corners with nothing square showing at any corner.
- Importing an iTerm2 `.itermcolors` file (XML or binary, by drop, list, or a copied Finder
  path) gives the same background, foreground and ANSI colors as the scheme.
- `revert` leaves `settings.json` byte-identical to before and the original layout and
  themes showing.
