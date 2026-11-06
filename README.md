<p align="center"><img src="docs/herdr-ram.svg" width="620" alt="The Herdr ram, drawn in colored ASCII"></p>

<h1 align="center">Herdr Desktop: Theme Studio</h1>

One window for the [Herdr](https://herdr.dev) app's whole look: themes, every color token,
fonts, glass and pane frames. Changes show in the real window as you make them, because the
Studio edits the files Herdr already redraws from. [RECIPE.md](RECIPE.md) is the brief to
build it from scratch.

## Install

Tell your agent (the line from [Theme Studio on herdr.dev/mods](https://herdr.dev/mods/agentic-tool-labs/herdr-theme-studio)):

```
Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/agentic-tool-labs/herdr-theme-studio
```

It copies `mods/theme-studio/` into `~/.config/herdr-app/mods/` and merges `keys.json` into yours.
It also adds the palette icon beside Settings. On Herdr's own layout that means switching you to
your own copy of it (`<layout>-studio`); ⌃⇧L switches back. Then press `ctrl-shift-y` or the icon.
By hand: copy that folder yourself and add `"ctrl-shift-y": "mod.open:theme-studio"` to the `global` section of your `keys.json`.

Your agent will mention that the Studio runs programs and reads files outside its folder. It runs
`osascript` to blur the wallpaper and render Bloom, and it reads `.itermcolors` files in Downloads and on
the Desktop for import.

Requires Herdr app 0.1.13 or later on macOS (Frosted wallpaper and Bloom are macOS only).

![Theme Studio](preview.png)

**Working on the source:** `./install.sh` copies `mods/theme-studio` into `~/.config/herdr-app` and
binds `ctrl-shift-y` (needs node). `./install.sh --remove` takes both out; your themes, settings and
layouts stay. Re-run it after each edit: Herdr's hot reload doesn't follow symlinks, so it copies. An
open Studio window keeps its old build until you close and reopen it.

## Updating

Herdr mods have no update channel, so check the
[tags](https://github.com/agentic-tool-labs/herdr-theme-studio/tags) for a newer version. To update, tell
your agent: "Update Theme Studio from github.com/agentic-tool-labs/herdr-theme-studio: replace my
`mods/theme-studio/` folder with the repo's." Say "replace": by default an agent adds a second copy
under a new name rather than overwrite. Your themes (with their saved type and glass), settings and layouts live outside
that folder and stay. Close and reopen the Studio afterwards.

## Opening it

- **⌃⇧Y** toggles the window.
- **The palette icon beside Settings** in the sidebar footer. Herdr's Settings screen can't take
  extra sections (Herdr rewrites it on every start), and its sidebar mod and built-in layouts can't
  be edited. So the Studio makes your own copy of the layout (`<layout>-studio`) and a patched
  clone of the sidebar mod (`mods/workspace-chrome-studio`) for the footer only. The theme
  manager's Palette icon section adds or removes it, as does `button=on|off`; on Herdr's own layout
  `button=on` makes your copy first. On the narrow sidebar rail it gets its own row under Settings.

## A tour

The screenshots below are of a copy of Tokyo Night, edited step by step.

### The theme manager

![The theme manager, previewing Tokyo Night](docs/screenshots/manager.png)

This is what opens. Click a theme card to preview it in the mock window at the top; nothing
changes in the real window until **Apply**. Under the preview are the actions for the picked theme:

- **Edit** opens the editor (your own themes only).
- **Copy** makes your own copy under a new name. On a locked theme the button reads **Copy to edit**.
- **Copy JSON** puts the theme on the clipboard in Herdr's format, for sharing.
- **Delete** removes one of yours, when it's not in use.

Your themes come first. Herdr's own themes and the 12 bundled presets (`presets/`, sources in
`presets/SOURCES.md`) are locked: you copy one to change it, so the original stays as it was.
Applying a preset copies it into `themes/`, so Herdr's Settings lists it too.

**A theme holds everything.** Its colors live in `themes/<name>.json`. Once you save it in the editor,
it also keeps its type, glass, cursor and agents-list settings, in shared state beside it.
Applying the theme brings all of that back. A theme that has only colors (Herdr's, a preset, a fresh
import) leaves your type, glass and agents list as they are, and resets glass colors you set
by hex to the theme's own. Picking a dark theme sets dark mode's theme, and a light one sets light mode's.

The **Palette icon beside Settings** section at the bottom adds or removes the sidebar icon.
**Revert** (bottom right, after the first change) restores `settings.json`, the layout and the
theme picks from the snapshot taken before the Studio's first write. Themes and layout copies it
made stay on disk.

### Importing

![The import view](docs/screenshots/import.png)

**Import** (top right of the manager) takes iTerm2 (`.itermcolors`, binary or XML), Ghostty,
kitty, Alacritty (TOML) or Herdr JSON. You can paste the text, press **From clipboard** (a file copied in
Finder works too) or drop the file on the box. Any `.itermcolors` files in Downloads and on the Desktop are
listed at the top for one click. An imported theme joins Your themes, and nothing changes until you
apply it. The first time, macOS asks whether Herdr may read Downloads or the Desktop. That prompt can
hide behind other windows, and until you answer it the import seems to do nothing.

### The editor

**Edit** makes the theme the one in use, so the real window follows along, and opens four tabs.
A mock window at the top of each tab shows changes as you make them. Nothing is kept until
**Save**. **Discard** drops the changes, and **← Themes** asks first when there are unsaved changes.

#### Colors

![Colors tab, with the picker open on the cursor color](docs/screenshots/colors.png)

| Option | What it changes |
|---|---|
| Every theme token: Surfaces, Lines, Text, Accent, Agent status, Terminal ANSI | The token everywhere Herdr uses it. Text tokens show a WCAG contrast badge against their background. Click a token to edit it with the picker (hue, saturation, lightness, alpha, or a hex). Saved to `themes/<name>.json`. |
| Behind panes | The color in the gaps and margin around the panes, as a theme token or a hex. It goes on the layout. |
| Cursor: Block, Underline, Bar; Blink; Color | The terminal cursor. The color is a theme token. Shape and blink go to every open pane. For new panes, add the line from **Copy line** to `~/.zshrc` once (see [Cursor shape](#cursor-shape)). |

#### Type

![Type tab, with a sample terminal](docs/screenshots/type.png)

| Option | What it changes |
|---|---|
| Terminal font and size | `font` and `font_size` in `settings.json`. The menu draws each font in its own face. |
| Use ligatures | `font_ligatures`: `!=` and `=>` join into single glyphs. |
| Panels font | `ui_font`: the sidebar, tab bar and Herdr's panels. Their size follows Herdr's zoom (⌘+ / ⌘−). |
| Minimum contrast: 1, 1.6, 3, 4.5, 7 | `minimum_contrast`: lifts terminal text that's too faint for its background. 1 leaves programs' colors alone. |
| Open fonts folder | Herdr loads `.ttf` and `.otf` files from that folder without installing them system-wide. |

The sample terminal shows each pick at once. Herdr rereads `settings.json` only every few seconds
(up to about 10), so on your own layout copy the Studio also puts fonts and size on the layout for
15 s, and the window changes right away.

#### Glass

![Glass tab, with a Bloom background](docs/screenshots/glass.png)

| Option | What it changes |
|---|---|
| Presets: Solid, Tinted, Frosted | Starting points that set everything below at once. |
| Window background: Theme, Gradient, Bloom, Frosted wallpaper, Image | What shows behind the panes. **Gradient** uses two colors you pick and an angle. **Bloom** uses a base color with three soft glows, plus a glow strength. **Frosted wallpaper** is your desktop picture, blurred. **Image**: **Choose…** opens the macOS file picker, or you can drop a picture or type a path. A picture from outside Herdr's folder is copied into `backgrounds/`. |
| Sidebar and bar opacity | How much of the background shows through the sidebar and tab bar. They keep the theme's chrome color. |
| Terminal opacity | How much shows through the terminals. They keep the theme's background color. |
| Corner radius, Margin around panes, Gap between panes | The pane cards' shape and spacing. |

Herdr's own layouts refuse these fields, so the first time, the tab makes your own copy of the
layout (`<layout>-studio`). The same panes, before and after:

| Solid (Tokyo Night as Herdr draws it) | Bloom, terminals at 0.72, sidebar at 0.6, radius 12 |
|---|---|
| ![Before: solid](docs/screenshots/window-solid.png) | ![After: Bloom glass](docs/screenshots/window-glass.png) |

#### Agents

![Agents tab, Compact with cards](docs/screenshots/agents.png)

The sidebar's agents list. Herdr's own (left) and one with Compact density, cards, status on the left and
no icons (right):

![The agents list before and after](docs/screenshots/agents-compare.png)

| Option | What it changes |
|---|---|
| Density: Comfortable, Compact, Dense | Row and header heights, the icon size and every text size at once. Comfortable is Herdr's own. |
| Row layout: One line, Two lines, Two lines when needed | Two lines put the name on top and the detail, time and status under it. "When needed" does that only for a name that wouldn't fit, so it follows the sidebar's width. |
| Row title: Workspace, Session | Which name leads a row that names both (when grouped by status, or pinned): the workspace, or the session's title. |
| Cards: Name, Detail, Time, Card, Border, Selected, Hover colors | Each part's color. An unset color follows the theme; Card and Border are off until you pick one. |
| Status: Left, Right | Where the spinner, dot or "Needs you" badge sits. On the left it's the small form, before the icon. |
| Name weight | Regular, Medium, Semibold or Bold. |
| Corner radius, Side padding, Space between cards | The cards' shape and spacing. |
| Sizes, Text sizes | Row height, icon size, group header height; the text of agent names, group headers, the time since, the second line, the "Agents" title and the badge. The font stays the UI font. |
| Show | The time since, group headers (Working, Pinned, …), agent icons, and the "Needs you" badge (off: a small !). |

Herdr's agents mod can't be edited. So once anything here differs from Herdr's look, your layout copy
shows `mods/agents-studio` instead: a copy of Herdr's list, rebuilt from Herdr's current one on each
Save, that reads these settings live. If a Herdr update changes the list too much to adjust, the
Studio says so and keeps Herdr's.

### Cursor shape

Herdr has no setting for it, but its terminals follow the escape code shells send (DECSCUSR). Save
sends it to every open pane and writes `cursor.zsh` and `cursor-shape` in `~/.config/herdr-app`.
For new panes, add the line the Colors tab copies for you to `~/.zshrc` once:
`[[ -r ~/.config/herdr-app/cursor.zsh ]] && source ~/.config/herdr-app/cursor.zsh` (with your full
path). The Studio never edits `~/.zshrc`. The hook re-sends the shape at each prompt in Herdr panes
(`TERM_PROGRAM=ghostty`), since programs such as vim change it.

## Glass: how it works and its limits

- **See-through terminals:** the terminal's own background goes fully transparent
  (`terminal_opacity: 0`), and the pane card carries the translucency (`pane.background` =
  the theme background with alpha). Herdr clips the card to its radius but paints a terminal's
  background square. Putting the alpha on the card is what keeps rounded corners clean.
- **Rounded headers:** Herdr's `pane` header paints a square background inside the rounded card.
  The Studio clones it once as `mods/pane-rounded` with its top corners following the card's radius,
  and uses that header while the radius is above 0. Herdr's own `pane` mod is untouched.
- **Behind panes** paints the node that holds the tab block. Herdr doesn't paint a tab block's own
  `background`.
- **Frosted wallpaper** blurs the desktop picture with Core Image (`frost.jxa.js`, no permission
  prompt) into `backgrounds/studio-frost-<time>.jpg`. It shows the wallpaper only, never the windows
  behind Herdr, and doesn't move with the window. It's rebuilt when the wallpaper changed and the Studio opens.
- **True window transparency** isn't possible from a mod. Herdr has no setting for it:
  [herdr-app#190](https://github.com/herdrdev/herdr-app/issues/190).
- A layout switch closes Herdr's overlay windows, so steps that span one (making the copy,
  Revert) run as a detached `herdr-app do` script that also
  reopens the Studio.

## Commands

Bind any of these in `keys.json` as `"theme-studio:<command>"`, or run `herdr-app do theme-studio.<command>`
with the Studio open:

Manager: `select=<name>` (preview; `apply` uses it) · `edit=<name>` · `copy=<from>:<new>` · `delete-theme=<name>` · `export=<name>` (JSON to the clipboard) · `view=themes|import` ·
editor: `tab=<colors|type|glass>` · `back` · `save` (or `apply`) · `discard` · `font=<family>` · `ui-font=<family>` · `size=<n>` (these three apply at once) ·
staged until `save` (`cancel` drops them): `color=<token>:<hex>` · `reset=<token>` · `stage=<key>:<value>` · `glass=Solid|Tinted|Frosted` ·
`bg=theme|gradient|bloom|frost|image` · `opacity|chrome|radius|margin|gap|angle|glowIntensity=<n>` · `behind=<token|hex|>` · `image=<path>` (no path: open the picker) · `glass-color=<from|to|bloomBase|glowA|glowB|glowC>:<hex|>` ·
`cursor=block|underline|bar` · `cursor-blink=on|off` · `agents=Comfortable|Compact|Dense` · `agents-row|text|icon|header=<n>` · `agents-time|headers|icons|badge=on|off` · `agents-lines=one|two|auto` · `agents-lead=space|session` · `agents-statusSide=left|right` · `agents-weight=normal|medium|semibold|bold` · `agents-radius|pad|space|detailText=<n>` · `agents-nameColor|detailColor|timeColor|cardColor|borderColor|selectedColor|hoverColor=<hex|>` · `pick=<tok:token|glass:key>` (select a color for the picker) ·
`button=on|off` · `copy-layout` · `import=<name>` (from the clipboard) · `import-file=<path>` · `revert`

## Checks

```sh
node mods/theme-studio/lib.test.mjs          # pure logic: contrast, importers (incl. iTerm2 plist), glass tree edits, header patch
herdr-app check ~/.config/herdr-app/mods/theme-studio
```

## Files

```
install.sh
mods/theme-studio/
  main.js          the window, its tabs and the command API
  lib.js           pure helpers, tested by lib.test.mjs
  frost.jxa.js     wallpaper blur (osascript -l JavaScript)
  bloom.jxa.js     bloom background render (base color plus three glows)
  palette.svg      sidebar icon
  presets/         12 theme files + SOURCES.md
docs/              design page source, build plan, screenshots, the ASCII ram (herdr-ram.svg)
RECIPE.md          the brief to build it from scratch
keys.json          the key it expects
```

## License

[MIT](LICENSE). The bundled theme palettes belong to their authors (MIT, Tokyo Night Apache-2.0): see
[presets/SOURCES.md](mods/theme-studio/presets/SOURCES.md).
