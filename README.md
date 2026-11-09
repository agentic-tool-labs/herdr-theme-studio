<p align="center"><img src="docs/herdr-ram.svg" width="310" alt="The Herdr ram, drawn in colored ASCII"></p>

<h1 align="center">Herdr Desktop: Theme Studio</h1>

One window for the [Herdr](https://herdr.dev) app's whole look: themes, every color token,
fonts, glass, pane frames, the agents list and an auto-hiding sidebar. A big live preview shows
every change before you keep it, and Save writes the files Herdr already redraws from. [RECIPE.md](RECIPE.md) is the brief to
build it from scratch.

## Install

Tell your agent (the line from [Theme Studio on herdr.dev/mods](https://herdr.dev/mods/agentic-tool-labs/herdr-theme-studio)):

```
Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/agentic-tool-labs/herdr-theme-studio
```

It copies `mods/theme-studio/` into `~/.config/herdr-app/mods/` and merges `keys.json` into yours.
It also adds the palette icon beside Settings. On Herdr's own layout that means switching you to
your own copy of it (`theme-studio` for Herdr's main layout); ⌃⇧L switches back. Then press `ctrl-shift-y` or the icon.
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

From v0.6.1 the Studio updates itself. It checks the repo's latest
[release](https://github.com/agentic-tool-labs/herdr-theme-studio/releases) when it opens, and every
6 hours from the palette icon while it's closed. A newer one shows three ways: a dot on the palette
icon, a banner across the top of the Studio with **What's new** and **Update**, and a Herdr notice
(once per version; clicking it opens the Studio). **Update** downloads the release, has Herdr check
it, and swaps it in for `mods/theme-studio/`; an open Studio closes and opens again on the new files, and a
notice says it's done (or why it couldn't). [Settings](#settings) has **Check now** and an
**Auto-update** switch, which installs a release as soon as it's found but never while you have
unsaved changes.

![An update ready: the banner and Settings › Updates](docs/screenshots/update.png)

Your themes (with their saved type and glass), settings and layouts live outside that folder and
stay. On v0.5.0 or earlier, update once by hand: tell your agent "Update Theme Studio from
github.com/agentic-tool-labs/herdr-theme-studio: replace my `mods/theme-studio/` folder with the
repo's." Say "replace": by default an agent adds a second copy under a new name rather than
overwrite.

## Opening it

- **⌃⇧Y** toggles the window.
- **The palette icon beside Settings** in the sidebar footer. Herdr's Settings screen can't take
  extra sections (Herdr rewrites it on every start), and its sidebar mod and built-in layouts can't
  be edited. So the Studio makes your own copy of the layout (`theme-studio` for Herdr's main layout) and a patched
  clone of the sidebar mod (`mods/workspace-chrome-studio`) for the footer only. The Studio's
  [Settings](#settings) page adds or removes it, as does `button=on|off`; on Herdr's own layout
  `button=on` makes your copy first. On the narrow sidebar rail it gets its own row under Settings.

## A tour

Every view has the same shape: a big preview of the whole window on the left and the controls on the
right. In the editor and Settings a bar along the bottom says what's going on and holds the buttons
that act on it.
The screenshots are of dune, with a picture as its window background.

### The theme library

![The theme library, with dune in use](docs/screenshots/manager.png)

This is what opens. Click a theme to preview it on the left; nothing changes in the real window
until you apply it. Search by name, filter to Dark, Light, Base or Branded, and the sections run
Branded, Your themes, Herdr's and others, then the bundled presets (`presets/`): 12 classic
palettes (sources in `presets/SOURCES.md`) and [five complete looks](#shipped-themes). A card
whose theme has details has an **ⓘ** beside its name: click it for a window with the
description, author, link and any store badges. Every action is on the card itself:

![Hover a card for its actions; the picked one has Apply](docs/screenshots/manager-cards.png)

- **Apply**, on the card you picked, makes it the theme in use. Using a preset copies it into
  `themes/`, so Herdr's Settings lists it too. Click the theme in use to drop the preview.
- **Hover a card** for a strip of buttons along its bottom:
  - **Edit**. On one of Herdr's themes or a preset it's **Edit a copy**: you edit it straight
    away, and the first Save keeps your changes as `<name>-custom` (numbered if that's taken), so
    the original stays as it was.
  - **Rename…**: yours. Everything that names it follows: themes taking parts from it, your
    Defaults, and the theme in use.
  - **Duplicate…**: your own copy under a name you type. It starts as a free name
    (`dune-copy`, then `dune-copy-2`), and a name that's taken gets a number.
  - **Copy JSON**: the theme in Herdr's format, for sharing.
  - **Delete…**: yours, when it's not in use.

  Rename, Duplicate and Delete ask in a bar that comes up along the bottom. It says as you type
  when a name is taken: a rename can't use it, and a copy gets a number.

**A theme holds everything.** Its colors live in `themes/<name>.json`. Beside them it has four
**parts**: type, cursor, glass and the agents list. Each part is one of:

- **Its own**: saved with the theme in the editor.
- **Inherited** from another theme: whatever that theme's part is, so a change there shows here
  too. A theme others take parts from is a **base**; the library's **Base** filter lists them, and
  their cards say "Base".
- **Default**: the theme [Settings › Defaults](#settings) names for that part, one for dark themes
  and one for light. With none named, it's Herdr's own: no glass or picture, a block cursor,
  Herdr's agents list, and JetBrains Mono 14 with Geist for the panels.

Using a theme brings every part from wherever it comes from, so nothing carries over from the
theme before. Picking a dark theme sets dark mode's theme, and a light one sets light mode's.

![Agents list comes from: Default · dune](docs/screenshots/parts.png)

At the top of the Type, Glass and Agents tabs (and in Colors › Cursor), **comes from** shows and
changes a part's source: Its own, Default, or Inherit from any theme that wouldn't make a loop.
While it's inherited, the tab says whose it is, with a link to edit it there; changing anything
here makes it this theme's own instead. Beside it:

- **Copy from**: a one-time copy of another theme's part, as this theme's own.
- **⋯**: **Copy JSON** and **Paste JSON** (one part, to share or keep), **Make the default for dark
  themes** / **light themes**, and **Use for every theme…**, which sets every other theme to inherit
  it. A theme switched away from its own keeps those values saved, so switching back brings them back.

Deleting a theme others take parts from copies those parts into them first, so they look the same.

The **⋯** at the top right has **Import a theme…**, **Show the themes folder** and **Undo all Theme
Studio changes…**, which restores `settings.json`, the layout and the theme picks from the snapshot
taken before the Studio's first write. Themes and layout copies it made stay on disk. The gear
opens [Settings](#settings).

### Importing

![The import panel](docs/screenshots/import.png)

**Import** (beside the filter) takes iTerm2 (`.itermcolors`, binary or XML), Ghostty,
kitty, Alacritty (TOML) or Herdr JSON. You can paste the text, press **From clipboard** (a file copied in
Finder works too) or drop the file on the box. Any `.itermcolors` files in Downloads and on the Desktop are
listed under it for one click. An imported theme joins Your themes, and nothing changes until you
use it. An import can't take a name a theme already has. The first time, macOS asks whether Herdr may read Downloads or the Desktop. That prompt can
hide behind other windows, and until you answer it the import seems to do nothing.

**From GitHub**: paste a GitHub link in the field under it (or in the box, or press From
clipboard with one copied). A link to a file opens it; a folder, a repo or a gist lists the theme
files in it to pick from, with a filter for big folders like iTerm2-Color-Schemes' `ghostty/`.
**Browse**, beside Import at the top of the library, opens a window of the themes in repos tagged
`herdr-mod-theme-studio`, most starred first, as cards with the publisher's preview, the name, the
author and the description, and a filter. Picking one closes it and previews the theme.

A theme from GitHub is previewed before it's installed: the big preview wears it, glass and picture
included, and the bar along the bottom offers **Install** (under a name you can change), **Details**
and **Cancel**, which installs nothing. A theme [published for the Studio](#publishing-a-theme)
installs with its whole look, picture and details included; any other file brings its colors.

### Publishing a theme

Save a theme in the Studio, then:

```sh
python3 ~/.config/herdr-app/mods/theme-studio/tools/publish-theme.py my-theme --out my-themes \
  --preview ~/Desktop/my-theme.png --description "What it looks like" --author "You" --url https://example.com
```

It writes `my-themes/my-theme.json`, copies its picture to `my-themes/backgrounds/` and the preview
to `my-themes/previews/`, and lists the theme in `my-themes/herdr-themes.json`. **Browse themes
shows a theme only with all three of a preview, a description and an author**, listed in the
repo's `herdr-themes.json`; the script says when one is missing. The preview is a screenshot of
Herdr wearing the theme, about 16:10 (900 px wide is plenty). Publishing again keeps the preview. Push that
folder to a GitHub repo and give the repo the topic `herdr-mod-theme-studio`
(`gh repo edit --add-topic herdr-mod-theme-studio`) so Browse themes finds it. Store links
(`--ios`, `--android`, `--macos`, each an `apps.apple.com` or `play.google.com` link) make it a
[branded theme](#shipped-themes). A part the theme inherits from another theme isn't its own, so
the script says so and it ships as Herdr's: make it the theme's own (**Copy from**) first.
[herdr-theme-abyssal-bloom-demo](https://github.com/agentic-tool-labs/herdr-theme-abyssal-bloom-demo)
and [herdr-theme-emerald-frost-demo](https://github.com/agentic-tool-labs/herdr-theme-emerald-frost-demo)
are examples.

The format (`"format": 1`) is a Herdr theme file plus one `studio` block, which the Studio keeps
out of the theme file it writes, since Herdr skips a theme file with fields it doesn't know:

```json
{ "background": "#06192a", "foreground": "#cfe9ec", "selection": "#1e5767", "cursor": "#82eafb", "ansi": ["… 16 colors"],
  "studio": { "format": 1, "preview": "previews/my-theme.png",
    "type": { "font": "…", "font_size": 11, "ui_font": "Geist" }, "cursor": { "shape": "bar", "blink": true },
    "glass": { "bg": "image", "image": "backgrounds/my-picture.jpg", "opacity": 0.94 }, "agents": { },
    "meta": { "description": "…", "author": "…", "url": "https://…",
              "ios": "https://apps.apple.com/…", "android": "https://play.google.com/…", "macos": "https://apps.apple.com/…" } } }
```

Parts hold what the Studio saves (any left out are Herdr's), `glass.image` and `preview` are
relative to the file, and details are fixed once imported. The repo's root holds
`herdr-themes.json`, listing its theme files for Browse:

```json
{ "format": 1, "themes": ["my-theme.json"] }
```

### Shipped themes

Five complete looks ship with the Studio: colors plus their own glass, fonts, cursor and agents
list. Using one copies it into `themes/` with all of that. A font the Mac doesn't have falls back
to Herdr's own (JetBrains Mono, Geist).

| | |
|---|---|
| ![abyssal-bloom](docs/screenshots/themes/abyssal-bloom.png) | **abyssal-bloom**: deep-sea teal with a glowing jellyfish, lavender tentacles and shafts of light, over art from the game *Abyssal Bloom: Ocean Drift*. A branded theme. |
| ![emerald-frost](docs/screenshots/themes/emerald-frost.png) | **emerald-frost**: navy glass over five glows of cyan, teal and emerald, like light through ice. |
| ![for-ghost-green](docs/screenshots/themes/for-ghost-green.png) | **for-ghost-green**: deep navy and lilac with a cool aqua-and-green glow behind half-clear glass. |
| ![for-ghost-glass](docs/screenshots/themes/for-ghost-glass.png) | **for-ghost-glass**: the most see-through of the set, navy and lilac over a blue and violet glow. |
| ![for-ghost](docs/screenshots/themes/for-ghost.png) | **for-ghost**: deep navy with soft lilac text and bright terminal colors, solid and crisp. |

**Branded themes** carry store links. They lead the library in their own section, and the first
time you pick one a welcome shows its picture, description and store badges, once per theme.

![A branded theme's welcome](docs/screenshots/welcome.png)

They're [published files](#publishing-a-theme) in `presets/`, written by `publish-theme.py
--out mods/theme-studio/presets --pictures mods/theme-studio/backgrounds --manifest no`.

### The editor

**Edit** makes the theme the one in use and opens five tabs: Colors, Type, Glass, Agents and
Details. A
tab with unsaved changes has a dot. The preview shows every change as you make it, and nothing is
kept until **Save**. The bar along the bottom counts the changes and names their tabs; **Discard**
drops them, and the back arrow asks first when there are any.

#### Colors

![Colors tab, with the picker open on the cursor color](docs/screenshots/colors.png)

Click any color and its picker opens pinned at the top of the tab: a swatch, the hex, H, S, L and
A strips, a contrast badge for text colors, and ↺. ↺ undoes an unsaved change to that color; with
none, a color Herdr works out from the terminal colors goes back to that. Terminal colors (the
background, text, selection, cursor and the 16 ANSI colors) have nothing to go back to past their
saved value, so their ↺ is dimmed until you change them.

| Option | What it changes |
|---|---|
| Every theme token: Surfaces, Lines, Text, Accent, Agent status, Terminal ANSI | The token everywhere Herdr uses it. Saved to `themes/<name>.json`. |
| Behind panes | The color in the gaps and margin around the panes, as a theme token or a hex. It goes on the layout. |
| Cursor: Block, Underline, Bar; Blink; Color | The terminal cursor. The color is a theme token. Shape and blink go to every open pane. For new panes, add the line from **Copy line** to `~/.zshrc` once (see [Cursor shape](#cursor-shape)). |

#### Type

![Type tab, with a sample terminal](docs/screenshots/type.png)

| Option | What it changes |
|---|---|
| Terminal font and size | `font` and `font_size` in `settings.json`. The menu draws each font in its own face. |
| Ligatures | `font_ligatures`: `!=` and `=>` join into single glyphs. |
| Panels | `ui_font`: the sidebar, tab bar and Herdr's panels (the preview's too). Their size follows Herdr's zoom (⌘+ / ⌘−). |
| Lift faint text: Off, 1.6, 3, 4.5, 7 | `minimum_contrast`: lifts terminal text that's too faint for its background. Off leaves programs' colors alone. |
| Open it (the fonts folder) | Herdr loads `.ttf` and `.otf` files from that folder without installing them system-wide. |

The sample terminal under the preview shows each pick at once. Herdr rereads `settings.json` only every few seconds
(up to about 10), so on your own layout copy the Studio also puts fonts and size on the layout for
15 s, and the window changes right away.

#### Glass

![Glass tab, with a picture background](docs/screenshots/glass.png)

| Option | What it changes |
|---|---|
| Start from: Solid, Tinted, Frosted | Starting points that set everything below at once. |
| Window background: Theme, Gradient, Bloom, Wallpaper, Image | What shows behind the panes. **Gradient** uses two colors you pick and an angle. **Bloom** uses a base color and up to eight soft glows, with a strength for all of them. **Edit the glows…** opens the bloom editor (below). **Wallpaper** is your desktop picture, blurred. **Image**: **Choose…** opens the macOS file picker, or you can drop a picture or type a path. A picture from outside Herdr's folder is copied into `backgrounds/`. |
| Sidebar and bar | How much of the background shows through the sidebar and tab bar. They keep the theme's chrome color. |
| Terminal | How much shows through the terminals. They keep the theme's background color. |
| Corner radius, Margin, Gap | The pane cards' shape and spacing. |

Herdr's own layouts refuse these fields, so on one of them the tab offers **Make my copy of <layout>**, your
own copy of the layout (`theme-studio` for Herdr's main layout). The same panes, before and after:

| Solid (Tokyo Night as Herdr draws it) | Bloom, terminals at 0.72, sidebar at 0.6, radius 12 |
|---|---|
| ![Before: solid](docs/screenshots/window-solid.png) | ![After: Bloom glass](docs/screenshots/window-glass.png) |

**The bloom editor** shows the bloom at the window's shape, with a numbered marker on each glow:
drag one to move it. Beside it are the base color and a row per glow, with its color, its own
strength and a button to remove it. **All glows** scales every glow's strength, and **+ Add a
glow** puts a new one where there's room, up to eight. The color picker opens under the bloom.
Changes stage like any other, so Save keeps them with the theme. **Reset the glows** goes back
to the theme's three.

![The bloom editor](docs/screenshots/bloom.png)

#### Details

![Details tab, saved](docs/screenshots/details.png)

A description, author and URL. They're fixed at the theme's first Save, even left empty, and a
copy starts without them. They live with the Studio's record of the theme, never in its Herdr
file, and Copy JSON leaves them out. Saved, the URL is a link and any store links show as the
official App Store, Google Play and Mac App Store badges, each opening its store page.

#### Agents

![Agents tab, Dense with cards](docs/screenshots/agents.png)

The sidebar's agents list. Herdr's own (left) and one with Compact density, cards, status on the left and
no icons (right):

![The agents list before and after](docs/screenshots/agents-compare.png)

While you edit agents, the preview narrows to the sidebar's agents list, and the item you select
in the designer opens in a column on the right, so its settings never need a scroll.

**The card designer** lays out one agent card. Drag items from the palette onto its rows, drag
them along a row to reorder, or back onto the palette to take them off. The items:

- **Status**: the spinner, dot or "Needs you" badge.
- **Icon**: the agent's program icon.
- **Name**: the name you gave the session (below); without one, its title.
- **Title**: the title Claude Code writes for the chat.
- **Space**: the space name, hidden under its own group header.
- **Time**: the time since.
- **Machine**: for agents on another machine.
- **+ Label item**: a value from a Herdr terminal label (below), drawn as text or as a pill.

A row works like a web flex row: **Wrap**, **Justify** (start, center, between, end), **Gap**, and
**Under the name** to indent it past the icon. Each item has its own **Text size**, **Color** and
**Weight** (each with a Reset), plus **Grow**, **Truncate**, **Max width**, **Style** (whose look it
starts from: Auto, Name, Detail or Accent) and, for status, the badge. **Start from** sets up the rows: One line, Two lines, Wraps (two lines only when the name
won't fit), or Named (your name on top, Claude Code's title under it).

**Names and labels.** Claude Code stops writing a chat's title once you `/rename` it, so a Name
item that shows both needs a name kept somewhere else: a Herdr terminal label. Set one from
anywhere, or from inside the session, and the card shows it at once:

```sh
hc label "$HC_TERMINAL_ID" name=theme-studio   # set
hc label "$HC_TERMINAL_ID" name=               # remove
```

The Name item reads the `name` label, then a `/rename` name. A label item reads any key you
choose, with a prefix and, when it's missing, either nothing or a text you set.

| Option | What it changes |
|---|---|
| Density: Comfortable, Compact, Dense | Row and header heights, the icon size and every text size at once. Comfortable is Herdr's own. |
| Card: rows and items | The card designer above. |
| Cards: Card, Border, Selected, Hover colors | An unset color follows the theme; Card and Border are off until you pick one. The text colors are on each item. |
| Corner radius, Side padding, Spacing | The cards' shape and spacing, as number boxes. |
| Sizes (folded) | Row height, group header height, the group headers' and the "Agents" title's text, the badge. |
| Show | Group headers (Working, Pinned, …). Time, icons and the badge are items on the card. |

Weights other than Regular need the full Geist family (or another UI font): the Geist bundled with
Herdr draws every weight the same. Put Geist's static TTFs in `~/.config/herdr-app/fonts`; they
load at the next start or look change. The Weight control says so when they're missing.

Herdr's agents mod can't be edited. So once anything here differs from Herdr's look, your layout copy
shows `mods/agents-studio` instead: a copy of Herdr's list, rebuilt from Herdr's current one on each
Save, that reads these settings live. If a Herdr update changes the list too much to adjust, the
Studio says so and keeps Herdr's.

### Settings

![The Settings page](docs/screenshots/settings.png)

The gear in the library. These belong to you, not a theme, so changing themes keeps them, and
they apply at once.

| Option | What it does |
|---|---|
| Auto-hide | Keeps the sidebar out of the way until you need it. Rest the pointer on it and it opens, the terminals making room; move well past it and it folds back a moment later. A sidebar you open with Herdr's own fold button stays open, and dragging its edge never fights you. |
| Folds to: Minimal, Hidden | **Minimal** folds it to a 52px rail, room for each space's and agent's number and status dot. **Hidden** takes it away entirely; the window's left edge brings it back. |
| Beside Settings | The palette icon in the sidebar footer that opens the Studio. It shows a dot when an update is ready. |
| Defaults | Per part (Type, Cursor, Glass, Agents list), the theme dark themes and light themes take it from when their part is set to Default, or Herdr's. It shows the next time you apply a theme. |
| Updates | Your version and the latest release, **Check now**, **Update to v…**, **What's new**, and **Auto-update**. See [Updating](#updating). |

Auto-hide and the icon need your own copy of the layout, like Glass; Updates don't. Auto-hide is the sidebar folded (or hidden)
in the layout, plus an empty floating block from the Studio that watches the pointer; turning it
off takes both away. Herdr can't put its sidebar in a slide-over drawer (a mod can't hold another
mod's views), so it opens in place.

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
  Undo all) run as a detached `herdr-app do` script that also
  reopens the Studio.

## Commands

Bind any of these in `keys.json` as `"theme-studio:<command>"`, or run `herdr-app do theme-studio.<command>`
with the Studio open:

Library: `select=<name>` (preview; `apply` uses it) · `edit=<name>` · `copy=<from>:<new>` · `rename=<from>:<new>` · `delete-theme=<name>` · `export=<name>` (JSON to the clipboard) · `view=themes|import|settings` · `menu=more|close|<menu id>` · `hover=<name>` (show a card's actions) · `default=dark|light:<part>:<theme|>` ·
settings: `autohide=rail|hidden|off` · `button=on|off` · `update=check|install` · `autoupdate=on|off` ·
editor: `tab=<colors|type|glass|agents|details>` · `meta=<description|author|url>:<text>` · `back` · `save` (or `apply`) · `discard` · `font=<family>` · `ui-font=<family>` · `size=<n>` (these three apply at once) ·
staged until `save` (`cancel` drops them): `color=<token>:<hex>` · `reset=<token>` · `stage=<key>:<value>` · `glass=Solid|Tinted|Frosted` ·
`bg=theme|gradient|bloom|frost|image` · `opacity|chrome|radius|margin|gap|angle|glowIntensity=<n>` · `behind=<token|hex|>` · `image=<path>` (no path: open the picker) · `glass-color=<from|to|bloomBase>:<hex|>` · `bloom` (the bloom editor; `bloom=close`) · `glow-add` · `glow-remove=<i>` · `glows=<json list>` ·
`cursor=block|underline|bar` · `cursor-blink=on|off` · `agents=Comfortable|Compact|Dense` · `agents-row|text|icon|header=<n>` · `agents-time|headers|icons|badge=on|off` · `agents-lines=one|two|auto` · `agents-lead=space|session` · `agents-statusSide=left|right` · `agents-weight=normal|medium|semibold|bold` · `agents-radius|pad|space|detailText=<n>` · `agents-show=title|name|both` · `card=one|two|auto|both` (Start from) · `card-select=<row>.<i>` (or `<row>`) · `card-item=<key>:<value>` (the selected item) · `source=<part>:own|default|from:<theme>` · `copy-part=<part>:<theme>` · `agents-nameColor|detailColor|timeColor|cardColor|borderColor|selectedColor|hoverColor=<hex|>` · `pick=<tok:token|glass:key>` (select a color for the picker) ·
`copy-layout` · `import=<name>` (from the clipboard) · `import-file=<path>` · `revert` ·
GitHub: `github=<link>` (preview a file, list a folder, repo or gist) · `github-browse` · `github-pick=<name>` (a theme, file or folder in the list) · `remote=install|cancel` (the theme in preview) · `import-name=<name>` ·
details windows: `info=<name>` (a card's ⓘ; no name closes it) · `welcome=<name>|reset` (show a branded theme's welcome, or forget which were shown)

## Checks

```sh
node mods/theme-studio/lib.test.mjs          # pure logic: contrast, importers (incl. iTerm2 plist), glass and auto-hide tree edits, header patch
herdr-app check ~/.config/herdr-app/mods/theme-studio
```

## Files

```
install.sh
mods/theme-studio/
  main.js          the window, its views and the command API, and the auto-hide watcher
  lib.js           pure helpers, tested by lib.test.mjs
  frost.jxa.js     wallpaper blur (osascript -l JavaScript)
  bloom.jxa.js     bloom background render (base color plus its glows)
  palette.svg      sidebar icon
  icons/           the window's own icons (Lucide)
  presets/         17 theme files (5 with a `studio` block of parts and details) + SOURCES.md
  backgrounds/     pictures the shipped themes use
  badges/          the official App Store, Google Play and Mac App Store badges
  tools/publish-theme.py  saved themes to published files (format 1)
docs/              design page source, the layout audition (design/), build plan, screenshots, the ASCII ram
RECIPE.md          the brief to build it from scratch
keys.json          the key it expects
```

## License

[MIT](LICENSE). The bundled theme palettes belong to their authors (MIT, Tokyo Night Apache-2.0): see
[presets/SOURCES.md](mods/theme-studio/presets/SOURCES.md). The Abyssal Bloom picture is © Bear Poppa
Studios, shipped for that theme only. The store badges are Apple's and Google's, used per their
marketing guidelines.
