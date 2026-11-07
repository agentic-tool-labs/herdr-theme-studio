// Theme Studio: one window for Herdr's whole look. Themes, every color token, fonts,
// glass (terminal opacity, backgrounds, frosted wallpaper, translucent chrome) and pane frames.
// It edits the files Herdr already redraws from: themes/*.json, settings.json, and the shown
// layout (through layout.set). Opened with ctrl-shift-y (mod.open theme-studio).

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, Popup, InputState, Input, NumberInput, TextareaState, Textarea, SliderState, Slider, SliderTrack, SliderIndicator, SliderThumb } from "gpui-base";
import { theme, themes, settings, fonts, layout, layouts, terminals, nextCommand, shared, setShared, run, exec, notify, appHome, home, props, closeOverlay, readTextFile, writeTextFile } from "herdr";
import * as fs from "fs/promises";
import { cursorCode, patchAgents, withAgentsMod, AGENTS_MOD, AGENTS_DEFAULT, liftContrast, breakLigatures, patchHeader, ROUNDED_HEADER, patchFooter, FOOTER_MOD, withFooterIcon, hasFooterIcon, contrast, normHex, mergeSettings, themeFileFrom, setToken, isOverride, parseTheme, slug, applyGlass, readGlass, GLASS_DEFAULT, GLASS_EXTRA, bloomSpec, hexToHsla, hslaToHex, withAlpha, sortFonts, isMono, findNode, withAutoHide, autoHideMode, cardFrom, studioDrawCard, CARD_ITEMS, CARD_STARTS, isTextItem, studioUpdate, versionNewer, UPDATE_KEY, AUTO_UPDATE_KEY } from "./lib.js";

const HOME = appHome();
const MOD = `${HOME}/mods/theme-studio`;
const SHIPPED_LAYOUTS = ["main", "terminals", "win98"];
const K = { addButton: "theme-studio.add-button", tab: "theme-studio.tab", owned: "theme-studio.owned", backup: "theme-studio.backup", themes: "theme-studio.themes", editing: "theme-studio.editing", wallpaper: "theme-studio.wallpaper", held: "theme-studio.held", glassExtra: "theme-studio.glass-extra", agents: "theme-studio.agents", cursor: "theme-studio.cursor" };
// The cursor shape lives in the shell, not in Herdr: cursor.zsh (sourced from ~/.zshrc) sends the
// DECSCUSR code in cursor-shape at each prompt, and Apply sends it to every open pane at once.
const CURSOR_LINE = `[[ -r ${appHome()}/cursor.zsh ]] && source ${appHome()}/cursor.zsh`;
const CURSOR_ZSH = `# Written by Theme Studio: the cursor shape for Herdr panes. cursor-shape holds the DECSCUSR
# number; it's sent at each prompt because programs such as vim change the shape and may not put it back.
if [[ $TERM_PROGRAM == ghostty ]]; then
  autoload -Uz add-zsh-hook
  _herdr_cursor() { [[ -r ${appHome()}/cursor-shape ]] && print -n "\\e[$(<${appHome()}/cursor-shape) q" }
  add-zsh-hook precmd _herdr_cursor
fi
`;
// Every tty a herdr-core process has a child on, i.e. each pane's shell; $1 is the DECSCUSR number.
const CURSOR_SEND = `ps -A -o pid=,ppid=,tty=,comm= | awk '$4 ~ /herdr-core$/ {core[$1]=1} {pp[$1]=$2; t[$1]=$3} END {for (p in pp) if ((pp[p] in core) && t[p] != "??") print t[p]}' | sort -u | while read t; do printf '\\033[%s q' "$1" > "/dev/$t" 2>/dev/null; done`;
// Herdr rereads settings.json on a poll (measured 0.1 to 10.4 s), but a personal layout's look
// applies at once. So a font or size change also goes on the shown personal layout and is taken off
// again once settings.json has surely been read. ponytail: a fixed hold, not a read-back, because
// settings() reports the layout's look and can't show when settings.json landed.
const HOLD_MS = 15000;
const LIVE_LOOK = { font: "font_family", font_size: "font_size", ui_font: "ui_font_family" };
// The Studio opens on the theme manager; Edit opens a theme in the editor, with these tabs.
const TABS = [["colors", "Colors"], ["type", "Type"], ["glass", "Glass"], ["agents", "Agents"]];
// svg() paths are relative to the app home.
const MOD_REL = "mods/theme-studio", ICONS = `${MOD_REL}/icons`;
// Names people read; the token stays in the picker under the name.
const TOKEN_LABELS = { background: "Terminal bg", canvas: "Canvas", chrome: "Chrome", surface: "Surface", popover: "Popover", raised: "Raised", hover: "Hover", selected: "Selected",
  border: "Border", input: "Input border", ring: "Focus ring", foreground: "Text", terminal_foreground: "Terminal text", muted: "Muted text", dim: "Dim text",
  accent: "Accent", accent_foreground: "On accent", solid: "Solid button", solid_foreground: "On solid", selection: "Selection", cursor: "Cursor",
  working: "Working", blocked: "Needs you", done: "Done", idle: "Idle", unknown: "Unknown" };
// Terminal colors come from the theme file itself: there's nothing for Reset to go back to.
const TERMINAL_TOKENS = ["background", "terminal_foreground", "selection", "cursor"];
const GLASS_LABELS = { from: "Gradient from", to: "Gradient to", bloomBase: "Bloom base", glowA: "Glow 1", glowB: "Glow 2", glowC: "Glow 3", behind: "Behind panes" };
// The agents list: density presets (Comfortable is Herdr's own) and the sliders' ranges.
const AGENT_PRESETS = {
  Comfortable: { row: 30, text: 13, icon: 16, header: 30, headerText: 11, timeText: 11, titleText: 11.5, badgeText: 10.5 },
  Compact: { row: 24, text: 12, icon: 14, header: 24, headerText: 10.5, timeText: 10.5, titleText: 11, badgeText: 10 },
  Dense: { row: 20, text: 11.5, icon: 12, header: 20, headerText: 10, timeText: 10, titleText: 10.5, badgeText: 9.5 },
};
const AGENT_SLIDERS = { row: [18, 34, 1], text: [10.5, 14, 0.5], icon: [10, 18, 1], header: [16, 34, 1],
  headerText: [8, 14, 0.5], timeText: [8, 14, 0.5], titleText: [8, 14, 0.5], badgeText: [8, 14, 0.5],
  detailText: [8, 14, 0.5], radius: [0, 14, 1], pad: [2, 14, 1], space: [0, 8, 1] };
// The agent cards' colors: [key, label, the theme color used while unset ("" none)].
const AGENT_COLORS = [["nameColor", "Name", "foreground"], ["detailColor", "Detail", "dim"], ["timeColor", "Time", "dim"],
  ["cardColor", "Card", ""], ["borderColor", "Border", ""], ["selectedColor", "Selected", "selected"], ["hoverColor", "Hover", "hover"]];

const GROUPS = [
  ["Surfaces", ["background", "canvas", "chrome", "surface", "popover", "raised", "hover", "selected"]],
  ["Lines", ["border", "input", "ring"]],
  ["Text", ["foreground", "terminal_foreground", "muted", "dim"]],
  ["Accent", ["accent", "accent_foreground", "solid", "solid_foreground", "selection"]],
  ["Agent status", ["working", "blocked", "done", "idle", "unknown"]],
  ["Terminal ANSI", Array.from({ length: 16 }, (_, i) => "ansi" + i)],
];
// Text tokens get a contrast badge against what they sit on, with the minimum they should reach.
const PAIRS = { foreground: ["background", 4.5], terminal_foreground: ["background", 4.5], muted: ["background", 4.5], dim: ["background", 3], accent_foreground: ["accent", 4.5], solid_foreground: ["solid", 4.5], accent: ["background", 3] };

const GLASS_PRESETS = {
  Solid: { bg: "theme", opacity: 1, chrome: 1, radius: 6, gap: 6, margin: 8 },
  Tinted: { bg: "gradient", angle: 165, opacity: 0.86, chrome: 0.7, radius: 10, gap: 8, margin: 10 },
  Frosted: { bg: "frost", opacity: 0.78, chrome: 0.55, radius: 12, gap: 10, margin: 12 },
};
const SLIDERS = { opacity: [0.3, 1, 0.01], chrome: [0.2, 1, 0.01], radius: [0, 20, 1], gap: [0, 24, 1], margin: [0, 32, 1], angle: [0, 360, 5], glowIntensity: [0, 200, 5] };
// Glass fields the bloom picture is drawn from: changing one re-renders it.
const BLOOM_KEYS = ["bg", "bloomBase", "glowA", "glowB", "glowC", "glowIntensity"];
// A bundled preset's colors before Herdr has derived the rest: enough for the mock window.
// ponytail: panel colors are guessed from the background; Herdr's own derivation shows after Apply.
const presetColors = (f) => ({
  background: f.background, foreground: f.foreground, canvas: f.background, chrome: f.background, surface: f.background,
  cursor: f.cursor || f.foreground, selection: f.selection || f.ansi[8], accent: f.ansi[4],
  ...Object.fromEntries(f.ansi.map((c, i) => [`ansi${i}`, c])), ...(f.colors || {}),
});
// Glass colors that can hold a fixed hex. Applying a new theme puts these back to the theme's own.
// Herdr's own type (its docs: JetBrains Mono 14, Geist, no ligatures, contrast 1), for a theme that saved none.
const TYPE_DEFAULT = { font: "JetBrains Mono", font_size: 14, ui_font: "Geist", font_ligatures: false, minimum_contrast: 1 };
const MIN_SIZE = 8, MAX_SIZE = 32;
const CONTRASTS = [1, 1.6, 3, 4.5, 7];

const sleep = (cx, ms) => cx.sleep(ms);
const ownedThemes = () => shared(K.owned) || [];
const themePath = (name) => `${HOME}/themes/${name}.json`;
// What a Studio theme holds beside its colors file: { type, glass, cursor }, by theme name.
const extrasOf = (name) => (shared(K.themes) || {})[name] || null;
const setExtras = (name, ex) => { const all = { ...(shared(K.themes) || {}) }; if (ex) all[name] = ex; else delete all[name]; setShared(K.themes, all); };

export default class ThemeStudio extends View {
  init(_props, cx) {
    // An older sidebar-row block (props.part "button") is a second copy of this mod: it draws nothing.
    this.part = props() && props().part;
    if (this.part === "button") return;
    if (this.part === "edge") return this.watchEdge(cx);
    this.checkUpdate(cx);
    this.refreshFooter(cx);
    this.tab = TABS.some(([id]) => id === shared(K.tab)) ? shared(K.tab) : "colors";
    // "themes" (the library) or "edit" (this.editing in the tabs). An editor survives a reopen.
    // Herdr's own themes open in the editor too: the first Save makes the person's copy.
    this.editing = shared(K.editing) && themes().some((th) => th.name === shared(K.editing)) ? shared(K.editing) : null;
    this.view = this.editing ? "edit" : "themes";
    this.ask = null; // the manager's inline step: { kind: "copy", from, edit } or { kind: "delete", name }
    this.leaving = false; // Back pressed in the editor with unsaved changes
    this.msg = null;
    this.busy = false;
    this.presets = [];
    this.found = [];
    this.draft = {}; // Type picks not yet applied, in settings.json names
    this.colorDraft = {}; // theme tokens not yet applied: hex, or null to reset
    this.cursorDraft = {}; // cursor shape and blink not yet applied
    this.themeDraft = null; // { name, preset?, colors } picked on Themes, not yet applied
    this.pickTarget = null; // the color the picker edits: "tok:<token>" or "glass:<key>"
    this.fontQuery = "";
    this.importing = false; // the import panel open on the library
    this.menuOpen = false;
    this.hoverCard = null; // the theme card under the pointer, which shows its actions
    this.open = {}; // folded sections that are open
    this.themeQuery = ""; this.themeFilter = "all";
    this.themeSearch = InputState.new({ placeholder: "Find a theme" });
    this.themeSearch.on("change", (_e, cx) => { this.themeQuery = this.themeSearch.value(); cx.notify(); });

    this.hex = InputState.new({ placeholder: "#rrggbb or #rrggbbaa" });
    this.hex.on("submit", (_e, cx) => this.stageHex(this.hex.value(), cx));
    this.fontIn = InputState.new({ placeholder: "Filter fonts…" });
    this.fontIn.on("change", (_e, cx) => { this.fontQuery = this.fontIn.value(); cx.notify(); });
    this.importText = TextareaState.new({ placeholder: "Paste or drop an iTerm2, Ghostty, kitty, Alacritty or Herdr theme", rows: 7 });
    this.importName = InputState.new({ placeholder: "Theme name" });
    this.imagePath = InputState.new({ placeholder: "backgrounds/my-picture.jpg (in ~/.config/herdr-app)" });
    this.imagePath.on("submit", (_e, cx) => this.useImage(this.imagePath.value().trim(), cx));
    this.copyName = InputState.new({ placeholder: "Name for the copy" });
    // The card designer: what's selected ({row, i} an item, {row} a row, {label} a label item),
    // the drag under way and where it would land, and the pointer for the dragged chip.
    this.cardSel = null; this.drag = null; this.dropAt = null; this.mouse = null; this.labelFor = null;
    this.itemSize = InputState.new({});
    this.itemSize.set_step(0.5); this.itemSize.set_min(6); this.itemSize.set_max(28);
    this.itemSize.on("change", (_e, cx) => {
      const sel = this.cardSel, raw = this.itemSize.value().trim(), v = Number(raw);
      if (!sel || sel.i == null || raw === "" || !Number.isFinite(v) || v < 6 || v > 28) return;
      const it = this.cardOf().rows[sel.row]?.items[sel.i];
      if (it && v !== (it.size || this.itemLook(it, sel).size)) this.editItem({ size: v }, cx);
    });
    this.labelIn = {};
    for (const [k, ph] of [["key", "Label key, e.g. ticket"], ["prefix", "Before the value, e.g. #"], ["text", "Shown when it's missing"]]) {
      const st = InputState.new({ placeholder: ph });
      st.on("change", (_e, cx) => { if (this.labelFor) this.editLabel(this.labelFor, { [k]: st.value() }, cx); });
      this.labelIn[k] = st;
    }
    this.copyName.on("submit", (_e, cx) => this.copyTheme(this.ask && this.ask.from, this.copyName.value(), cx, this.ask && this.ask.edit));

    this.glass = { ...GLASS_DEFAULT }; // what the layout has
    this.glassDraft = {}; // Glass tab changes not yet applied
    this.agentsDraft = {}; // Agents tab changes not yet applied
    // The agents list's sizes: number boxes, stepped by their buttons or Up and Down.
    this.agentNums = {};
    for (const [k, [min, max, step]] of Object.entries(AGENT_SLIDERS)) {
      const st = InputState.new({ value: String(this.agentsNow()[k]) });
      st.set_step(step); st.set_min(min); st.set_max(max);
      st.on("change", (_e, cx) => {
        // A half-typed value (empty, or out of range) waits; the box clamps it when it loses focus.
        const raw = st.value().trim(), v = Number(raw);
        if (raw !== "" && Number.isFinite(v) && v >= min && v <= max && v !== this.agentsShown()[k]) this.stageAgents({ [k]: v }, cx);
      });
      this.agentNums[k] = st;
    }
    this.glassFor = null;
    this.sliders = {};
    for (const [k, [min, max, step]] of Object.entries(SLIDERS)) {
      const s = SliderState.new({ min, max, step, value: this.glass[k] });
      s.on("change", (v, cx) => this.stageGlass({ [k]: v }, cx));
      this.sliders[k] = s;
    }
    // One color picker (hue, saturation, lightness, alpha) for whichever color is selected.
    this.pick = [0, 0, 0, 100];
    this.pickers = [359, 100, 100, 100].map((max, i) => {
      const s = SliderState.new({ min: 0, max, step: 1, value: 0 });
      s.on("change", (v, cx) => { this.pick[i] = v; this.stageTarget(hslaToHex(...this.pick), cx, true); });
      return s;
    });
    this.syncGlass();

    // Herdr's own Geist draws one weight. Bold and the rest need the full family, in Herdr's fonts/
    // folder or installed on the Mac.
    cx.spawn(async (cx) => {
      const dirs = [`${HOME}/fonts`, `${home()}/Library/Fonts`, "/Library/Fonts"];
      const found = [];
      for (const d of dirs) found.push(...(await fs.readdir(d).catch(() => [])));
      this.geistWeights = found.some((f) => /^Geist(-(Bold|SemiBold|Medium)|\[wght\]|-Variable)/i.test(f) && !/mono/i.test(f));
      cx.notify();
    });
    cx.spawn(async (cx) => {
      const files = (await fs.readdir(`${MOD}/presets`).catch(() => [])).filter((f) => f.endsWith(".json")).sort();
      this.presets = [];
      for (const f of files) {
        try { this.presets.push({ name: f.slice(0, -5), file: JSON.parse(await fs.readFile(`${MOD}/presets/${f}`, "utf8")) }); } catch {}
      }
      cx.notify();
      await this.scanThemeFiles(cx);
      await this.checkCursorHook(cx);
      if (this.glass.bg === "frost") await this.refreshFrost(cx, false);
    });
    // Translucent chrome and cards are hexes of the theme's colors: follow theme switches made elsewhere.
    this.glassTheme = settings().theme;
    cx.timer.every(1000, (cx) => {
      this.releaseLook();
      if (this.glassFor !== shared("layout")) { this.syncGlass(); cx.notify(); }
      const now = settings().theme;
      if (now === this.glassTheme) return;
      this.glassTheme = now;
      if (!this.personal()) return;
      if (this.glass.bg === "bloom") cx.spawn(async () => { this.glass.bloom = await this.renderBloom(this.glass).catch(() => this.glass.bloom); this.pushGlass(); });
      else if (this.glass.chrome < 1 || this.glass.opacity < 1) this.pushGlass();
    });
    // Making a layout copy reopens the Studio on the copy; finish by adding the palette icon.
    if (shared(K.addButton) && this.personal()) { setShared(K.addButton, null); this.setButton(true, cx); }
    // Commands, so keys.json (or `herdr-app do theme-studio.<command>`) can drive the Studio.
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); this.command(c, cx); cx.notify(); } });
  }

  // Colors, glass and Type picks all stage; `apply` writes every staged change, `cancel` drops them.
  // tab=<id> · theme=<name> · color=<token>:<hex> · reset=<token> · glass-color=<key>:<hex|> · pick=<tok:token|glass:key> · cursor=block|underline|bar · cursor-blink=on|off · font=<family> · ui-font=<family>
  // size=<n> · glass=Solid|Tinted|Frosted · bg=theme|gradient|frost|image · opacity|chrome|radius|gap|angle=<n>
  // stage=<key>:<value> · apply · cancel (Type and Glass) · font-menu=terminal|ui|close (Type tab) · import=<name> (from the clipboard) · import-file=<path> · behind=<color> · button=on|off · copy-layout · revert
  // menu=more|theme|close (the ⋯ menus) · autohide=rail|hidden|off · view=themes|import|settings · select=<name> · edit=<name> · copy=<from>:<new> · delete-theme=<name> · export=<name> · save · discard
  command(c, cx) {
    const i = c.indexOf("=");
    const verb = i < 0 ? c : c.slice(0, i), arg = i < 0 ? "" : c.slice(i + 1);
    const num = Number(arg);
    if (verb === "tab" && TABS.some(([id]) => id === arg)) { this.tab = arg; setShared(K.tab, arg); }
    else if (verb === "back" || (verb === "view" && arg === "themes" && this.view === "edit")) this.back(cx);
    else if (verb === "view" && ["themes", "import", "settings"].includes(arg)) this.goTo(arg, cx);
    else if (verb === "autohide") arg === "off" ? this.setAutoHide(false, cx) : this.setAutoHide(true, cx, arg === "hidden" ? "hidden" : "rail");
    else if (verb === "theme" || verb === "select") this.stageTheme(arg, cx);
    else if (verb === "edit") this.editTheme(arg, cx);
    else if (verb === "copy") { const [from, as] = arg.split(":"); this.copyTheme(from, as, cx); }
    else if (verb === "delete-theme") this.deleteTheme(arg, cx);
    else if (verb === "export") this.exportTheme(arg || this.selected(), cx);
    else if (verb === "save") this.saveEdit(cx);
    else if (verb === "discard") { this.cancelAll(cx); this.goTo("themes", cx); } else if (verb === "color") { const [tok, hex] = arg.split(":"); this.selectTarget(`tok:${tok}`, cx, false); this.stageHex(hex, cx); }
    else if (verb === "reset") this.stageColor(arg, null, cx);
    else if (verb === "glass-color") { const [key, hex] = arg.split(":"); this.selectTarget(`glass:${key}`, cx, false); this.stageHex(hex ?? "", cx); }
    else if (verb === "pick") this.selectTarget(arg || null, cx, false);
    else if (verb === "cursor" && ["block", "underline", "bar"].includes(arg)) this.stageCursor({ shape: arg }, cx);
    else if (verb === "cursor-blink") this.stageCursor({ blink: arg !== "off" }, cx);
    else if (verb === "font" || verb === "ui-font") this.setSetting({ [verb === "font" ? "font" : "ui_font"]: arg }, `Font ${arg}`, cx);
    else if (verb === "size" && num) this.setSetting({ font_size: num }, `Text size ${num}`, cx);
    else if (verb === "stage") { const [k, ...r] = arg.split(":"), x = r.join(":"); this.stage(k, x === "true" ? true : x === "false" ? false : isNaN(+x) ? x : +x, cx); }
    else if (verb === "apply") this.view === "edit" ? this.saveEdit(cx) : this.applyAll(cx);
    else if (verb === "menu") this.menuOpen = arg === "more";
    else if (verb === "hover") this.hoverCard = arg || null; // a theme card's hover actions, for screenshots
    else if (verb === "font-menu") { this.fontOpen = arg === "close" ? null : arg === "ui" ? "ui_font" : "font"; cx.notify(); }
    else if (verb === "cancel") this.cancelAll(cx);
    else if (verb === "glass" && GLASS_PRESETS[arg]) this.stageGlass({ ...GLASS_PRESETS[arg] }, cx);
    else if (verb === "bg") this.stageGlass({ bg: arg }, cx);
    else if (verb in SLIDERS && !Number.isNaN(num)) this.stageGlass({ [verb]: num }, cx);
    else if (verb === "copy-layout") this.makeCopy(cx);
    else if (verb === "revert") this.revert(cx);
    else if (verb === "import") this.importTheme(cx, cx.read_from_clipboard() || "", arg);
    else if (verb === "import-file") this.importFile(arg, cx);
    else if (verb === "behind") this.stageGlass({ behind: arg }, cx);
    else if (verb === "agents" && AGENT_PRESETS[arg]) this.stageAgents({ ...AGENT_PRESETS[arg] }, cx);
    else if (verb === "card" && CARD_STARTS.some(([id]) => id === arg)) this.startCard(arg, cx);
    else if (verb === "card-item" && this.cardSel && this.cardSel.i != null) { const [k, ...r] = arg.split(":"), x = r.join(":"); this.editItem({ [k]: x === "" ? undefined : isNaN(+x) ? x : +x }, cx); }
    else if (verb === "autoupdate") setShared(AUTO_UPDATE_KEY, arg !== "off");
    else if (verb === "update") this.checkUpdate(cx, arg === "install" ? { install: true } : { force: true });
    else if (verb === "card-select") { const [row, i] = arg.split(".").map(Number); this.cardSel = i >= 0 ? { row, i } : { row }; }
    else if (verb.startsWith("agents-") && verb.slice(7) in AGENTS_DEFAULT) { const k = verb.slice(7); const d = AGENTS_DEFAULT[k]; this.stageAgents({ [k]: typeof d === "boolean" ? arg !== "off" : typeof d === "string" ? arg : Number(arg) }, cx); }
    else if (verb === "image") arg ? this.useImage(arg, cx) : this.chooseImage(cx);
    // On Herdr's own layout, `on` makes the person's copy first; the copy reopens the Studio and adds the icon.
    else if (verb === "button") { if (arg !== "off" && !this.personal()) this.makeCopy(cx, "colors"); else this.setButton(arg !== "off", cx); }
    else if (verb !== "focus") this.say(`Unknown command ${c}`, "error", cx);
  }

  // --- status line -----------------------------------------------------------
  say(text, level = "info", cx) { this.msg = { text, level, at: Date.now() }; cx && cx.notify(); }
  async guard(cx, label, work) {
    if (this.busy) return this.say("Still finishing the last change; try again in a moment", "info", cx);
    this.busy = true;
    this.say(label + "…", "info", cx);
    try { await work(cx); } // work gets this call's cx: one captured earlier is dead by now
    catch (e) { this.say(String(e && e.message ? e.message : e), "error", cx); }
    finally { this.busy = false; cx.notify(); }
  }

  // --- files -----------------------------------------------------------------
  async ensureBackup() {
    if (shared(K.backup)) return;
    const s = settings();
    setShared(K.backup, {
      at: Date.now(),
      settings: await readTextFile(`${HOME}/settings.json`),
      layout: shared("layout"),
      theme_dark: s.theme_dark, theme_light: s.theme_light,
    });
  }

  async writeSettings(patch) {
    await this.ensureBackup();
    const path = `${HOME}/settings.json`;
    for (let i = 0; i < 2; i++) {
      const text = await readTextFile(path);
      const next = JSON.stringify(mergeSettings(text ? JSON.parse(text) : {}, patch), null, 2) + "\n";
      try { await writeTextFile(path, next, text); break; }
      catch (e) { if (i) throw e; } // someone else wrote it between our read and write: read again
    }
    const err = await readTextFile(`${HOME}/settings.error`).catch(() => null);
    if (err) throw new Error("settings.json: " + err.trim());
  }

  async writeThemeFile(name, file) {
    await this.ensureBackup();
    await fs.mkdir(`${HOME}/themes`, { recursive: true }).catch(() => {});
    const old = await readTextFile(themePath(name));
    await writeTextFile(themePath(name), JSON.stringify(file, null, 2) + "\n", old);
    if (!ownedThemes().includes(name)) setShared(K.owned, [...ownedThemes(), name]);
  }

  // Herdr reads a theme file when it's picked, not when it changes: pick it again to show the edit.
  async reloadTheme(cx, name) {
    await sleep(cx, 250);
    run("app.theme", { name });
  }

  async readThemeFile(name) {
    const t = await readTextFile(themePath(name));
    return t ? JSON.parse(t) : null;
  }

  async waitFor(cx, test, ms = 6000) {
    for (let waited = 0; waited < ms; waited += 200) { if (test()) return true; await sleep(cx, 200); }
    return false;
  }

  async useTheme(cx, name) {
    await this.ensureBackup();
    if (!(await this.waitFor(cx, () => themes().some((t) => t.name === name)))) throw new Error(`Herdr hasn't picked up ${name} yet; try again in a moment`);
    run("app.theme", { name });
    await this.waitFor(cx, () => settings().theme === name, 3000);
  }

  // --- themes ----------------------------------------------------------------
  async installPreset(p) {
    if (!(await readTextFile(themePath(p.name)))) await this.writeThemeFile(p.name, p.file);
    else if (!ownedThemes().includes(p.name)) setShared(K.owned, [...ownedThemes(), p.name]);
  }

  // The theme being edited must be a file the Studio owns; anything else is forked to <name>-custom first.
  // `fresh` (the editor's copy of one of Herdr's themes) never reuses an older fork: it numbers a new one.
  async editableTheme(cx, fresh = false) {
    const name = settings().theme;
    if (ownedThemes().includes(name) && (await readTextFile(themePath(name)))) return name;
    const fork = fresh ? this.forkName(name) : `${slug(name)}-custom`;
    if (!(await readTextFile(themePath(fork)))) {
      const src = themes().find((t) => t.name === name);
      if (!src) throw new Error(`can't find theme ${name}`);
      const own = await this.readThemeFile(name).catch(() => null); // a user theme file keeps its own overrides
      await this.writeThemeFile(fork, own && own.ansi ? own : themeFileFrom(src.colors));
    } else if (!ownedThemes().includes(fork)) setShared(K.owned, [...ownedThemes(), fork]);
    await this.useTheme(cx, fork);
    return fork;
  }

  // The editor's theme as one the Studio owns: one of Herdr's becomes the person's copy here.
  async ownEditing(cx) {
    if (ownedThemes().includes(this.editing)) return this.editing;
    this.editing = await this.editableTheme(cx, true);
    setShared(K.editing, this.editing);
    return this.editing;
  }

  // Writes staged tokens (hex, or null to reset) into the theme being edited, in one write.
  async writeColors(cx, draft) {
    const name = this.view === "edit" && this.editing ? await this.ownEditing(cx) : await this.editableTheme(cx);
    let file = await this.readThemeFile(name);
    for (const [token, hex] of Object.entries(draft)) file = setToken(file, token, hex);
    await this.writeThemeFile(name, file);
    await this.reloadTheme(cx, name);
    return name;
  }

  // --- type ------------------------------------------------------------------
  setSetting(patch, label, cx) {
    cx.spawn((cx) => this.guard(cx, label, async () => {
      await this.writeSettings(patch);
      const now = this.holdLook(patch);
      this.say(now ? label : `${label}: saved, Herdr shows it within about 10 seconds`, "success", cx);
    }));
  }

  // Puts the font fields of `patch` on the shown personal layout so they show at once. A field the
  // layout already sets is its own: it changes there and stays. True when the change shows now.
  holdLook(patch) {
    const keys = Object.keys(patch).filter((k) => k in LIVE_LOOK && patch[k] != null);
    this.pending = { ...(this.pending || {}), ...Object.fromEntries(Object.keys(patch).map((k) => [LIVE_LOOK[k] || k, patch[k]])), at: Date.now() };
    if (!keys.length || !this.personal()) return !keys.length;
    const tree = layout(), name = shared("layout");
    const held = shared(K.held) || {};
    const mine = held.layout === name ? { ...held.at } : {};
    for (const k of keys) if (!(k in tree) || k in mine) mine[k] = Date.now();
    setShared(K.held, { layout: name, at: mine });
    run("layout.set", { layout: { ...tree, ...Object.fromEntries(keys.map((k) => [k, patch[k]])) } });
    return true;
  }

  // Takes held font fields off the layout once settings.json has had time to be read.
  releaseLook() {
    const held = shared(K.held);
    if (!held || !held.at || held.layout !== shared("layout") || !this.personal()) return;
    const due = Object.keys(held.at).filter((k) => Date.now() - held.at[k] >= HOLD_MS);
    if (!due.length) return;
    const at = { ...held.at };
    due.forEach((k) => delete at[k]);
    setShared(K.held, Object.keys(at).length ? { layout: held.layout, at } : null);
    const tree = { ...layout() };
    due.forEach((k) => delete tree[k]);
    run("layout.set", { layout: tree });
  }

  // --- glass -----------------------------------------------------------------
  personal() { return !SHIPPED_LAYOUTS.includes(shared("layout")); }

  syncGlass() {
    const name = shared("layout");
    if (this.glassFor === name) return;
    this.glassFor = name;
    this.glass = { ...readGlass(this.personal() ? layout() : null), ...((shared(K.glassExtra) || {})[name] || {}) };
    this.glassDraft = {};
    this.syncControls();
  }

  // --- staging -----------------------------------------------------------------
  // Colors, glass and Type picks are staged: the previews show them and Apply writes them all.

  // The current theme's own colors (not the layout's translucent overrides), with staged edits.
  ownColors() {
    if (this.themeDraft) return this.themeDraft.colors;
    const name = this.view === "edit" && this.editing ? this.editing : settings().theme;
    return (themes().find((x) => x.name === name) || {}).colors || theme();
  }

  themeColors() {
    const own = this.ownColors();
    const staged = Object.fromEntries(Object.entries(this.colorDraft).filter(([, v]) => v));
    return { ...theme(), ...own, ...staged };
  }

  glassShown() { return { ...this.glass, ...this.themeReset(), ...this.glassDraft }; }

  // With a theme staged: its own saved glass, or else none (Herdr's solid look). Nothing carries
  // over from the theme before it.
  themeReset() {
    if (!this.themeDraft) return {};
    const ex = extrasOf(this.themeDraft.name);
    return { ...GLASS_DEFAULT, ...((ex && ex.glass) || {}), bloom: "", frost: this.glass.frost }; // bloom re-renders
  }
  // A staged theme's own agents list and cursor, or Herdr's when it saved none.
  themeAgents() {
    if (!this.themeDraft) return null;
    const ex = extrasOf(this.themeDraft.name);
    return { ...AGENTS_DEFAULT, ...((ex && ex.agents) || {}) };
  }
  themeType() {
    if (!this.themeDraft) return null;
    const ex = extrasOf(this.themeDraft.name);
    return { ...TYPE_DEFAULT, ...((ex && ex.type) || {}) };
  }
  themeCursor() {
    if (!this.themeDraft) return null;
    const ex = extrasOf(this.themeDraft.name);
    return { shape: "block", blink: false, ...((ex && ex.cursor) || {}) };
  }

  // Stages a theme (installed, or a bundled preset); picking the applied one drops the stage.
  stageTheme(name, cx) {
    const th = themes().find((x) => x.name === name), p = this.presets.find((x) => x.name === name);
    if (!th && !p) return this.say(`No theme named ${name}`, "error", cx);
    if (name === settings().theme) this.themeDraft = null;
    else {
      if (Object.keys(this.colorDraft).length) this.say("Color edits dropped: they were for the other theme", "info", cx);
      this.colorDraft = {};
      this.themeDraft = { name, preset: th ? null : p, colors: th ? th.colors : presetColors(p.file) };
    }
    if (this.glassShown().bg === "bloom") this.scheduleBloom(cx); else delete this.glassDraft.bloom;
    this.syncControls();
    cx.notify();
  }

  // A glass color field as hex: a token through the theme, "" through its default.
  glassHex(key, g = this.glassShown(), c = this.themeColors()) {
    const v = g[key] || GLASS_DEFAULT[key];
    const fallback = c.canvas;
    return normHex(v ? c[v] || v : fallback) || "#000000";
  }

  // The opaque glass colors for applyGlass: the theme's own chrome and terminal colors.
  baseColors(g = this.glass, c = this.themeColors()) {
    return { chrome: normHex(c.chrome).slice(0, 7), background: normHex(c.background).slice(0, 7) };
  }

  changes() {
    const n = (o, skip) => Object.keys(o).filter((k) => k !== skip).length;
    return { theme: this.themeDraft ? 1 : 0, agents: n(this.agentsDraft), type: n(this.draft), colors: n(this.colorDraft) + n(this.cursorDraft) + ("behind" in this.glassDraft ? 1 : 0), glass: n(this.glassDraft, "bloom") - ("behind" in this.glassDraft ? 1 : 0) };
  }

  // Merges a patch into the glass draft (null drops the draft), dropping keys back at their applied value.
  stageGlass(patch, cx) {
    if (!patch) this.glassDraft = {};
    for (const [k, v] of Object.entries(patch || {})) {
      if (this.glass[k] === v) delete this.glassDraft[k]; else this.glassDraft[k] = v;
    }
    if (patch && Object.keys(patch).some((k) => BLOOM_KEYS.includes(k))) this.scheduleBloom(cx);
    this.syncControls();
    cx.notify();
  }

  // The agents list as the clone shows it now, and with what's staged (a picked theme's own, then edits).
  agentsNow() { return { ...AGENTS_DEFAULT, ...(shared(K.agents) || {}) }; }
  agentsShown() {
    return { ...(this.themeAgents() || this.agentsNow()), ...this.agentsDraft };
  }
  stageAgents(patch, cx) {
    const now = this.agentsNow();
    for (const [k, v] of Object.entries(patch)) if (now[k] === v) delete this.agentsDraft[k]; else this.agentsDraft[k] = v;
    const a = this.agentsShown();
    for (const [k, st] of Object.entries(this.agentNums)) if (Number(st.value()) !== a[k]) st.set_value(String(a[k]));
    this.syncControls();
    cx.notify();
  }
  // An agent card color as shown: the one set, else the theme's.
  agentHex(key, a = this.agentsShown(), c = this.themeColors()) {
    const tok = (AGENT_COLORS.find(([k]) => k === key) || [])[2];
    return a[key] || (tok && normHex(c[tok] || "")) || "#00000000";
  }

  cursorShown() { return { ...(this.themeCursor() || { shape: "block", blink: false, ...(shared(K.cursor) || {}) }), ...this.cursorDraft }; }

  stageCursor(patch, cx) {
    const now = { shape: "block", blink: false, ...(shared(K.cursor) || {}) };
    for (const [k, v] of Object.entries(patch)) if (now[k] === v) delete this.cursorDraft[k]; else this.cursorDraft[k] = v;
    cx.notify();
  }

  // Whether ~/.zshrc sources cursor.zsh, so new panes get the shape too.
  async checkCursorHook(cx) {
    const rc = await fs.readFile(`${home()}/.zshrc`, "utf8").catch(() => "");
    this.cursorHooked = rc.includes(`${appHome()}/cursor.zsh`) || rc.includes("herdr-app/cursor.zsh");
    cx.notify();
  }

  async writeCursor(c) {
    const code = String(cursorCode(c.shape, c.blink));
    if ((await readTextFile(`${HOME}/cursor.zsh`)) !== CURSOR_ZSH) await fs.writeFile(`${HOME}/cursor.zsh`, CURSOR_ZSH);
    await fs.writeFile(`${HOME}/cursor-shape`, code + "\n");
    setShared(K.cursor, { shape: c.shape, blink: c.blink });
    await exec("sh", ["-c", CURSOR_SEND, "sh", code]).catch(() => {});
  }

  stageColor(token, hex, cx) {
    const own = this.ownColors()[token];
    if (hex !== null && own && normHex(own) === hex) delete this.colorDraft[token]; else this.colorDraft[token] = hex;
    this.syncControls();
    cx.notify();
  }

  // A click on the selected color closes the picker; commands (toggle false) just select.
  selectTarget(id, cx, toggle = true) {
    this.pickTarget = toggle && this.pickTarget === id ? null : id;
    this.pickFor = null;
    this.syncControls();
    cx.notify();
  }

  targetHex(id = this.pickTarget) {
    if (!id) return null;
    const [kind, key] = id.split(":");
    if (kind === "agent") return this.agentHex(key);
    if (kind === "item") { const [r, i] = key.split(".").map(Number), it = this.cardOf().rows[r]?.items[i]; return it ? it.color || this.itemLook(it, { row: r, i }).color : null; }
    return kind === "tok" ? normHex(this.themeColors()[key] || "") || "#000000" : this.glassHex(key);
  }

  // From the picker (fromPicker: its sliders already match) or the hex box.
  stageTarget(hex, cx, fromPicker = false) {
    const id = this.pickTarget;
    if (!id) return;
    const [kind, key] = id.split(":");
    if (fromPicker) { this.pickFor = `${id}|${hex}`; this.hex.set_value(hex); }
    if (kind === "tok") this.stageColor(key, hex, cx);
    else if (kind === "agent") this.stageAgents({ [key]: hex }, cx);
    else if (kind === "item") {
      const [r, i] = key.split(".").map(Number);
      this.editCard((c) => { const it = c.rows[r]?.items[i]; if (it) { if (hex) it.color = hex; else delete it.color; } }, cx);
    }
    else this.stageGlass({ [key]: hex }, cx);
  }

  stageHex(value, cx) {
    const [kind] = (this.pickTarget || "").split(":");
    if ((kind === "glass" || kind === "agent" || kind === "item") && value.trim() === "") return this.stageTarget("", cx); // back to the default
    const hex = normHex(value);
    if (!hex) return this.say(`"${value}" isn't a color: use #rrggbb or #rrggbbaa`, "error", cx);
    this.stageTarget(hex, cx);
  }

  // Sliders, picker and hex box follow what's staged; a slider mid-drag already matches and is left alone.
  syncControls() {
    const g = this.glassShown();
    for (const [k, s] of Object.entries(this.sliders)) if (s.value() !== g[k]) s.set_value(g[k]);
    const hex = this.targetHex();
    const key = `${this.pickTarget}|${hex}`;
    if (!hex || this.pickFor === key) return;
    this.pickFor = key;
    this.pick = hexToHsla(hex);
    this.pickers.forEach((s, i) => s.set_value(this.pick[i]));
    this.hex.set_value(hex);
  }

  cancelAll(cx) {
    this.draft = {}; this.colorDraft = {}; this.glassDraft = {}; this.cursorDraft = {}; this.themeDraft = null; this.agentsDraft = {};
    this.pickFor = null; this.leaving = false;
    this.syncControls();
    cx.notify();
  }

  // Everything staged, in one guarded task: settings.json, the theme file, then the layout.
  // `after` runs inside the same task once everything is written (the editor's Save, Edit's apply).
  applyAll(cx, after) {
    const th = this.themeDraft, colors = this.colorDraft;
    // A theme with saved type and cursor brings them too; anything staged on top wins.
    const type = { ...(this.themeType() || {}), ...this.draft };
    // A new theme brings its own glass, cursor and agents list, or Herdr's when it saved none.
    const cursor = { ...(this.themeCursor() || {}), ...this.cursorDraft };
    const glass = { ...this.themeReset(), ...this.glassDraft };
    const agents = { ...(this.themeAgents() || {}), ...this.agentsDraft };
    if (!th && ![type, colors, glass, cursor, agents].some((d) => Object.keys(d).length)) return after && cx.spawn((cx) => this.guard(cx, "Opening", after));
    cx.spawn((cx) => this.guard(cx, "Applying", async () => {
      const done = [];
      if (th) {
        if (th.preset) await this.installPreset(th.preset);
        await this.useTheme(cx, th.name);
        this.themeDraft = null; this.glassTheme = th.name; // the glass below is drawn from the new theme
        done.push(th.name);
        if (this.glass.bg === "bloom" && !glass.bloom) this.glass.bloom = ""; // re-rendered from the new theme
      }
      if (Object.keys(type).length) { await this.writeSettings(type); this.holdLook(type); done.push("type"); }
      if (Object.keys(colors).length) done.push(`colors in ${await this.writeColors(cx, colors)}`);
      // A new theme pushes the layout too: translucent glass holds hexes of the theme's colors, and the
      // file's root theme should name the theme in use.
      if (this.personal() && (Object.keys(glass).length || th)) { await this.writeGlass(cx, glass); if (Object.keys(glass).length) done.push("glass"); }
      if (Object.keys(cursor).length) { await this.writeCursor({ ...this.cursorShown(), ...cursor }); done.push("cursor"); }
      if (Object.keys(agents).length && this.personal()) { await this.writeAgents(cx, { ...this.agentsNow(), ...agents }); done.push("agents list"); }
      this.draft = {}; this.colorDraft = {}; this.glassDraft = {}; this.cursorDraft = {}; this.themeDraft = null; this.agentsDraft = {};
      this.pickFor = null; this.syncControls();
      this.say(`Applied ${done.join(", ")}`, "success", cx);
      if (after) await after(cx);
    }));
  }

  pushGlass() {
    // Herdr keeps the theme pick in layouts/.state, apart from the tree's root theme, which can be older.
    // A push writes the pick into the file too, so the file alone says what's shown.
    const s = settings(), tree = s.theme_dark && s.theme_light ? { ...layout(), theme: { light: s.theme_light, dark: s.theme_dark } } : layout();
    run("layout.set", { layout: withAgentsMod(applyGlass(tree, this.glass, this.baseColors()), this.agentsCustom()) });
  }

  // Herdr's pane header paints square corners inside the rounded card. A clone of it, patched to round
  // its top corners with the card, masks them. Made once; Herdr's own `pane` mod is untouched.
  // Herdr's own agents list unless something differs from it, so an unchanged list never needs the clone.
  agentsCustom() {
    const a = this.agentsNow();
    return Object.keys(AGENTS_DEFAULT).some((k) => a[k] !== AGENTS_DEFAULT[k]);
  }

  // Saves the agents list settings (the clone reads them live) and points the layout at the clone.
  async writeAgents(cx, a) {
    const custom = Object.keys(AGENTS_DEFAULT).some((k) => a[k] !== AGENTS_DEFAULT[k]);
    // Herdr doesn't reload a mounted clone whose file changed, so a rewritten one is remounted:
    // Herdr's list for a moment, then the clone again.
    if (custom && (await this.ensureAgentsClone(cx)) && JSON.stringify(layout()).includes(`"${AGENTS_MOD}"`)) {
      run("layout.set", { layout: withAgentsMod(layout(), false) });
      await sleep(cx, 1200);
    }
    setShared(K.agents, a);
    this.pushGlass();
  }

  // The clone is rebuilt from Herdr's current agents mod each time, so it keeps up with Herdr's updates.
  async ensureAgentsClone(cx) {
    const dir = `${HOME}/mods/${AGENTS_MOD}`;
    if (!(await fs.exists(`${dir}/main.js`))) {
      run("mod.clone", { name: "agents", as: AGENTS_MOD });
      for (let i = 0; i < 30 && !(await fs.exists(`${dir}/main.js`)); i++) await sleep(cx, 100);
    }
    const shipped = await readTextFile(`${HOME}/mods/agents/main.js`);
    // As mod.clone writes it: its own asset paths, and overlays it opens of itself under the new name.
    const own = shipped && shipped.split("mods/agents/").join(`mods/${AGENTS_MOD}/`).split('mod: "agents"').join(`mod: "${AGENTS_MOD}"`);
    const want = own && patchAgents(own);
    if (!want) throw new Error("This Herdr version's agents list changed, so the Studio can't resize it yet. Herdr's own list stays.");
    const now = await readTextFile(`${dir}/main.js`);
    if (want === now) return false;
    await writeTextFile(`${dir}/main.js`, want, now);
    return true;
  }

  async ensureRoundedHeader(cx) {
    const dir = `${HOME}/mods/${ROUNDED_HEADER}`;
    if (!(await fs.exists(`${dir}/main.js`))) {
      run("mod.clone", { name: "pane", as: ROUNDED_HEADER });
      for (let i = 0; i < 30 && !(await fs.exists(`${dir}/main.js`)); i++) await sleep(cx, 100);
    }
    const shipped = await readTextFile(`${HOME}/mods/pane/main.js`);
    const want = shipped && patchHeader(shipped.split("mods/pane/").join(`mods/${ROUNDED_HEADER}/`));
    if (!want) throw new Error("couldn't round the pane header's corners on this Herdr version");
    const now = await readTextFile(`${dir}/main.js`);
    if (want !== now) await writeTextFile(`${dir}/main.js`, want, now);
  }

  async writeGlass(cx, patch) {
    await this.ensureBackup();
    Object.assign(this.glass, patch);
    if (this.glass.bg === "frost" && !this.glass.frost) await this.refreshFrost(cx, true);
    if (this.glass.bg === "bloom" && !this.glass.bloom) this.glass.bloom = await this.renderBloom(this.glass);
    if (this.glass.bg !== "bloom") { this.glass.bloom = ""; await this.dropBlooms([]); }
    if (this.glass.radius > 0) await this.ensureRoundedHeader(cx);
    const extra = shared(K.glassExtra) || {};
    setShared(K.glassExtra, { ...extra, [shared("layout")]: Object.fromEntries(GLASS_EXTRA.map((k) => [k, this.glass[k]])) });
    this.pushGlass();
  }

  // Renders the bloom picture for `g` into backgrounds/ and returns its path. Old renders other than
  // the applied one and this one are deleted.
  async renderBloom(g) {
    const c = this.themeColors();
    const hex = (k) => this.glassHex(k, g, c);
    await fs.mkdir(`${HOME}/backgrounds`, { recursive: true }).catch(() => {});
    const rel = `backgrounds/studio-bloom-${Date.now()}.jpg`;
    const spec = bloomSpec(hex("bloomBase"), [hex("glowA"), hex("glowB"), hex("glowC")], g.glowIntensity);
    const r = await exec("osascript", ["-l", "JavaScript", `${MOD}/bloom.jxa.js`, `${HOME}/${rel}`, JSON.stringify(spec)]);
    let out;
    try { out = JSON.parse(r.stdout.trim()); } catch { out = { ok: false, error: (r.stderr || r.stdout).trim() }; }
    if (!out.ok) throw new Error("Bloom: " + out.error);
    await this.dropBlooms([rel, this.glass.bloom]);
    return rel;
  }

  async dropBlooms(keep) {
    for (const f of await fs.readdir(`${HOME}/backgrounds`).catch(() => [])) {
      if (/^studio-bloom-\d+\.jpg$/.test(f) && !keep.includes(`backgrounds/${f}`)) await fs.unlink(`${HOME}/backgrounds/${f}`).catch(() => {});
    }
  }

  // Re-renders the staged bloom shortly after the last change, so the preview shows the real picture.
  scheduleBloom(cx) {
    const gen = (this.bloomGen = (this.bloomGen || 0) + 1);
    this.bloomPending = true; // the preview draws the glows itself until the picture is ready
    cx.timer.after(250, (cx) => {
      if (gen !== this.bloomGen) return;
      if (this.glassShown().bg !== "bloom") { this.bloomPending = false; return; }
      cx.spawn(async (cx) => {
        const rel = await this.renderBloom(this.glassShown()).catch((e) => { this.say(String(e.message || e), "error", cx); return null; });
        if (gen === this.bloomGen) { this.bloomPending = false; if (rel) this.glassDraft.bloom = rel; cx.notify(); }
      });
    });
  }

  // Herdr has no file dialog for mods; macOS's own comes through osascript. Cancel returns nothing.
  chooseImage(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("osascript", ["-e", 'POSIX path of (choose file of type {"public.image"} with prompt "A picture for behind the panes")']).catch(() => null);
      const path = r && r.code === 0 ? r.stdout.trim() : "";
      if (path) this.useImage(path, cx);
    });
  }

  // Stages a picture as the background. A path outside Herdr's folder is copied into backgrounds/,
  // since layouts only read pictures there.
  useImage(path, cx) {
    path = (path || "").replace(/^~(?=\/)/, home());
    if (!path) return;
    cx.spawn((cx) => this.guard(cx, "Adding the picture", async () => {
      let rel = path;
      if (path.startsWith("/")) {
        if (path.startsWith(`${HOME}/`)) rel = path.slice(HOME.length + 1);
        else {
          await fs.mkdir(`${HOME}/backgrounds`, { recursive: true }).catch(() => {});
          const base = path.split("/").pop(), taken = await fs.exists(`${HOME}/backgrounds/${base}`);
          rel = `backgrounds/${taken ? `${Date.now()}-${base}` : base}`;
          const r = await exec("cp", [path, `${HOME}/${rel}`]);
          if (r.code !== 0) throw new Error(`Couldn't copy the picture: ${(r.stderr || "").trim()}`);
        }
      }
      if (!(await fs.exists(`${HOME}/${rel}`))) throw new Error(`No picture at ${rel}`);
      this.imagePath.set_value(rel);
      this.stageGlass({ bg: "image", image: rel }, cx);
      this.say(`Picture ready: ${rel}. Save to keep it.`, "success", cx);
    }));
  }

  // The auto-hide sidebar's watcher, in an empty floating block: a block only hears the pointer over
  // itself, so it reads the window's. Resting on the rail unfolds the sidebar; once the pointer has
  // been well past it for a moment, it folds back. It folds the way Herdr's own toggle does (same
  // rail width, same saved width), and a sidebar unfolded with that toggle is left alone.
  // ponytail: polls every 100 ms; a window-wide pointer event would replace it if Herdr adds one.
  watchEdge(cx) {
    // A mod can't see a held mouse button, so a width it didn't set means someone is dragging the
    // sidebar's edge: it waits until the width has been still for a second (else it fights the drag).
    let mine = false, since = 0, lastW = null, setW = null, stillAt = 0;
    const fold = (px, folded) => { setW = px; setShared("sidebar.collapsed", folded); run("layout.resize", { id: "sidebar", px }); };
    cx.timer.every(100, () => {
      const tree = layout() || {}, sb = findNode(tree, "sidebar"), p = window.mouse_position(), now = Date.now();
      if (!sb) return;
      if (autoHideMode(tree) === "hidden") { // gone entirely: the window's left edge shows it
        const want = sb.hidden ? p.x >= 0 && p.x <= 4 : mine && p.x > ((sb.size && sb.size.px) || 268) + 32;
        if (!want) { since = 0; return; }
        if (!since) { since = now; return; }
        if (sb.hidden) { run("layout.show", { id: "sidebar" }); mine = true; since = 0; }
        else if (now - since > 600) { run("layout.hide", { id: "sidebar" }); mine = false; since = 0; }
        return;
      }
      if (sb.hidden) return;
      const w = (sb.size && sb.size.px) || 268;
      if (w !== lastW) {
        if (w !== setW) { stillAt = now + 1000; since = 0; if (w >= 160) setShared("sidebar.width", w); }
        lastW = w; setW = null;
      }
      if (now < stillAt) return;
      // Over the rail, below its top row (the window buttons and the brand live there).
      const want = w < 160 ? p.x >= 0 && p.x <= w && p.y > 46 : mine && p.x > w + 32;
      if (!want) { since = 0; return; }
      if (!since) { since = now; return; }
      if (w < 160 && now - since > 200) { fold(shared("sidebar.width") || 268, false); mine = true; since = 0; }
      else if (w >= 160 && now - since > 600) { setShared("sidebar.width", w); fold(this.railPx(), true); mine = false; since = 0; }
    });
  }

  // Room for a three-digit number and its status dot; the tabs make room for the macOS window buttons.
  railPx() { return 52; }

  setAutoHide(on, cx, mode = autoHideMode(layout()) || "rail") {
    if (!this.personal()) return this.say("Auto-hide needs your own copy of this layout", "error", cx);
    const sb = findNode(layout() || {}, "sidebar"), w = sb && sb.size && sb.size.px;
    if (on && w >= 160) setShared("sidebar.width", w);
    const tree = withAutoHide(layout(), on, this.railPx(), shared("sidebar.width") || 268, mode);
    if (!tree) return this.say("This layout has no sidebar to hide", "error", cx);
    cx.spawn((cx) => this.guard(cx, on ? "Hiding the sidebar" : "Bringing the sidebar back", async () => {
      await this.ensureBackup();
      setShared("sidebar.collapsed", on && mode === "rail");
      run("layout.set", { layout: tree });
      this.say(!on ? "The sidebar stays open again" : mode === "rail" ? "The sidebar folds to its rail: rest the pointer on the rail to open it"
        : "The sidebar hides: move the pointer to the window's left edge to bring it back", "success", cx);
    }));
  }

  // A layout switch closes the Studio, so anything else (theme picks) is sent first, then the switch.
  afterSwitch([verb, args], picks = []) {
    for (const [c, a] of picks) run(c, a);
    run(verb, args);
  }

  makeCopy(cx, tab = "glass") {
    const from = shared("layout");
    const as = `${from}-studio`;
    cx.spawn((cx) => this.guard(cx, "Making your copy", async () => {
      await this.ensureBackup();
      setShared(K.tab, tab);
      setShared(K.addButton, true);
      const exists = await readTextFile(`${HOME}/layouts/${as}.json`);
      this.afterSwitch(exists ? ["layout.switch", { name: as }] : ["layout.clone", { name: from, as }]);
    }));
  }

  // Blurs the desktop picture into backgrounds/studio-frost-<time>.jpg. With force=false it only
  // rebuilds when the wallpaper changed since the last build.
  async refreshFrost(cx, force) {
    const where = await exec("osascript", ["-l", "JavaScript", "-e", 'ObjC.import("AppKit");$.NSWorkspace.sharedWorkspace.desktopImageURLForScreen($.NSScreen.mainScreen).path.js']).catch(() => null);
    const wallpaper = where && where.code === 0 ? where.stdout.trim() : null;
    if (!force && wallpaper && wallpaper === shared(K.wallpaper) && this.glass.frost) return;
    await fs.mkdir(`${HOME}/backgrounds`, { recursive: true }).catch(() => {});
    const rel = `backgrounds/studio-frost-${Date.now()}.jpg`;
    const r = await exec("osascript", ["-l", "JavaScript", `${MOD}/frost.jxa.js`, `${HOME}/${rel}`, "40", "-0.15", "1.2"]);
    let out;
    try { out = JSON.parse(r.stdout.trim()); } catch { out = { ok: false, error: (r.stderr || r.stdout).trim() }; }
    if (!out.ok) throw new Error("Frosted wallpaper: " + out.error);
    for (const f of await fs.readdir(`${HOME}/backgrounds`).catch(() => [])) {
      if (/^studio-frost-\d+\.jpg$/.test(f) && `backgrounds/${f}` !== rel) await fs.unlink(`${HOME}/backgrounds/${f}`).catch(() => {});
    }
    setShared(K.wallpaper, out.wallpaper);
    this.glass.frost = rel;
    if (!force && this.personal() && this.glass.bg === "frost") this.pushGlass();
  }

  // The palette icon beside Settings lives in a patched clone of Herdr's sidebar mod, which the
  // personal layout's footer block points at. Herdr's own workspace-chrome is untouched.
  async ensureFooterClone(cx) {
    const dir = `${HOME}/mods/${FOOTER_MOD}`;
    if (!(await fs.exists(`${dir}/main.js`))) {
      run("mod.clone", { name: "workspace-chrome", as: FOOTER_MOD });
      for (let i = 0; i < 30 && !(await fs.exists(`${dir}/main.js`)); i++) await sleep(cx, 100);
    }
    // Rebuilt from Herdr's current sidebar each time, so the clone keeps up with Herdr's updates
    // (with the clone's asset paths, as mod.clone writes them).
    const shipped = await readTextFile(`${HOME}/mods/workspace-chrome/main.js`);
    const want = shipped && patchFooter(shipped.split("mods/workspace-chrome/").join(`mods/${FOOTER_MOD}/`));
    if (!want) throw new Error("couldn't add the icon to the sidebar on this Herdr version");
    const now = await readTextFile(`${dir}/main.js`);
    if (want === now) return false;
    await writeTextFile(`${dir}/main.js`, want, now);
    return true;
  }

  setButton(on, cx) {
    cx.spawn((cx) => this.guard(cx, on ? "Adding the palette icon" : "Removing the palette icon", async () => {
      // Herdr doesn't reload a mounted clone it was told to write, so a rewrite remounts the footer.
      if (on && (await this.ensureFooterClone(cx)) && hasFooterIcon(layout())) {
        run("layout.set", { layout: withFooterIcon(layout(), false) });
        await sleep(cx, 1200);
      }
      const tree = withFooterIcon(layout(), on);
      if (!tree) throw new Error("This layout has no sidebar footer for the icon");
      run("layout.set", { layout: tree });
      this.say(on ? "The palette icon beside Settings opens Theme Studio" : "Palette icon removed", "success", cx);
    }));
  }

  // --- library ---------------------------------------------------------------
  importTheme(cx, text, givenName) {
    const raw = String(text ?? this.importText.value()).trim();
    // Finder's Copy puts a file's path on the clipboard, not its contents.
    if (!raw.includes("\n") && /^(\/|~\/).+\.[a-z]+$/i.test(raw)) return this.importFile(raw, cx);
    cx.spawn((cx) => this.guard(cx, "Importing", async () => {
      const file = parseTheme(text ?? this.importText.value());
      const name = slug(givenName || this.importName.value() || "imported");
      if ((await readTextFile(themePath(name))) && !ownedThemes().includes(name)) throw new Error(`a theme named ${name} already exists: pick another name`);
      await this.writeThemeFile(name, file);
      await this.waitFor(cx, () => themes().some((t) => t.name === name));
      this.importText.set_value(""); this.importName.set_value("");
      this.view = "themes";
      this.stageTheme(name, cx);
      this.say(`Imported ${name}: Apply to use it, or Edit it`, "success", cx);
    }));
  }

  // iTerm2 saves .itermcolors as XML or as a binary plist; plutil (built into macOS) gives XML either way.
  async readThemeText(path) {
    if (/\.itermcolors$/i.test(path)) {
      const r = await exec("plutil", ["-convert", "xml1", "-o", "-", path]).catch(() => null);
      if (r && r.code === 0) return r.stdout;
    }
    return readTextFile(path).catch(() => null);
  }

  // .itermcolors files in Downloads and on the Desktop, offered for one-click import.
  async scanThemeFiles(cx) {
    const found = [];
    for (const dir of [`${home()}/Downloads`, `${home()}/Desktop`]) {
      for (const f of await fs.readdir(dir).catch(() => [])) if (/\.itermcolors$/i.test(f)) found.push({ name: f.replace(/\.itermcolors$/i, ""), path: `${dir}/${f}` });
    }
    this.found = found.slice(0, 24);
    cx.notify();
  }

  importFile(path, cx) {
    if (!path) return;
    path = path.replace(/^~(?=\/)/, home());
    cx.spawn(async (cx) => {
      const text = await this.readThemeText(path);
      if (!text) return this.say("Couldn't read " + path, "error", cx);
      this.importTheme(cx, text, this.importName.value().trim() || path.split("/").pop().replace(/\.[^.]+$/, ""));
    });
  }

  // --- theme manager ---------------------------------------------------------
  // The theme the manager shows: the staged pick, else the one in use.
  selected() { return this.themeDraft ? this.themeDraft.name : settings().theme; }
  inUse(name) { const s = settings(); return name === s.theme_dark || name === s.theme_light; }
  // Yours to edit or delete: a theme file the Studio wrote or imported. Herdr's and presets copy first.
  isOwn(name) { return ownedThemes().includes(name) && themes().some((t) => t.name === name) && name !== shared("layout"); }

  // "import" is the library with its import panel open.
  goTo(view, cx) {
    if (view === "import") { this.importing = true; view = "themes"; }
    this.view = view; this.ask = null; this.leaving = false;
    if (view !== "edit") { this.editing = null; setShared(K.editing, null); }
    if (this.importing) cx.spawn((cx) => this.scanThemeFiles(cx));
    cx.notify();
  }

  // Opens a theme in the editor. It becomes the theme in use first, so the window shows every edit.
  // One of Herdr's themes opens as it is; the first Save writes the person's copy (forkName).
  editTheme(name, cx) {
    const open = async (cx) => {
      this.editing = name; setShared(K.editing, name);
      this.view = "edit"; this.ask = null; this.leaving = false; this.msg = null;
      cx.spawn((cx) => this.checkCursorHook(cx));
    };
    if (settings().theme === name && !this.themeDraft) return cx.spawn((cx) => this.guard(cx, "Opening", open));
    this.cancelAll(cx);
    this.stageTheme(name, cx);
    this.applyAll(cx, open);
  }

  // Copies a theme (yours, Herdr's or a preset) to a new name you own, with whatever it holds beside
  // its colors. With edit, opens the copy in the editor.
  copyTheme(from, as, cx, edit = false) {
    const name = slug(as || "");
    if (!from || !name) return this.say("Give the copy a name", "error", cx);
    if (themes().some((t) => t.name === name) || this.presets.some((p) => p.name === name)) return this.say(`A theme named ${name} already exists: pick another name`, "error", cx);
    cx.spawn(async (cx) => {
      let ok = false;
      await this.guard(cx, `Copying ${from}`, async () => {
      const th = themes().find((t) => t.name === from), p = this.presets.find((x) => x.name === from);
      const file = (await this.readThemeFile(from).catch(() => null)) || (th ? themeFileFrom(th.colors) : p && p.file);
      if (!file) throw new Error(`can't find theme ${from}`);
      await this.writeThemeFile(name, file);
      if (extrasOf(from)) setExtras(name, extrasOf(from));
      if (!(await this.waitFor(cx, () => themes().some((t) => t.name === name)))) throw new Error(`Herdr hasn't picked up ${name} yet; try again in a moment`);
      this.ask = null; this.copyName.set_value("");
      this.say(`Copied ${from} to ${name}`, "success", cx);
      ok = true;
      });
      if (ok && edit) this.editTheme(name, cx); else if (ok) this.stageTheme(name, cx);
    });
  }

  deleteTheme(name, cx) {
    if (!this.isOwn(name)) return this.say(`${name} isn't yours to delete`, "error", cx);
    if (this.inUse(name)) return this.say(`${name} is in use: apply another theme first`, "error", cx);
    cx.spawn((cx) => this.guard(cx, `Deleting ${name}`, async () => {
      await fs.unlink(themePath(name));
      setShared(K.owned, ownedThemes().filter((n) => n !== name));
      setExtras(name, null);
      if (this.themeDraft && this.themeDraft.name === name) this.themeDraft = null;
      this.ask = null;
      this.say(`Deleted ${name}`, "success", cx);
    }));
  }

  // Copies the theme's Herdr JSON (its colors), which any Herdr can import.
  exportTheme(name, cx) {
    cx.spawn(async (cx) => {
      const th = themes().find((t) => t.name === name), p = this.presets.find((x) => x.name === name);
      const file = (await this.readThemeFile(name).catch(() => null)) || (th ? themeFileFrom(th.colors) : p && p.file);
      if (!file) return this.say(`can't find theme ${name}`, "error", cx);
      cx.write_to_clipboard(JSON.stringify(file, null, 2));
      this.say(`Copied ${name}'s JSON`, "success", cx);
    });
  }

  // The editor's Save: write what's staged, then keep type, glass and cursor with the theme.
  saveEdit(cx, then) {
    if (!this.editing) return;
    this.applyAll(cx, async (cx) => {
      const name = await this.ownEditing(cx), s = this.shown();
      setExtras(name, {
        type: { font: s.font_family, font_size: s.font_size, ui_font: s.ui_font_family, font_ligatures: s.font_ligatures, minimum_contrast: s.minimum_contrast },
        // Rendered pictures are dropped as newer ones replace them, so the theme keeps the recipe and re-renders.
        glass: this.personal() ? { ...this.glass, bloom: "", frost: "" } : null,
        cursor: this.cursorShown(),
        agents: this.agentsNow(),
      });
      this.leaving = false;
      this.say(`Saved ${name}`, "success", cx);
      if (then) then(cx);
    });
  }

  revert(cx) {
    const b = shared(K.backup);
    if (!b) return;
    cx.spawn((cx) => this.guard(cx, "Reverting", async () => {
      if (b.settings != null) {
        const now = await readTextFile(`${HOME}/settings.json`);
        await writeTextFile(`${HOME}/settings.json`, b.settings, now);
      }
      setShared(K.backup, null);
      const picks = [b.theme_light, b.theme_dark].filter(Boolean).map((name) => ["app.theme", { name }]);
      if (b.layout && b.layout !== shared("layout") && layouts().includes(b.layout)) return this.afterSwitch(["layout.switch", { name: b.layout }], picks);
      for (const [c, a] of picks) run(c, a);
      this.say("Back to how it was before Theme Studio. Your themes and copied layouts are still there.", "success", cx);
    }));
  }

  // --- view ------------------------------------------------------------------
  // Two levels: the theme library, and the editor for one theme with its Colors, Type, Glass and
  // Agents tabs. Both are a header, a big preview on the left, controls on the right and one bar below.
  // Closing drops the hold on auto-update (unsaved changes don't survive a close).
  async close() { if (!this.part) setShared("theme-studio.editing", false); }

  render(cx) {
    if (this.part === "button" || this.part === "edge") return div();
    const t = theme();
    const s = this.shown();
    const overlay = props() && props().overlay;
    const edit = this.view === "edit";
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const panel = edit
      ? { colors: () => this.colorsTab(t, s, cx), type: () => this.typeTab(t, s, cx), glass: () => this.glassTab(t, s, cx), agents: () => this.agentsTab(t, s, cx) }[this.tab]()
      : this.view === "settings" ? this.settingsView(t) : this.libraryView(t, s, cx);
    const pinned = edit ? this.pinnedEditor(t) : null;
    // The Agents tab keeps what's selected, and its color, in a column of its own beside the settings.
    const side = edit && this.agentsWide() ? this.agentsSide(t, pinned) : null;
    // A press nothing stops drags the window (Herdr's overlay windows), so the header and the bar
    // move it; their buttons, inputs and the breadcrumb stop their own presses.
    // Auto-update (here or from the footer) waits while there's something unsaved.
    const dirty = this.changeCount() > 0;
    if (dirty !== this.dirtyShared) { this.dirtyShared = dirty; cx.timer.after(0, () => setShared("theme-studio.editing", dirty)); }
    const banner = this.updateBanner(t), foot = this.footer(t, cx);
    return v_flex().id("root").relative().size_full().bg(t.popover).text_color(t.foreground).text_size(13)
      .on_mouse_move((e, cx) => { if (this.drag) { this.mouse = e.local_position || e.position; cx.notify(); } })
      .on_mouse_up("left", (_e, cx) => this.endDrag(cx))
      .child(this.header(t, s, overlay))
      .when(!!banner, (el) => el.child(banner))
      .child(h_flex().flex_1().min_h(0).border_t_1().border_color(t.border)
        .child(this.canvas(t, s))
        .child(stop(v_flex().when(this.agentsWide(), (el) => el.flex_1().min_w(0)).when(!this.agentsWide(), (el) => el.w(400).flex_none()).h_full().min_h(0)
          .when(edit, (el) => el.child(this.tabBar(t)))
          .when(!!pinned && !side, (el) => el.child(pinned))
          .child(h_flex().flex_1().min_h(0)
            // The plain scroll area and its bar apart: overflow_y_scrollbar() went back to the top
            // whenever the content grew (opening a folded section).
            .child(div().flex_1().min_w(0).h_full().relative()
              .child(v_flex().id("body").size_full().overflow_y_scroll().px(14).pt(14).pb(20).gap(22).child(panel))
              .child(Scrollbar.vertical("body").absolute().inset_0()))
            .when(!!side, (el) => el.child(side))))))
      .when(!!foot, (el) => el.child(foot))
      // Last, so it paints over everything else.
      .when(Boolean(this.drag && this.mouse), (el) => el.child(this.dragGhost(t)));
  }

  // Back from the editor asks first (in the bottom bar) when there's something unsaved.
  back(cx) {
    if (this.view === "edit" && this.changeCount() > 0) { this.leaving = true; return cx.notify(); }
    this.cancelAll(cx);
    this.goTo("themes", cx);
  }

  changeCount() { const c = this.changes(); return c.type + c.colors + c.glass + c.agents; }

  // The name Save gives a copy of one of Herdr's themes: <name>-custom, numbered when that's taken.
  forkName(name) {
    let fork = `${slug(name)}-custom`;
    for (let i = 2; themes().some((th) => th.name === fork); i++) fork = `${slug(name)}-custom-${i}`;
    return fork;
  }

  // --- header, tabs, preview and bottom bar ----------------------------------------
  header(t, s, overlay) {
    const edit = this.view === "edit", own = edit && ownedThemes().includes(this.editing);
    const left = this.view === "settings"
      ? h_flex().gap(4).items_center().min_w(0)
        .child(this.iconButton("back", "back", "Back to the themes", t, (_e, cx) => this.goTo("themes", cx)))
        .child(v_flex().min_w(0)
          .child(div().id("crumb").on_mouse_down("left", (_e, cx) => cx.stop_propagation()).text_size(11).text_color(t.dim).cursor_pointer().hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => this.goTo("themes", cx)).child("Theme Studio ›"))
          .child(div().text_size(13.5).font_semibold().child("Settings")))
      : edit
      ? h_flex().gap(4).items_center().min_w(0)
        .child(this.iconButton("back", "back", "Back to the themes", t, (_e, cx) => this.back(cx)))
        .child(v_flex().min_w(0)
          .child(div().id("crumb").on_mouse_down("left", (_e, cx) => cx.stop_propagation()).text_size(11).text_color(t.dim).cursor_pointer().hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => this.back(cx)).child("Themes ›"))
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().text_size(13.5).font_semibold().truncate().child(this.editing))
            .when(!own, (el) => el.child(div().flex_none().px(5).rounded(5).border_1().border_color(t.border).text_size(10.5).text_color(t.dim).child("Herdr's")))))
      : h_flex().gap(10).items_center().min_w(0)
        .child(div().size(28).flex_none().rounded(8).bg(t.accent).flex().items_center().justify_center().child(svg(`${MOD_REL}/palette.svg`).size(15).text_color(t.accent_foreground)))
        .child(v_flex().min_w(0)
          .child(div().text_size(13.5).font_semibold().child("Theme Studio"))
          .child(div().text_size(11.5).text_color(t.dim).truncate().child(`In use: ${s.theme_dark} (dark) · ${s.theme_light} (light)`)));
    return h_flex().h(52).flex_none().pl(12).pr(10).gap(4).items_center()
      .child(div().flex_1().min_w(0).child(left))
      .when(this.view === "themes", (el) => el.child(this.iconButton("settings", "settings", "Settings: the sidebar and the palette icon", t, (_e, cx) => this.goTo("settings", cx))))
      .child(this.moreMenu(t))
      .when(!!overlay, (el) => el.child(this.iconButton("close", "close", "Close", t, () => closeOverlay(overlay))));
  }

  // The ⋯ menu: tools you need now and then, out of the everyday flow.
  moreMenu(t) {
    const open = this.menuOpen;
    const item = (id, icon, label, onClick, danger = false) => h_flex().id(`mi-${id}`).px(9).py(7).gap(9).rounded(7).items_center().cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_click((e, cx) => { this.menuOpen = false; onClick(e, cx); cx.notify(); })
      .child(svg(icon.includes("/") ? icon : `${ICONS}/${icon}.svg`).size(14).flex_none().text_color(danger ? t.blocked : t.muted))
      .child(div().flex_1().min_w(0).text_size(12.5).text_color(danger ? t.blocked : t.foreground).child(label));
    const sep = () => div().h(1).mx(3).my(4).bg(t.border);
    const trigger = this.iconButton("more", "more", "More", t, (_e, cx) => { this.menuOpen = !open && Date.now() - (this.menuClosedAt || 0) > 300; cx.notify(); }, open);
    return Popup.new("more-popup", trigger).anchor("top_right")
      .when(open, (el) => el.content(v_flex().id("more-menu").w(290).p(5).rounded(11).border_1().border_color(t.input).bg(t.raised).shadow_lg()
        .on_mouse_down_out((_e, cx) => { this.menuOpen = false; this.menuClosedAt = Date.now(); cx.notify(); })
        .child(item("import", "import", "Import a theme…", (_e, cx) => { this.importing = true; if (this.view === "edit") this.back(cx); else this.goTo("import", cx); }))
        .child(item("folder", "folder", "Show the themes folder", (_e, cx) => cx.spawn(async () => { await exec("open", [`${HOME}/themes`]); })))
        .when(!!shared(K.backup), (el) => el.child(sep())
          .child(item("revert", "undo", "Undo all Theme Studio changes…", () => { this.ask = { kind: "revert" }; }, true)))));
  }

  tabBar(t) {
    const c = this.changes();
    return h_flex().px(8).gap(2).flex_none().border_b_1().border_color(t.border)
      .children(TABS.map(([id, label]) => {
        const on = this.tab === id;
        return h_flex().id(`tab-${id}`).px(10).pt(10).pb(8).gap(6).items_center().cursor_pointer()
          .border_b_2().border_color(on ? t.accent : "#00000000")
          .text_size(12.5).font_medium().text_color(on ? t.foreground : t.muted).hover((st) => st.text_color(t.foreground))
          .on_click((_e, cx) => { this.tab = id; setShared(K.tab, id); if (id === "colors") cx.spawn((cx) => this.checkCursorHook(cx)); cx.notify(); })
          .child(label)
          .when(c[id] > 0, (el) => el.child(div().size(6).rounded(3).bg(t.working)));
      }));
  }

  // The left of the window: the big preview, from what's staged. Type adds its text sample.
  // The Agents tab previews only the sidebar, so the designer gets the width.
  agentsWide() { return this.view === "edit" && this.tab === "agents" && this.personal(); }
  canvas(t, s) {
    const edit = this.view === "edit";
    const note = edit ? "Preview: what you've changed, before you Save" : this.view === "settings" ? `${settings().theme}, in use` : this.themeDraft ? `Previewing ${this.themeDraft.name}` : `${settings().theme}, in use`;
    const narrow = this.agentsWide();
    return v_flex().when(narrow, (el) => el.w(290).flex_none()).when(!narrow, (el) => el.flex_1()).min_w(0).h_full().p(18).gap(10).bg(t.canvas).border_r_1().border_color(t.border)
      .child(div().text_size(11.5).text_color(t.dim).child(narrow ? "Preview: the sidebar's agents" : note))
      .child(div().flex_1().min_h(0).child(this.windowPreview(t, narrow)))
      .when(edit && this.tab === "type", (el) => el.child(this.typeSample({ ...t, ...this.themeColors() }, this.typeValues(s).v)));
  }

  // One bar for everything about saving, and the questions that need an answer before going on.
  footer(t, cx) {
    const m = this.msg, edit = this.view === "edit";
    const note = (text, dot, color) => h_flex().flex_1().min_w(0).gap(8).items_center()
      .when(!!dot, (el) => el.child(div().size(7).flex_none().rounded(4).bg(dot)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(color || t.muted).child(text));
    const said = m && { text: m.text, color: m.level === "error" ? t.blocked : m.level === "success" ? t.done : t.muted };
    const bar = (left, ...buttons) => h_flex().h(52).flex_none().pl(14).pr(12).gap(8).items_center().border_t_1().border_color(t.border).bg(t.chrome)
      .child(left).children(buttons.filter(Boolean));
    const ask = this.ask;
    if (ask && ask.kind === "revert") return bar(note("Undo all Theme Studio changes? Your theme files stay.", t.blocked, t.foreground),
      this.button("ask-cancel", "Keep it", t, (_e, cx) => { this.ask = null; cx.notify(); }, "ghost"),
      this.button("revert", "Undo all", t, (_e, cx) => { this.ask = null; this.revert(cx); }, true));
    if (edit) {
      const n = this.changeCount(), own = ownedThemes().includes(this.editing), as = own ? this.editing : this.forkName(this.editing);
      if (this.leaving && n) return bar(note(`Save your changes to ${as}?`, t.working, t.foreground),
        this.button("stay", "Keep editing", t, (_e, cx) => { this.leaving = false; cx.notify(); }, "ghost"),
        this.button("discard", "Discard", t, (_e, cx) => { this.cancelAll(cx); this.goTo("themes", cx); }),
        this.button("save-leave", "Save", t, (_e, cx) => this.saveEdit(cx, (cx) => this.goTo("themes", cx)), true));
      if (n) {
        const c = this.changes(), where = [["Colors", c.colors], ["Type", c.type], ["Glass", c.glass], ["Agents", c.agents]].filter(([, k]) => k).map(([w]) => w).join(", ");
        return bar(said && m.level === "error" ? note(said.text, t.blocked, said.color) : note(`${n} unsaved · ${where}${own ? "" : ` · saves as ${as}`}`, t.working, t.foreground),
          this.button("cancel-all", "Discard", t, (_e, cx) => this.cancelAll(cx), "ghost"),
          this.button("apply-all", own ? "Save" : "Save copy", t, (_e, cx) => this.saveEdit(cx), true));
      }
      return bar(said ? note(said.text, null, said.color) : note(own ? `Everything's saved to ${this.editing}` : `Herdr's theme: change anything, and Save makes ${as}`, own ? t.done : null));
    }
    if (this.view === "settings") return bar(said ? note(said.text, null, said.color) : note("Settings apply right away. They're yours, not a theme's: changing themes keeps them."));
    const name = this.selected();
    if (ask && ask.kind === "copy") return bar(h_flex().flex_1().min_w(0).gap(8).items_center()
        .child(div().flex_none().text_size(12).text_color(t.muted).child(`Copy ${ask.from} as`))
        .child(div().flex_1().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.copyName).w_full().h(30).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))),
      this.button("ask-cancel", "Cancel", t, (_e, cx) => { this.ask = null; cx.notify(); }, "ghost"),
      this.button("copy-go", "Copy", t, (_e, cx) => this.copyTheme(ask.from, this.copyName.value(), cx), true));
    if (ask && ask.kind === "delete") return bar(note(`Delete ${name}? Its file in themes/ goes too.`, t.blocked, t.foreground),
      this.button("ask-cancel", "Keep it", t, (_e, cx) => { this.ask = null; cx.notify(); }, "ghost"),
      this.button("delete-go", "Delete", t, (_e, cx) => this.deleteTheme(name, cx), true));
    // The library's actions are on its cards; the bar comes up only to ask or to say something.
    if (this.busy || (said && Date.now() - (m.at || 0) < 8000)) return bar(note(said ? said.text : "Working…", null, said ? said.color : null));
    return null;
  }

  // --- the theme library ---------------------------------------------------------------
  libraryView(t, s, cx) {
    // A theme named like a layout belongs to that layout (Herdr offers it only there).
    const all = themes().filter((th) => th.name === shared("layout") || !layouts().includes(th.name));
    const q = this.themeQuery.trim().toLowerCase(), f = this.themeFilter;
    const shows = (x) => (!q || x.name.toLowerCase().includes(q)) && (f === "all" || (f === "light") === !!x.light);
    const pick = (name) => (_e, cx) => { this.ask = null; this.stageTheme(name, cx); };
    const item = (th) => ({ name: th.name, colors: th.colors, light: th.light });
    const presets = this.presets.filter((p) => !all.some((th) => th.name === p.name))
      .map((p) => ({ name: p.name, colors: presetColors(p.file), light: contrast("#000000", p.file.background) > contrast("#ffffff", p.file.background) }));
    const grid = (list, empty) => {
      const l = list.filter(shows);
      return l.length ? h_flex().flex_wrap().gap(10).children(l.map((x) => this.themeCard(t, x, pick(x.name)))) : div().text_size(12).text_color(t.dim).child(q || f !== "all" ? "No matches." : empty);
    };
    return v_flex().gap(22)
      .child(h_flex().gap(8).items_center()
        .child(h_flex().flex_1().min_w(0).h(30).px(9).gap(7).items_center().rounded(8).border_1().border_color(t.input).bg(t.background)
          .child(svg(`${ICONS}/search.svg`).size(14).flex_none().text_color(t.dim))
          .child(Input.new(this.themeSearch).flex_1().min_w(0).h(28).text_color(t.foreground)))
        .child(this.seg("thf", [["all", "All"], ["dark", "Dark"], ["light", "Light"]], f, t, (v, cx) => { this.themeFilter = v; cx.notify(); }))
        .child(this.button("import-open", this.importing ? "Close" : "Import", t, (_e, cx) => { if (this.importing) { this.importing = false; cx.notify(); } else this.goTo("import", cx); })))
      .when(this.importing, (el) => el.child(this.importPanel(t)))
      .child(this.section("Your themes", t, grid(all.filter((th) => this.isOwn(th.name)).map(item), "None yet. Edit one of Herdr's below: Save makes it yours."),
        "Yours to edit and delete. A theme holds its colors and, once saved in the editor, its type, glass, cursor and agents list too."))
      .child(this.section("Herdr's and others", t, grid(all.filter((th) => !this.isOwn(th.name)).map(item), "None."),
        "These don't change. Edit one and Save makes your copy, so the original stays as it was."))
      .when(presets.length > 0, (el) => el.child(this.section("Bundled presets", t, grid(presets, ""),
        "Bundled with the Studio. Using one adds it to themes/, so Herdr's Settings lists it too.")));
  }

  // A theme as a little Herdr window in its own colors: sidebar, a pane, its terminal colors.
  themeCard(t, x, onClick) {
    const c = x.colors, on = this.selected() === x.name, used = this.inUse(x.name), mine = this.isOwn(x.name);
    const hot = this.hoverCard === x.name, staged = on && !!this.themeDraft && !used;
    // A card's own button: it acts on this card's theme and keeps the click from picking the card.
    const act = (id, icon, tip, run, danger = false) => div().id(`ca-${id}-${x.name}`).size(24).flex_none().rounded(6).flex().items_center().justify_center().cursor_pointer()
      .bg(t.raised).border_1().border_color(t.input)
      .hover((st) => st.bg(t.hover).border_color(t.accent)).tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((e, cx) => { cx.stop_propagation(); this.ask = null; run(e, cx); cx.notify(); })
      .child(svg(`${ICONS}/${icon}.svg`).size(13).text_color(danger ? t.blocked : t.foreground));
    // An opaque strip along the bottom of the preview, just above the name.
    const actions = h_flex().absolute().left(0).right(0).bottom(0).h(34).px(6).gap(5).items_center().justify_end()
      .bg(t.popover).border_t_1().border_color(t.border)
      .child(act("edit", "pen", mine ? "Edit" : "Edit a copy", (_e, cx) => this.editTheme(x.name, cx)))
      .child(act("copy", "copy", "Duplicate…", (_e, cx) => { if (!on) this.stageTheme(x.name, cx); this.ask = { kind: "copy", from: x.name }; this.copyName.set_value(`${slug(x.name)}-copy`); }))
      .child(act("json", "code", "Copy JSON", (_e, cx) => this.exportTheme(x.name, cx)))
      .when(mine && !used, (el) => el.child(act("delete", "trash", "Delete…", (_e, cx) => { if (!on) this.stageTheme(x.name, cx); this.ask = { kind: "delete", name: x.name }; }, true)));
    const bg = c.background, fg = c.foreground, chrome = c.chrome || bg, dim = c.dim || c.ansi8 || fg, line = c.border || c.ansi8 || dim;
    const bar = (w, col) => div().w(w).h(3).rounded(2).bg(col);
    return v_flex().id(`card-${x.name}`).w(176).rounded(10).overflow_hidden().cursor_pointer()
      .border_1().border_color(on ? t.accent : t.border).when(on, (el) => el.shadow_sm())
      .hover((st) => st.border_color(on ? t.accent : t.input))
      .on_hover((over, cx) => {
        if (over) this.hoverCard = x.name; else if (this.hoverCard === x.name) this.hoverCard = null;
        cx.notify();
      })
      .on_click(onClick)
      .child(h_flex().relative().h(76).p(5).gap(4).bg(c.canvas || bg)
        .child(v_flex().w(38).h_full().rounded(4).bg(chrome).p(5).gap(4).child(bar(26, dim)).child(bar(18, dim)).child(bar(23, c.accent || c.ansi4)))
        .child(v_flex().relative().flex_1().h_full().rounded(4).bg(bg).p(7).gap(4)
          .child(bar(56, c.ansi4)).child(bar(80, withAlpha(fg, 0.5))).child(bar(40, c.ansi2))
          .child(h_flex().absolute().left(7).right(7).bottom(6).gap(3).children([1, 2, 3, 4, 5, 6].map((i) => div().flex_1().h(7).rounded(2).bg(c[`ansi${i}`])))))
        .when(hot, (el) => el.child(actions)))
      .child(h_flex().h(32).px(9).gap(6).items_center().bg(chrome).border_t_1().border_color(line)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(fg).child(x.name))
        // Picked and previewing: Apply makes it the theme in use.
        .when(staged, (el) => el.child(h_flex().id(`ca-apply-${x.name}`).h(22).px(8).gap(4).flex_none().items_center().rounded(6).cursor_pointer()
          .bg(t.accent).text_color(t.accent_foreground).text_size(11.5).font_medium().hover((st) => st.opacity(0.88)).tooltip(`Use ${x.name}`)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); this.applyAll(cx); })
          .child(svg(`${ICONS}/check.svg`).size(12)).child("Apply")))
        .when(!staged, (el) => el.child(h_flex().flex_none().gap(4).items_center().text_size(11).text_color(dim)
          .when(used, (el) => el.child(div().size(6).rounded(3).bg(t.done)))
          .child(used ? "In use" : x.light ? "Light" : "Dark"))));
  }

  importPanel(t) {
    return v_flex().gap(10).p(12).rounded(11).border_1().border_color(t.border).bg(t.raised)
      .child(div().id("import-drop").on_drop((e, cx) => this.importFile(e.paths && e.paths[0], cx))
        .child(Textarea.new(this.importText).h(110).p(8).rounded(8).border_1().border_color(t.input).bg(t.background).text_color(t.foreground).text_size(12)))
      .child(h_flex().gap(6)
        .child(Input.new(this.importName).flex_1().min_w(0).h(30).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(this.button("import-clip", "From clipboard", t, (_e, cx) => this.importTheme(cx, cx.read_from_clipboard() || "")))
        .child(this.button("import", "Import", t, (_e, cx) => this.importTheme(cx), true)))
      .when(this.found.length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).items_center()
        .child(div().text_size(11.5).text_color(t.dim).child("On this Mac:"))
        .children(this.found.map((f) => this.chip(t, `found-${f.name}`, f.name, null, false, (_e, cx) => this.importFile(f.path, cx))))))
      .child(div().text_size(11.5).text_color(t.dim).line_height("16px").child("iTerm2 (.itermcolors), Ghostty, kitty, Alacritty TOML or Herdr JSON: paste it, drop a file here, or pick one found in Downloads or on the Desktop. Nothing changes until you use it."));
  }

  // --- the editor's tabs ------------------------------------------------------------------
  // The color picker sits above the tab's controls while a color on that tab is picked.
  pinnedEditor(t) {
    const id = this.pickTarget;
    if (!id) return null;
    const [kind, key] = id.split(":");
    const here = { colors: kind === "tok" || id === "glass:behind", glass: kind === "glass" && key !== "behind", agents: kind === "agent" || kind === "item" }[this.tab];
    if (!here) return null;
    const c = this.themeColors();
    let label, reset = null, badge = null;
    if (kind === "tok") {
      label = TOKEN_LABELS[key] || key.replace(/^ansi(\d+)$/, "Terminal color $1");
      // Every color gets the same Reset. It undoes an unsaved change first; with none, a color Herdr
      // works out goes back to that. A terminal color has nothing to go back to past its saved value.
      const staged = key in this.colorDraft, derived = !TERMINAL_TOKENS.includes(key) && !key.startsWith("ansi");
      reset = { can: staged || derived, tip: staged ? "Undo this change" : derived ? "Back to the color Herdr works out from the terminal colors" : "Nothing to undo: terminal colors keep their saved value",
        run: (cx) => { if (staged) { delete this.colorDraft[key]; this.pickFor = null; this.syncControls(); cx.notify(); } else this.stageColor(key, null, cx); } };
      badge = this.contrastBadge(t, c, key);
    } else {
      const [r, i] = kind === "item" ? key.split(".").map(Number) : [], it = kind === "item" ? this.cardOf().rows[r]?.items[i] : null;
      label = kind === "item" ? `${it ? this.itemName(it) : "Item"} (card item)` : kind === "agent" ? `${(AGENT_COLORS.find(([k]) => k === key) || [])[1] || key} (agents list)` : GLASS_LABELS[key] || key;
      reset = { can: true, tip: kind === "item" ? "Back to its role's color" : "Back to the theme's own color", run: (cx) => this.stageTarget("", cx) };
    }
    return v_flex().flex_none().px(14).py(12).border_b_1().border_color(t.border).child(this.colorEditor(t, label, key, reset, badge));
  }

  contrastBadge(t, c, token) {
    const p = PAIRS[token];
    if (!p || !c[token] || !c[p[0]]) return null;
    const r = contrast(c[token], c[p[0]]), ok = r >= p[1];
    return div().flex_none().px(5).rounded(5).text_size(10).bg(withAlpha(ok ? t.done : t.working, 0.15)).text_color(ok ? t.done : t.working).child(`${r.toFixed(1)}:1`);
  }

  colorsTab(t, s, cx) {
    const c = this.themeColors(), sel = this.pickTarget, g = this.glassShown();
    const tile = (token) => {
      const on = sel === `tok:${token}`, staged = token in this.colorDraft, badge = this.contrastBadge(t, c, token);
      return v_flex().id(`tok-${token}`).w(118).p(5).gap(5).rounded(9).cursor_pointer()
        .border_1().border_color(on ? t.accent : t.border).hover((st) => st.border_color(on ? t.accent : t.input))
        .on_click((_e, cx) => this.selectTarget(`tok:${token}`, cx))
        .child(div().relative().h(26).rounded(5).border_1().border_color(t.input).bg(c[token] || "#00000000")
          .when(staged, (el) => el.child(div().absolute().top(4).right(4).size(6).rounded(3).bg(t.accent))))
        .child(h_flex().px(2).gap(4).items_center()
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(TOKEN_LABELS[token] || token))
          .when(!!badge, (el) => el.child(badge)));
    };
    const ansiTokens = GROUPS.find(([l]) => l === "Terminal ANSI")[1];
    const ansi = (token) => div().id(`tok-${token}`).flex_1().h(24).rounded(5).bg(c[token]).cursor_pointer()
      .border_2().border_color(sel === `tok:${token}` ? t.foreground : "#00000000")
      .tooltip(token)
      .on_click((_e, cx) => this.selectTarget(`tok:${token}`, cx));
    const ansiRow = (label, tokens) => h_flex().gap(4).items_center().child(div().w(44).flex_none().text_size(10.5).text_color(t.dim).child(label)).children(tokens.map(ansi));
    const behinds = [["", "Window"], ["canvas", "Canvas"], ["chrome", "Chrome"], ["background", "Terminal"]];
    const custom = g.behind && !behinds.some(([v]) => v === g.behind);
    const behind = this.personal()
      ? h_flex().gap(8).items_center()
        .child(this.seg("behind", behinds, custom ? null : g.behind, t, (v, cx) => this.stageGlass({ behind: v }, cx), true))
        .child(this.chip(t, "behind-custom", "Custom", this.glassHex("behind"), custom || sel === "glass:behind", (_e, cx) => this.selectTarget("glass:behind", cx)))
      : div().text_size(11.5).text_color(t.dim).child("Needs your own copy of this layout (Glass tab).");
    const cur = this.cursorShown();
    const cursor = v_flex().gap(2)
      .child(this.row(t, "Shape", this.seg("cur", [["block", "Block"], ["underline", "Underline"], ["bar", "Bar"]], cur.shape, t, (v, cx) => this.stageCursor({ shape: v }, cx))))
      .child(this.row(t, "Blink", this.toggle("cur-blink", cur.blink, t, (_e, cx) => this.stageCursor({ blink: !cur.blink }, cx))))
      .child(this.row(t, "Color", this.chip(t, "cur-color", "Cursor", c.cursor || c.foreground, sel === "tok:cursor", (_e, cx) => this.selectTarget("tok:cursor", cx))));
    const hook = this.cursorHooked ? null : h_flex().gap(6).items_center()
      .child(div().text_size(11.5).text_color(t.dim).child("New panes need one line in ~/.zshrc."))
      .child(this.link("cur-copy", "Copy line", t, (_e, cx) => { cx.write_to_clipboard(CURSOR_LINE); this.say("Copied. Paste it at the end of ~/.zshrc", "success", cx); }));
    return v_flex().gap(22)
      .child(this.section("Cursor", t, cursor, "The color saves to the theme. Shape and blink go to every Herdr pane; programs like vim may change them until the next prompt. Herdr has no cursor-shape setting, so new panes get it from a line in ~/.zshrc (the Studio doesn't edit that file).", { hint: hook }))
      .children(GROUPS.map(([label, tokens]) => label === "Terminal ANSI"
        ? this.section("Terminal colors", t, v_flex().gap(4).child(ansiRow("Normal", ansiTokens.slice(0, 8))).child(ansiRow("Bright", ansiTokens.slice(8))),
          "The 16 colors programs print with; Herdr works most of the other colors out from them. Their Reset only undoes an unsaved change.")
        : this.section(label, t, h_flex().flex_wrap().gap(6).children(tokens.map(tile)),
          label === "Surfaces" ? `Click a color to edit it. Theme colors save to themes/${this.editing}.json; a changed color shows a dot. Reset lets Herdr work a color out from the terminal colors again.` : null)))
      .child(this.section("Behind panes", t, behind,
        "The gap between panes and the corners outside each pane's rounding. This one saves to your layout, not the theme. Window lets the window's own background show through. Canvas, Chrome and Terminal follow the theme; a custom color stays as you set it."));
  }

  typeTab(t, s, cx) {
    const { v } = this.typeValues(s);
    const fonts = v_flex().gap(2)
      .child(this.row(t, "Terminal", h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(this.fontPicker(t, "font", v.font))
        .child(this.stepper(t, v.font_size, MIN_SIZE, MAX_SIZE, (n, cx) => this.stage("font_size", n, cx)))))
      .child(this.row(t, "Ligatures", this.toggle("lig", v.font_ligatures, t, (_e, cx) => this.stage("font_ligatures", !v.font_ligatures, cx))))
      .child(this.row(t, "Panels", this.fontPicker(t, "ui_font", v.ui_font)));
    const folder = h_flex().gap(6).items_center()
      .child(div().text_size(11.5).text_color(t.dim).child("Your own .ttf and .otf files load from the fonts folder."))
      .child(this.link("fonts-open", "Open it", t, (_e, cx) => cx.spawn(async () => { await fs.mkdir(`${HOME}/fonts`, { recursive: true }).catch(() => {}); await exec("open", [`${HOME}/fonts`]); })));
    return v_flex().gap(22)
      .child(this.section("Fonts", t, fonts,
        "Herdr has no font weight, character or line spacing, or anti-aliasing settings, so those aren't here. Panel text has no size setting either: panels follow Herdr's zoom (⌘+ / ⌘−). Fonts in the fonts folder load without installing them system-wide.", { hint: folder }))
      .child(this.section("Minimum contrast", t, this.row(t, "Lift faint text",
        this.seg("mc", CONTRASTS.map((n) => [n, n === 1 ? "Off" : String(n)]), v.minimum_contrast, t, (n, cx) => this.stage("minimum_contrast", n, cx), true)),
        "Lifts terminal text that's too faint for its background, up to the ratio you pick. Off leaves programs' colors alone. The sample's lift and ligatures are close to Herdr's, not exact."));
  }

  glassTab(t, s, cx) {
    if (!this.personal()) return this.needsCopy(t, "Glass needs your own copy of this layout",
      `Herdr's own layouts (${shared("layout")}) only take theme and background changes. A copy takes everything: terminal opacity, translucent sidebars, pane corners and gaps. Herdr updates won't change your copy; you can switch back any time with ⌘⇧L. The Studio closes for a moment while Herdr switches.`, "glass");
    const g = this.glassShown(), c = this.themeColors(), sel = this.pickTarget;
    const fmt = { opacity: (v) => `${Math.round(v * 100)}%`, chrome: (v) => `${Math.round(v * 100)}%`, radius: (v) => `${v}px`, gap: (v) => `${v}px`, margin: (v) => `${v}px`, angle: (v) => `${v}°`, glowIntensity: (v) => `${v}%` };
    const slider = (k, label) => this.slider(t, this.sliders[k], k, label, fmt[k](g[k]));
    const chips = (keys) => h_flex().flex_wrap().gap(6).children(keys.map(([k, label]) => this.chip(t, `gc-${k}`, label, this.glassHex(k), sel === `glass:${k}`, (_e, cx) => this.selectTarget(`glass:${k}`, cx))));
    const thumb = (name, p) => {
      const on = Object.entries(p).every(([k, v]) => g[k] === v);
      const back = p.bg === "theme" ? c.canvas : p.bg === "frost" ? withAlpha(c.muted, 0.45) : withAlpha(c.accent, 0.4);
      const pane = () => div().flex_1().h_full().rounded(Math.round(p.radius / 2)).bg(withAlpha(c.background, p.opacity));
      return v_flex().id(`gp-${name}`).flex_1().p(5).gap(5).rounded(10).cursor_pointer()
        .border_1().border_color(on ? t.accent : t.border).hover((st) => st.border_color(on ? t.accent : t.input))
        .on_click((_e, cx) => this.stageGlass({ ...p }, cx))
        .child(div().h(46).rounded(6).overflow_hidden().bg(c.canvas)
          .child(h_flex().size_full().p(4).gap(3).bg(back).child(div().w(16).h_full().rounded(3).bg(withAlpha(c.chrome, p.chrome))).child(pane()).child(pane())))
        .child(h_flex().px(3).gap(4).items_center().child(div().flex_1().text_size(12).child(name))
          .when(on, (el) => el.child(svg(`${ICONS}/check.svg`).size(13).text_color(t.accent))));
    };
    const bgs = [["theme", "Theme"], ["gradient", "Gradient"], ["bloom", "Bloom"], ["frost", "Wallpaper"], ["image", "Image"]];
    const background = v_flex().gap(2)
      .child(h_flex().pb(6).child(this.seg("bg", bgs, g.bg, t, (v, cx) => this.stageGlass({ bg: v }, cx), true)))
      .when(g.bg === "gradient", (el) => el.child(this.row(t, "Colors", chips([["from", "From"], ["to", "To"]]))).child(slider("angle", "Angle")))
      .when(g.bg === "bloom", (el) => el.child(this.row(t, "Glows", chips([["bloomBase", "Base"], ["glowA", "Glow 1"], ["glowB", "Glow 2"], ["glowC", "Glow 3"]]))).child(slider("glowIntensity", "Glow strength")))
      .when(g.bg === "frost", (el) => el.child(this.row(t, "Wallpaper", h_flex().flex_1().gap(8).items_center()
        .child(div().flex_1().text_size(11.5).text_color(t.dim).child("Your desktop picture, blurred."))
        .child(this.button("frost-now", "Rebuild", t, (_e, cx) => cx.spawn((cx) => this.guard(cx, "Blurring wallpaper", async () => { await this.refreshFrost(cx, true); this.pushGlass(); this.say("Frosted wallpaper rebuilt", "success", cx); })))))))
      .when(g.bg === "image", (el) => el.child(this.row(t, "Picture", h_flex().id("img-drop").flex_1().min_w(0).gap(6).on_drop((e, cx) => this.useImage(e.paths && e.paths[0], cx))
        .child(this.button("img-choose", "Choose…", t, (_e, cx) => this.chooseImage(cx)))
        .child(Input.new(this.imagePath).flex_1().min_w(0).h(30).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(this.button("img-set", "Use", t, (_e, cx) => this.useImage(this.imagePath.value().trim(), cx))))));
    const tips = {
      theme: "The theme's canvas color.", gradient: "A straight gradient from one color to the other. Clear a color's hex box to go back to the theme's accent (From) or canvas (To).",
      bloom: "Soft glows behind the glass. Herdr can only paint a flat color, a straight gradient or a picture behind panes, so the Studio renders the glows into a picture (backgrounds/studio-bloom-*.jpg), redrawn as you change it and when the theme changes.",
      frost: "Your desktop picture, blurred. It shows the wallpaper only, not the windows behind Herdr, and it doesn't move with the window. Rebuilt when the wallpaper changes and you open the Studio.",
      image: "Choose a picture, drop one on the row, or type a path. Herdr only reads pictures in its own folder, so one from elsewhere is copied into backgrounds/ first.",
    };
    return v_flex().gap(22)
      .child(this.section("Start from", t, h_flex().gap(8).children(Object.entries(GLASS_PRESETS).map(([n, p]) => thumb(n, p))),
        "A starting point: it sets every control below at once. Change any of them after."))
      .child(this.section("Window background", t, background, tips[g.bg]))
      .child(this.section("Glass surfaces", t, v_flex().gap(2).child(slider("chrome", "Sidebar and bar")).child(slider("opacity", "Terminal")),
        "Below 100%, the window background shows through. A busy background needs more opacity to keep text readable. The glass takes the theme's chrome and terminal colors: change those on the Colors tab."))
      .child(this.section("Pane frames", t, v_flex().gap(2).child(slider("radius", "Corner radius")).child(slider("margin", "Margin")).child(slider("gap", "Gap")),
        "The margin frames the pane area, even with one pane. The gap shows between split panes and beside the side panel. Their color is on the Colors tab, under Behind panes.",
        { hint: "Seeing other windows through Herdr needs a Herdr setting that doesn't exist yet (herdr-app issue #190)." }));
  }

  agentsTab(t, s, cx) {
    if (!this.personal()) return this.needsCopy(t, "The agents list needs your own copy of this layout",
      `Herdr's own layouts (${shared("layout")}) can't swap their agents list. A copy can: it shows the Studio's version of the list, a copy of Herdr's with your sizes. The Studio closes for a moment while Herdr switches.`, "agents");
    const a = this.agentsShown(), sel = this.pickTarget;
    // Number boxes in a grid: three to a line in the wide Agents panel.
    const nums = (pairs) => h_flex().flex_wrap().gap(6).children(pairs.map(([k, label]) => this.numBox(t, k, label)));
    const preset = Object.entries(AGENT_PRESETS).find(([, p]) => Object.keys(p).every((k) => p[k] === a[k]));
    const seg = (id, opts, key) => this.seg(id, opts, a[key], t, (v, cx) => this.stageAgents({ [key]: v }, cx), true);
    const sw = (id, label, key) => this.row(t, label, this.toggle(id, a[key], t, (_e, cx) => this.stageAgents({ [key]: !a[key] }, cx)));
    return v_flex().gap(22)
      .child(this.section("Layout", t, v_flex().gap(2)
        .child(this.row(t, "Density", this.seg("agp", Object.keys(AGENT_PRESETS).map((n) => [n, n]), preset ? preset[0] : null, t, (n, cx) => this.stageAgents({ ...AGENT_PRESETS[n] }, cx), true)))
        .child(this.stacked(t, "Start from", this.seg("agst", CARD_STARTS.map(([id, label]) => [id, label]), null, t, (id, cx) => this.startCard(id, cx), true))),
        "Comfortable is Herdr's own list. Start from replaces the card below with a ready-made one: change it from there."))
      .child(this.section("Card", t, this.designer(t, a),
        "Drag items onto a row, along a row, or back to Items to take them off. Click one to change it. Rows lay out like CSS flexbox: Wrap moves what doesn't fit to the next line, Grow takes the spare width. Name is the terminal's name label, else the session's /rename name, else its title. A label item shows any Herdr terminal label: set one with hc label <terminal> key=value. A Space under its own header hides, and a text already on the card isn't repeated."))
      .child(this.section("Cards", t, v_flex().gap(2)
        .child(this.row(t, "Colors", h_flex().flex_1().flex_wrap().gap(6).children(AGENT_COLORS.filter(([k]) => !a.card || !["nameColor", "detailColor", "timeColor"].includes(k)).map(([k, label]) => this.chip(t, `agc-${k}`, label, this.agentHex(k, a), sel === `agent:${k}`, (_e, cx) => this.selectTarget(`agent:${k}`, cx))))))
        .when(!a.card, (el) => el.child(this.row(t, "Name weight", seg("agw", [["normal", "Regular"], ["medium", "Medium"], ["semibold", "Semibold"], ["bold", "Bold"]], "weight"))))
        .child(div().h(4)).child(nums([["radius", "Corners"], ["pad", "Side padding"], ["space", "Spacing"]])),
        "A color you pick stays when you change themes; the ones left unset follow the theme. A Card color, a Border or some spacing turns each agent into its own card."))
      // A designed card's items carry their own text sizes; what's left belongs to the list.
      .child(this.section("Sizes", t, nums([["row", "Row height"], ["text", "Name text"], ["detailText", "Detail text"], ["icon", "Icon"], ["header", "Group header"], ["headerText", "Header text"],
        ["timeText", "Time since"], ["titleText", "\"Agents\" title"], ["badgeText", "\"Needs you\""]].filter(([k]) => !a.card || !["text", "detailText", "icon", "timeText"].includes(k))),
        "Heights and text sizes in points, at Herdr's normal zoom. Type a number, press − or +, or use Up and Down."))
      .child(this.section("Show", t, v_flex().gap(2)
        .child(sw("ag-headers", "Group headers", "headers"))
        .when(!a.card, (el) => el.child(sw("ag-time", "Time since", "time")).child(sw("ag-icons", "Agent icons", "icons")).child(sw("ag-badge", "\"Needs you\" badge", "badge"))),
        "Time since is 3m, 12m. Group headers are Working, Pinned and the rest. Without the badge, an agent that needs you shows a small !. Your layout copy shows the Studio's copy of Herdr's agents list once anything here differs from Herdr's; it's rebuilt from Herdr's list on each Save, so Herdr's updates still reach it."));
  }

  // Settings that belong to the person, not a theme: they apply at once and stay across themes.
  settingsView(t) {
    if (!this.personal()) return v_flex().gap(22).child(this.needsCopy(t, "Sidebar settings need your own copy of this layout",
      `Herdr's own layouts (${shared("layout")}) can't change. A copy can hide its sidebar and hold the palette icon; Herdr keeps updating everything else. The Studio closes for a moment while Herdr switches.`, "colors"))
      .child(this.updatesSection(t));
    const mode = autoHideMode(layout()), auto = !!mode, icon = hasFooterIcon(layout());
    return v_flex().gap(22)
      .child(this.section("Sidebar", t, v_flex().gap(10)
          .child(this.row(t, "Auto-hide", this.toggle("set-autohide", auto, t, (_e, cx) => this.setAutoHide(!auto, cx))))
          .when(auto, (el) => el.child(this.row(t, "Folds to", this.seg("set-ahmode", [["rail", "Minimal"], ["hidden", "Hidden"]], mode, t, (m, cx) => m !== mode && this.setAutoHide(true, cx, m))))),
        "Keeps the sidebar out of the way until you need it: folded to the same narrow rail as Herdr's own fold button, or hidden entirely. Rest the pointer on the rail (or, when hidden, at the window's left edge) and it opens, with the terminals making room; move well past it and it folds back a moment later. Opened with Herdr's own fold button, it stays open.",
        { hint: !auto ? null : mode === "rail" ? "Rest the pointer on the rail to open the sidebar." : "Move the pointer to the window's left edge to bring it back." }))
      .child(this.section("Palette icon", t, this.row(t, "Beside Settings", this.toggle("set-icon", icon, t, (_e, cx) => this.setButton(!icon, cx))),
        "An icon in the sidebar's Settings row (under Settings on the narrow rail) that opens Theme Studio. Herdr's own Settings screen can't take extra sections, so it lives there. It shows a dot when an update is ready, and looks for one while the Studio is closed."))
      .child(this.updatesSection(t));
  }

  // Glass and Agents on one of Herdr's own layouts: what a copy is, and the button that makes it.
  needsCopy(t, title, text, tab) {
    return v_flex().gap(12).p(14).rounded(10).bg(t.raised).border_1().border_color(t.border)
      .child(div().font_semibold().child(title))
      .child(div().text_size(12.5).text_color(t.muted).line_height("19px").child(text))
      .child(h_flex().child(this.button("copy-layout", `Make my copy of ${shared("layout")}`, t, (_e, cx) => this.makeCopy(cx, tab), true)));
  }

  typeValues(s) {
    const now = { font: s.font_family, ui_font: s.ui_font_family, font_size: s.font_size, font_ligatures: !!s.font_ligatures, minimum_contrast: s.minimum_contrast ?? 1 };
    return { now, v: { ...now, ...(this.themeType() || {}), ...this.draft } };
  }

  // settings() with what was just written, which Herdr can take ~10 s to report.
  shown() {
    const p = this.pending && Date.now() - this.pending.at < HOLD_MS ? this.pending : null;
    return p ? { ...settings(), ...p } : settings();
  }

  stage(key, value, cx) {
    const { now } = this.typeValues(this.shown());
    if (now[key] === value) delete this.draft[key]; else this.draft[key] = value;
    cx.notify();
  }

  typeSample(t, v) {
    const bg = t.background, fg = t.foreground, min = v.minimum_contrast;
    const c = (hex) => liftContrast(hex, bg, min);
    const line = (...parts) => h_flex().children(parts.map(([text, color]) => div().text_color(c(color)).child(v.font_ligatures ? text : breakLigatures(text))));
    return v_flex().flex_none().gap(2).p(14).rounded(10).border_1().border_color(t.border).bg(bg).font_family(v.font).text_size(v.font_size).line_height(`${Math.round(v.font_size * 1.45)}px`)
      .child(line(["❯ ", t.ansi2], ["git ", fg], ["status", t.ansi4]))
      .child(line(["On branch ", fg], ["main", t.ansi5], ["  0O 1lI {}[]", t.ansi8]))
      .child(line(["const ok = a -> b != c && d => e;", t.ansi3]))
      .child(line(["# a faint comment", t.ansi8], ["  ", fg], ["warn", t.ansi1], [" done", t.ansi2]))
      .child(div().pt(6).text_size(12).text_color(t.muted).font_family(v.ui_font).child(`Panels: ${v.ui_font}`));
  }

  // A font dropdown: the trigger shows the font in its own face; the list opens under it with a
  // filter and closes on a pick, a second press or a press outside it. One open at a time.
  fontPicker(t, target, current) {
    const open = this.fontOpen === target;
    const q = this.fontQuery.trim().toLowerCase();
    let list = sortFonts(fonts()).filter((f) => !q || f.toLowerCase().includes(q));
    if (target === "font" && !q) list = list.filter(isMono);
    list = list.slice(0, 80);
    const row = (f) => h_flex().id(`font-${target}-${f}`).px(8).py(5).rounded(6).gap(8).items_center().cursor_pointer()
      .when(f === current, (el) => el.bg(t.selected)).hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => { this.fontOpen = null; this.stage(target, f, cx); })
      .child(div().flex_1().truncate().font_family(f).text_size(14).child(f))
      .child(div().text_size(11).text_color(t.dim).font_family(f).child("Ag 0O il1 =>"));
    const trigger = h_flex().id(`font-trigger-${target}`).flex_1().min_w(0).h(30).px(10).gap(8).items_center().rounded(8).cursor_pointer()
      .border_1().border_color(open ? t.accent : t.input).bg(t.background)
      // A press on the trigger first closes an open menu as a press outside it: don't reopen.
      .on_click((_e, cx) => { this.fontOpen = !open && Date.now() - (this.fontClosedAt || 0) > 300 ? target : null; cx.notify(); })
      .child(div().flex_1().truncate().font_family(current).text_size(13).child(current))
      .child(svg(`${ICONS}/chevron.svg`).size(13).flex_none().text_color(t.dim));
    return Popup.new(`font-popup-${target}`, trigger).anchor("top_left").flex_1().min_w(0)
      .when(open, (el) => el.content(v_flex().id("font-menu").w(340).p(6).gap(6).rounded(10)
        .border_1().border_color(t.input).bg(t.raised).shadow_lg()
        .on_mouse_down_out((_e, cx) => { this.fontOpen = null; this.fontClosedAt = Date.now(); cx.notify(); })
        .child(Input.new(this.fontIn).h(30).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(div().px(2).text_size(11).text_color(t.dim).child(target === "font" && !q ? "Monospaced fonts only. Type to search every font." : `${list.length} of ${fonts().length} fonts`))
        .child(v_flex().id("font-list").h(240).overflow_y_scrollbar().children(list.map(row)))));
  }

  // Size box with − and + either side, like the window's own steppers.
  stepper(t, value, min, max, onStep) {
    const step = (id, label, d) => div().id(id).w(26).h_full().flex().items_center().justify_center().text_size(14).text_color(t.muted).cursor_pointer()
      .hover((st) => st.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { const n = Math.min(max, Math.max(min, value + d)); if (n !== value) onStep(n, cx); })
      .child(label);
    return h_flex().flex_none().h(30).items_center().rounded(8).overflow_hidden().border_1().border_color(t.input).bg(t.background)
      .child(step("size-down", "−", -1)).child(div().w(30).text_center().text_size(12.5).child(String(value))).child(step("size-up", "+", 1));
  }

  // The picker for the selected color: swatch and name, hex box, Reset ({ can, tip, run }), and
  // hue/saturation/lightness/alpha strips. Each strip shows what its slider would give.
  colorEditor(t, label, code, reset, badge) {
    const P = this.pick;
    const strips = [
      ["H", (k) => hslaToHex(k * 359, 100, 50)],
      ["S", (k) => hslaToHex(P[0], k * 100, P[2])],
      ["L", (k) => hslaToHex(P[0], P[1], k * 100)],
      ["A", (k) => hslaToHex(P[0], P[1], P[2], k * 100)],
    ];
    const row = ([name, fn], i) => h_flex().gap(8).items_center()
      .child(div().w(12).text_size(10.5).text_color(t.dim).child(name))
      // The strip sits under the slider: the indicator draws only the thumb.
      .child(div().relative().flex_1()
        .child(h_flex().absolute().top(5).left(0).w_full().h(8).rounded(4).bg(t.background)
          // overflow_hidden doesn't clip to the radius, so the end bands round themselves.
          .children(Array.from({ length: 48 }, (_, j) => div().flex_1().h_full().bg(fn(j / 47)).when(j === 0, (el) => el.rounded_l(4)).when(j === 47, (el) => el.rounded_r(4)))))
        .child(Slider.new(this.pickers[i]).child(SliderTrack.new(this.pickers[i]).flex().items_center().h(18).w_full().cursor_pointer()
          .child(SliderIndicator.new(this.pickers[i]).relative().w_full().h(8)
            .range_style((f) => f)
            // A 14px ring on an 8px strip: pulled back half its width and 3px up.
            .child(SliderThumb.new(this.pickers[i]).id(`pick-${name}`).size(14).rounded(7).border_2().border_color("#ffffff").ml(-7).mt(-3))))))
      .child(div().w(28).text_size(11).text_color(t.muted).text_right().child(String(P[i])));
    return v_flex().gap(10)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(h_flex().gap(10).items_center()
        .child(div().size(40).flex_none().rounded(10).border_1().border_color(t.input).bg(hslaToHex(...P)))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(6).items_center().child(div().min_w(0).truncate().text_size(13).font_semibold().child(label)).when(!!badge, (el) => el.child(badge)))
          .child(div().text_size(11).text_color(t.dim).truncate().child(code)))
        .child(Input.new(this.hex).w(96).flex_none().h(28).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_color(t.foreground).text_size(12))
        .child(this.button("hex-set", "Set", t, (_e, cx) => this.stageHex(this.hex.value(), cx)))
        .when(!!reset, (el) => el.child(this.iconButton("hex-reset", "undo", reset.tip, t, (_e, cx) => { if (reset.can) reset.run(cx); }, false, !reset.can)))
        .child(this.iconButton("hex-close", "close", "Close the picker", t, (_e, cx) => this.selectTarget(null, cx, false))))
      .child(v_flex().gap(2).children(strips.map(row)));
  }

  // The small mock Herdr window, drawn from the staged colors, glass, type and agents list:
  // backdrop, sidebar with spaces and agents, tab bar, two pane cards over the behind-panes color.
  windowPreview(t, sidebarOnly = false) {
    const c = { ...t, ...this.themeColors() }, g = this.glassShown(), base = this.baseColors(g, c), v = this.typeValues(this.shown()).v;
    const behind = g.behind ? this.glassHex("behind", g, c) : null;
    const see = g.opacity < 1;
    const chrome = withAlpha(base.chrome, g.chrome), term = see ? withAlpha(base.background, g.opacity) : c.background;
    // ponytail: the gradient snaps to the nearest of four directions; Herdr draws the exact angle.
    const a = ((g.angle % 360) + 360) % 360, across = (a > 45 && a < 135) || (a > 225 && a < 315);
    const flip = across ? a > 180 : !(a >= 135 && a <= 225);
    const from = this.glassHex("from", g, c), to = this.glassHex("to", g, c);
    const bands = Array.from({ length: 24 }, (_, i) => div().flex_1().bg(withAlpha(from, flip ? i / 23 : 1 - i / 23)));
    const path = g.bg === "frost" ? g.frost : g.bg === "image" ? g.image : g.bg === "bloom" ? g.bloom : "";
    const backdrop = g.bg === "gradient" ? (across ? h_flex() : v_flex()).size_full().bg(to).children(bands)
      : g.bg === "bloom" && (this.bloomPending || !path) ? this.bloomMock(g, c)
      // image() fits inside its box; twice the box, centered, fills it for any picture near 16:10.
      // ponytail: a far wider or taller picture still letterboxes; needs an image fit option from Herdr.
      // The sidebar alone is tall and narrow: a box far wider than tall, so the picture fits by its height.
      : path && sidebarOnly ? div().relative().size_full().overflow_hidden().child(image(path).absolute().left("-250%").top("-50%").w("600%").h("200%"))
      : path ? div().relative().size_full().overflow_hidden().child(image(path).absolute().left("-50%").top("-50%").w("200%").h("200%")) : div().size_full().bg(g.bg === "bloom" ? this.glassHex("bloomBase", g, c) : c.canvas);
    const size = v.font_size, text = c.terminal_foreground || c.foreground;
    const line = (parts) => h_flex().gap(Math.round(size * 0.6)).children(parts.map(([s, col]) => div().text_color(col).child(v.font_ligatures ? s : breakLigatures(s))));
    const card = (title, lines, tail) => v_flex().flex_1().h_full().min_w(0).rounded(g.radius).overflow_hidden().bg(term)
      .child(div().h(26).flex_none().px(10).flex().items_center().text_size(11).text_color(c.muted).border_b_1().border_color(c.border).child(title))
      .child(v_flex().p(10).gap(1).font_family(v.font).text_size(size).line_height(`${Math.round(size * 1.5)}px`)
        .children(lines.map((l, i) => i === lines.length - 1 && tail ? line(l).child(tail) : line(l))));
    const space = (letter, name, color, on) => h_flex().h(28).px(8).gap(8).items_center().rounded(6).when(on, (el) => el.bg(c.selected))
      .child(div().size(16).flex_none().rounded(4).bg(color).flex().items_center().justify_center().text_size(9.5).font_bold().text_color(c.background).child(letter))
      .child(div().min_w(0).truncate().text_size(12.5).child(name));
    return div().relative().size_full().rounded(12).overflow_hidden().border_1().border_color(t.border).bg(c.canvas).text_color(c.foreground).font_family(v.ui_font)
      .child(div().absolute().inset_0().child(backdrop))
      .child(h_flex().absolute().inset_0()
        .child(v_flex().when(sidebarOnly, (el) => el.flex_1().min_w(0)).when(!sidebarOnly, (el) => el.w(210).flex_none()).h_full().bg(chrome).border_r_1().border_color(c.border).p(8).gap(2).overflow_hidden()
          .when(!sidebarOnly, (el) => el
            .child(h_flex().px(6).pt(2).pb(4).justify_between().text_size(11).text_color(c.dim).child("Spaces").child("+"))
            .child(space("H", "herdr-app-theming", c.ansi6, true))
            .child(space("A", "agent-tools-private", c.ansi3, false))
            .child(div().h(12)))
          .child(this.agentsPreview(c, this.agentsShown())))
        .child(v_flex().flex_1().h_full().min_w(0).when(sidebarOnly, (el) => el.hidden())
          .child(h_flex().h(34).flex_none().px(10).gap(6).items_center().bg(chrome).border_b_1().border_color(c.border)
            .child(div().w(64).h(20).rounded(6).bg(c.selected)).child(div().w(52).h(20).rounded(6).bg(c.hover)).child(div().w(52).h(20).rounded(6).bg(c.hover)))
          .child(h_flex().flex_1().min_h(0).p(g.margin).gap(g.gap).when(!!behind, (el) => el.bg(behind))
            .child(card("zsh", [[["~/app", c.ansi4], ["main", c.ansi5]], [["$ npm test", text]], [["✓ 42 passed", c.ansi2]], [["# 3 suites, 0.8s", c.ansi8]], [["$ git status", text]], [["On branch", text], ["main", c.ansi2]]]))
            .child(card("claude", [[["● Reading lib.js", c.ansi3]], [["  edits ready", c.muted]], [["Update(main.js)", c.ansi6]], [["  - .px(8)", c.ansi1]], [["  + .px(pad)", c.ansi2]], [["❯", c.accent]]], this.cursorMark(c, size))))));
  }

  // The bloom drawn straight from its recipe, while the picture for Herdr is being rendered (it takes
  // a second or two), so the preview follows a drag. Rings stand in for the soft falloff.
  bloomMock(g, c) {
    const spec = bloomSpec(this.glassHex("bloomBase", g, c), ["glowA", "glowB", "glowC"].map((k) => this.glassHex(k, g, c)), g.glowIntensity), N = 8;
    return div().relative().size_full().overflow_hidden().bg(spec.base)
      .children(spec.glows.flatMap((o) => Array.from({ length: N }, (_, i) => {
        const w = o.r * 2 * (1 - i / N) * 100, h = (w * spec.w) / spec.h;
        return div().absolute().left(`${o.x * 100 - w / 2}%`).top(`${o.y * 100 - h / 2}%`).w(`${w}%`).h(`${h}%`).rounded(9999).bg(withAlpha(o.c, Math.min(1, (o.a / N) * 1.5)));
      })));
  }

  // The terminal cursor in the mock window, in its staged shape and color (blink isn't shown).
  cursorMark(c, size) {
    const col = c.cursor || c.foreground, shape = this.cursorShown().shape, w = Math.round(size * 0.6), h = size + 2;
    return h_flex().h(h).items_center()
      .child(shape === "bar" ? div().w(1.5).h(h).bg(col) : shape === "underline" ? div().w(w).h(h).flex().items_end().child(div().w_full().h(1.5).bg(col)) : div().w(w).h(h).bg(col));
  }

  // The sidebar's agents list with the staged sizes, as it sits in the preview's sidebar.
  agentsPreview(t, a) {
    const rows = [["herdr-app-theming", "3m", "working", "Herdr theming plugin design", "theming"], ["agent-tools-private", "12m", "blocked", "ah2-fix: implementor", "ah2-implementor"], ["notes", "1h", "idle", "", ""]];
    // The same rule as the clone's "auto", for the preview's 194px list.
    const two = (name, more) => a.lines === "two" || (a.lines === "auto" && (name.length + (more ? more.length + 3 : 0)) * a.text * 0.56 > 194 - 16 - (a.icons ? a.icon + 9 : 0) - (a.time ? 30 : 0) - 24);
    const status = (st, compact = !a.badge) => st === "working" ? div().size(10).flex_none().rounded(5).border_2().border_color(t.working)
      : st === "blocked" ? (!compact ? div().flex_none().px(6).h(a.badgeText + 7.5).rounded(5).bg(t.blocked + "26").text_size(a.badgeText).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you")
        : div().size(a.badgeText + 3.5).flex_none().rounded(4).bg(t.blocked + "26").text_size(a.badgeText).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!"))
      : div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle || t.dim);
    const gap = a.row < 26 ? 6 : 9, pic = () => div().size(a.icon).flex_none().rounded(4).bg(t.accent);
    const col = (k, fallback) => a[k] || fallback;
    const weight = (el) => a.weight === "bold" ? el.font_bold() : a.weight === "semibold" ? el.font_semibold() : a.weight === "medium" ? el.font_medium() : el;
    const card = (el, i) => el.px(a.pad).rounded(a.radius).flex_none().text_size(a.text)
      .when(Boolean(a.cardColor), (e) => e.bg(a.cardColor)).when(Boolean(a.borderColor), (e) => e.border_1().border_color(a.borderColor))
      .when(i === 0, (e) => e.bg(col("selectedColor", t.selected)));
    const name = (text, st, more) => h_flex().flex_1().min_w(0).gap(5).items_center()
      .child(div().min_w(0).truncate().text_color(col("nameColor", st === "idle" ? t.muted : t.foreground)).when(true, weight).child(text))
      .when(Boolean(more), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(col("detailColor", t.dim)).child(`· ${more}`)));
    const time = (when) => div().flex_none().text_size(a.timeText).text_color(col("timeColor", t.dim)).child(when);
    const left = a.statusSide === "left", lead = (st) => h_flex().w(16).flex_none().items_center().justify_center().child(status(st, true));
    const sample = a.card ? this.sampleLabels(a.labels || []) : null;
    const row = ([space, when, st, title, own], i) => {
      // A designed card: the clone's own renderer, on sample agents.
      if (a.card) return card(v_flex().id(`agm-${i}`).py(3).min_h(a.row).justify_center(), i).child(studioDrawCard(a.card, {
        title, space, machine: "", idle: st === "idle", name: () => own, labels: i < 2 ? { ...sample, ...(own ? { name: own } : {}) } : {},
        time: when, hovered: false, pin: null, status: (badge) => status(st, !badge), icon: (sz) => div().size(sz).flex_none().rounded(4).bg(t.accent), fold: null,
      }, a, t, { div, h_flex, v_flex }));
      // The same rule as the clone's "show": the /rename name instead of, or before, the title.
      const n = a.show === "title" ? "" : own, detail = n ? (a.show === "both" && title ? `${n} · ${title}` : n) : title;
      const [text, more] = a.lead === "session" && detail ? [detail, space] : [space, detail];
      return two(text, more)
      ? card(v_flex().id(`agm-${i}`).py(3).gap(1), i)
        .child(h_flex().h(Math.max(16, a.row - 6)).items_center().gap(gap).when(left, (el) => el.child(lead(st))).when(a.icons, (el) => el.child(pic())).child(name(text, st)))
        .child(h_flex().min_h(18).items_center().gap(6).pl((a.icons ? a.icon + gap : 0) + (left ? 16 + gap : 0))
          .child(div().flex_1().min_w(0).truncate().text_size(a.detailText).text_color(col("detailColor", t.dim)).child(more))
          .when(a.time, (el) => el.child(time(when))).when(!left, (el) => el.child(status(st))))
      : card(h_flex().id(`agm-${i}`).h(a.row).items_center().gap(gap), i)
        .when(left, (el) => el.child(lead(st)))
        .when(a.icons, (el) => el.child(pic()))
        .child(name(text, st, more))
        .when(a.time, (el) => el.child(time(when)))
        .when(!left, (el) => el.child(status(st)));
    };
    const header = (label, n) => h_flex().px(8).pt(a.header < 26 ? 4 : 8).h(a.header).flex_none().gap(6).items_center().text_size(a.headerText).font_medium().text_color(t.dim)
      .child(label).child(div().text_color(t.dim).child(String(n)));
    return v_flex().w_full()
      .child(div().px(8).pt(2).pb(4).text_size(a.titleText).font_medium().text_color(t.dim).child("Agents"))
      .when(a.headers, (el) => el.child(header("Working", 2)))
      .child(v_flex().gap(a.space).child(row(rows[0], 0)).child(row(rows[1], 1)))
      .when(a.headers, (el) => el.child(header("Idle", 1)))
      .child(row(rows[2], 2));
  }

  // --- updates ---------------------------------------------------------------
  updateHost() { return { exec, shared, setShared, notify, read: readTextFile, home: HOME }; }
  updateState() {
    const u = shared(UPDATE_KEY) || {};
    return { ...u, ready: versionNewer(u.latest, u.installed) };
  }
  // A check (force: past the 6-hour wait) or an install. Installing replaces this folder, and
  // studioUpdate then closes and reopens the Studio, which otherwise keeps running the old files.
  checkUpdate(cx, o = {}) {
    if (this.updating) return;
    this.updating = o.install ? "install" : o.force ? "check" : null;
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await studioUpdate(this.updateHost(), { ...o, auto: !o.install && this.changeCount() === 0 }).catch((e) => ({ failed: String(e && e.message || e) }));
      const was = this.updating;
      this.updating = null;
      if (was === "check") this.say(r.newer ? `v${r.latest} is available` : r.offline ? "Couldn't reach GitHub to check" : `v${r.installed} is the latest`, r.offline ? "error" : "success", cx);
      cx.notify();
    });
  }
  // The footer's icon patch travels with the Studio: after an update, its clone is rebuilt and remounted.
  refreshFooter(cx) {
    if (!hasFooterIcon(layout())) return;
    cx.spawn(async (cx) => {
      if (!(await this.ensureFooterClone(cx).catch(() => false))) return;
      run("layout.set", { layout: withFooterIcon(layout(), false) });
      await sleep(cx, 1200);
      run("layout.set", { layout: withFooterIcon(layout(), true) });
    });
  }
  openUrl(url) { if (url) exec("open", [url]).catch(() => {}); }
  updateBanner(t) {
    const u = this.updateState();
    if (!u.ready && !u.failed) return null;
    const installing = this.updating === "install" || (u.installing && Date.now() - u.installing < 120e3);
    const text = u.failed && !installing ? `Couldn't update to v${u.latest}: ${u.failed}` : installing ? `Installing v${u.latest}…` : `Theme Studio v${u.latest} is available. You have v${u.installed}.`;
    return h_flex().id("update-banner").flex_none().h(38).px(14).gap(10).items_center().border_t_1().border_color(t.border).bg(withAlpha(normHex(t.accent) || "#7aa2f7", 0.12))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(div().size(7).flex_none().rounded(4).bg(u.failed && !installing ? t.blocked || t.accent : t.accent))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).child(text))
      .when(!!u.url, (el) => el.child(this.link("update-notes", "What's new", t, () => this.openUrl(u.url))))
      .when(!installing && u.ready, (el) => el.child(this.button("update-now", u.failed ? "Try again" : "Update", t, (_e, cx) => this.checkUpdate(cx, { install: true }), true)));
  }
  updatesSection(t) {
    const u = this.updateState(), auto = !!shared(AUTO_UPDATE_KEY);
    const when = u.checked ? new Date(u.checked).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
    const status = u.ready ? `v${u.latest} is available` : u.latest ? "Up to date" : "Not checked yet";
    return this.section("Updates", t, v_flex().gap(10)
        .child(this.row(t, "Version", div().text_size(12.5).child(`v${u.installed || "?"} · ${status}`)))
        .child(this.row(t, "Auto-update", this.toggle("set-autoupdate", auto, t, (_e, cx) => { setShared(AUTO_UPDATE_KEY, !auto); cx.notify(); })))
        .child(h_flex().gap(8)
          .child(this.button("update-check", this.updating === "check" ? "Checking…" : "Check now", t, (_e, cx) => this.checkUpdate(cx, { force: true })))
          .when(u.ready, (el) => el.child(this.button("update-install", this.updating === "install" ? "Installing…" : `Update to v${u.latest}`, t, (_e, cx) => this.checkUpdate(cx, { install: true }), true)))
          .when(!!u.url, (el) => el.child(this.link("update-notes2", "What's new", t, () => this.openUrl(u.url))))),
      "Updates come from the latest release of agentic-tool-labs/herdr-theme-studio on GitHub, checked when the Studio opens and every 6 hours from the palette icon. Auto-update installs a new release as soon as it's found, but never while you have unsaved changes. Every install posts a notice.",
      { hint: [when ? `Last checked ${when}.` : null, u.offline ? "GitHub couldn't be reached on the last try." : null, u.failed ? `The last install failed: ${u.failed}` : null].filter(Boolean).join(" ") || null });
  }

  // --- card designer ---------------------------------------------------------
  // The card being designed: the one saved, else the one today's switches draw.
  cardOf(a = this.agentsShown()) { return a.card || cardFrom(a); }
  setCard(card, cx) { this.stageAgents({ card }, cx); }
  startCard(id, cx) {
    const start = CARD_STARTS.find((x) => x[0] === id);
    this.cardSel = null;
    this.setCard(cardFrom({ ...this.agentsShown(), ...start[2] }), cx);
  }
  newItem(kind) {
    if (kind === "status") return { kind, badge: false };
    if (kind === "name" || kind === "title") return { kind, grow: true, truncate: true };
    return kind === "icon" || kind === "time" ? { kind } : { kind, truncate: true };
  }
  editCard(fn, cx) {
    const card = JSON.parse(JSON.stringify(this.cardOf()));
    fn(card);
    this.setCard(card, cx);
  }
  editItem(patch, cx) { const { row, i } = this.cardSel; this.editCard((c) => Object.assign(c.rows[row].items[i], patch), cx); }
  editRow(patch, cx) { const { row } = this.cardSel; this.editCard((c) => Object.assign(c.rows[row], patch), cx); }
  labelsOf() { return this.agentsShown().labels || []; }
  // True when the UI font is Herdr's own Geist and no full Geist is installed: weights look alike.
  weightsMissing() {
    const ui = this.typeValues(this.shown()).v.ui_font || "Geist";
    return this.geistWeights === false && /^geist$/i.test(ui);
  }
  // What an item looks like with nothing of its own set: its role's size, color and weight.
  // Auto is the name for the card's first text item, the detail for the rest.
  itemLook(it, at, a = this.agentsShown()) {
    const c = this.themeColors(), hex = (k) => normHex(c[k] || "") || "#888888";
    if (it.kind === "icon") return { size: a.icon };
    if (it.kind === "time") return { size: a.timeText, color: a.timeColor || hex("dim"), weight: "normal" };
    const def = it.kind === "label" ? (a.labels || []).find((l) => l.id === it.id) : null;
    if (def && def.style === "pill") return { size: a.badgeText, color: (c[def.color] && hex(def.color)) || def.color || hex("accent"), weight: "semibold" };
    const card = this.cardOf(a);
    const firstText = card.rows.flatMap((r, ri) => r.items.map((x, xi) => ({ x, ri, xi }))).find(({ x }) => isTextItem(x));
    const role = it.role && it.role !== "auto" ? it.role : firstText && firstText.ri === at.row && firstText.xi === at.i ? "name" : "detail";
    return role === "name" ? { size: a.text, color: a.nameColor || hex("foreground"), weight: a.weight }
      : role === "accent" ? { size: a.detailText, color: hex("accent"), weight: "normal" }
      : { size: a.detailText, color: a.detailColor || hex("dim"), weight: "normal" };
  }
  editLabel(id, patch, cx) {
    const labels = this.labelsOf().map((l) => (l.id === id ? { ...l, ...patch } : l));
    this.stageAgents({ labels, card: this.cardOf() }, cx);
  }
  addLabel(cx) {
    const id = `l${Date.now().toString(36)}`;
    this.cardSel = { label: id };
    this.stageAgents({ labels: [...this.labelsOf(), { id, key: "", style: "pill", prefix: "", color: "accent", missing: "hide", text: "" }], card: this.cardOf() }, cx);
  }
  removeLabel(id, cx) {
    const card = JSON.parse(JSON.stringify(this.cardOf()));
    for (const r of card.rows) r.items = r.items.filter((it) => !(it.kind === "label" && it.id === id));
    this.cardSel = null;
    this.stageAgents({ labels: this.labelsOf().filter((l) => l.id !== id), card }, cx);
  }
  labelName(l) { return `${l.prefix || ""}${l.key || "new label"}`; }
  itemName(it, defs = this.labelsOf()) {
    if (it.kind === "label") { const l = defs.find((x) => x.id === it.id); return l ? this.labelName(l) : "missing label"; }
    return (CARD_ITEMS.find(([k]) => k === it.kind) || [, it.kind])[1];
  }

  // Dragging: a press on a chip starts it, chips and rows say where it would land as the pointer
  // moves over them, and the release anywhere in the Studio drops it (Herdr has no drag and drop
  // for elements, only for files).
  beginDrag(drag, cx, e) {
    cx.stop_propagation();
    // The chip stays under the pointer at the spot it was grabbed.
    this.grab = (e && e.local_position) || { x: 12, y: 12 };
    this.drag = drag; this.dropAt = null;
    cx.notify();
  }
  setDrop(at, cx) {
    if (JSON.stringify(at) === JSON.stringify(this.dropAt)) return;
    this.dropAt = at;
    cx.notify();
  }
  endDrag(cx) {
    const { drag, dropAt: at } = this;
    this.drag = null; this.dropAt = null; this.mouse = null; this.chipAt = null;
    if (!drag) return;
    const from = drag.from;
    // Back to Items: off the card.
    if (at && at.palette) {
      if (from) { this.cardSel = null; this.editCard((c) => c.rows[from.row].items.splice(from.i, 1), cx); } else cx.notify();
      return;
    }
    // Let go where it started: a click, which selects it.
    if (!at || (from && at.row === from.row && (at.i === from.i || at.i === from.i + 1))) {
      if (from) this.cardSel = from; else if (drag.item.kind === "label") this.cardSel = { label: drag.item.id };
      cx.notify();
      return;
    }
    let i = at.i;
    this.editCard((c) => {
      if (from) { c.rows[from.row].items.splice(from.i, 1); if (from.row === at.row && from.i < i) i--; }
      c.rows[at.row].items.splice(i, 0, drag.item);
    }, cx);
    this.cardSel = { row: at.row, i };
  }
  dragGhost(t) {
    return div().absolute().left(this.mouse.x - this.grab.x).top(this.mouse.y - this.grab.y).h(24).px(8).rounded(6).flex().items_center()
      .bg(t.raised).border_1().border_color(t.accent).text_size(11.5).text_color(t.foreground).shadow_lg()
      .child(this.itemName(this.drag.item));
  }

  designer(t, a) {
    const card = this.cardOf(a), defs = a.labels || [], sel = this.cardSel, drag = this.drag, at = this.dropAt;
    const stop = (_e, cx) => cx.stop_propagation();
    // A source (in Items) has a grip and a lifted look; a placed one sits flat in its row.
    const chip = (id, text, o = {}) => h_flex().id(id).h(24).px(8).gap(5).flex_none().items_center().rounded(6).text_size(11.5)
      .when(!!o.source, (el) => el.cursor_grab().shadow_sm()).when(!o.source, (el) => el.cursor_move())
      .border_1().border_color(o.on ? t.accent : o.label ? t.accent + "66" : t.border).bg(o.on ? t.selected : t.raised)
      .text_color(o.label ? t.accent : t.foreground).when(!!o.faded, (el) => el.opacity(0.35)).hover((st) => st.border_color(t.accent))
      .when(!!o.source, (el) => el.child(div().text_size(10).text_color(t.dim).child("⠿")))
      .child(o.grow ? `${text} ↔` : text);
    const caret = () => div().w(2).h(20).flex_none().rounded(1).bg(t.accent);
    // Items is a tray to take from, not a row: no well, and it says what to do with it.
    const palette = h_flex().id("card-items").flex_wrap().gap(5).p(at && at.palette ? 5 : 0).rounded(8)
      .when(!!(at && at.palette), (el) => el.border_1().border_dashed().border_color(t.accent).bg(t.accent + "14"))
      .on_mouse_move((_e, cx) => { if (this.drag) this.setDrop({ palette: true }, cx); })
      .children([
        ...CARD_ITEMS.map(([k, n]) => chip(`cp-${k}`, n, { source: true }).on_mouse_down("left", (e, cx) => this.beginDrag({ item: this.newItem(k) }, cx, e))),
        ...defs.map((l) => chip(`cpl-${l.id}`, this.labelName(l), { source: true, label: true, on: !!sel && sel.label === l.id })
          .on_mouse_down("left", (e, cx) => this.beginDrag({ item: { kind: "label", id: l.id } }, cx, e))),
        h_flex().id("cp-add").h(24).px(8).flex_none().items_center().rounded(6).cursor_pointer().text_size(11.5).text_color(t.muted)
          .border_1().border_dashed().border_color(t.input).hover((st) => st.text_color(t.foreground).border_color(t.accent))
          .on_mouse_down("left", stop).on_click((_e, cx) => this.addLabel(cx)).child("+ Label item"),
      ]);
    const rows = card.rows.map((r, ri) => {
      const rowOn = !!sel && sel.row === ri && sel.i == null, chips = [];
      r.items.forEach((it, i) => {
        if (at && at.row === ri && at.i === i) chips.push(caret());
        chips.push(chip(`ci-${ri}-${i}`, this.itemName(it, defs), { label: it.kind === "label", grow: it.grow, on: !!sel && sel.row === ri && sel.i === i,
          faded: !!drag && !!drag.from && drag.from.row === ri && drag.from.i === i })
          .on_mouse_down("left", (e, cx) => this.beginDrag({ item: it, from: { row: ri, i } }, cx, e))
          .on_mouse_move((e, cx) => {
            if (!this.drag) return;
            this.chipAt = e.position;
            const after = !!e.local_position && !!e.bounds && e.local_position.x > e.bounds.width / 2;
            this.setDrop({ row: ri, i: after ? i + 1 : i }, cx);
          }));
      });
      if (at && at.row === ri && at.i === r.items.length) chips.push(caret());
      const summary = [r.wrap ? "wrap" : "no wrap", r.justify && r.justify !== "start" ? r.justify : null, r.indent && ri > 0 ? "under the name" : null].filter(Boolean).join(" · ");
      return v_flex().gap(4)
        .child(h_flex().id(`crh-${ri}`).gap(6).items_center().cursor_pointer().on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.cardSel = { row: ri }; cx.notify(); })
          .child(div().text_size(10.5).font_semibold().text_color(rowOn ? t.accent : t.dim).child(`ROW ${ri + 1}`))
          .child(div().text_size(10.5).text_color(t.dim).child(summary)))
        .child(h_flex().id(`cr-${ri}`).min_h(36).p(5).gap(4).flex_wrap().items_center().rounded(8).bg(t.canvas)
          .border_1().border_dashed().border_color(at && at.row === ri ? t.accent : rowOn ? t.accent + "99" : t.input)
          .on_mouse_move((e, cx) => {
            // A chip under the pointer already said where; the row takes the rest: the end.
            if (!this.drag || (this.chipAt && e.position && this.chipAt.x === e.position.x && this.chipAt.y === e.position.y)) return;
            this.setDrop({ row: ri, i: r.items.length }, cx);
          })
          .children(chips.length ? chips : [div().px(4).text_size(11.5).text_color(t.dim).child("Drop items here")]));
    });
    return v_flex().gap(10)
      .child(h_flex().gap(8).items_center()
        .child(div().text_size(10.5).font_semibold().text_color(t.dim).child("ITEMS"))
        .child(div().text_size(11).text_color(t.dim).child(drag && drag.from ? "Drop here to take it off the card" : "Drag one onto a row below")))
      .child(palette)
      // The rows inside a frame shaped like one agent card, named like a fieldset.
      .child(v_flex().relative().mt(14).px(10).pt(16).pb(10).gap(8).rounded(Math.max(8, (a.radius || 0) + 4)).border_1().border_color(t.input).bg(t.raised)
        .child(div().absolute().top(-8).left(10).px(6).bg(t.popover).text_size(10.5).font_semibold().text_color(t.muted).child("ONE AGENT CARD"))
        .children(rows)
        .child(h_flex().gap(8).child(this.button("cr-add", "+ Row", t, (_e, cx) => {
          this.cardSel = { row: card.rows.length };
          this.editCard((c) => c.rows.push({ items: [], indent: true }), cx);
        }))));
  }

  // The Agents tab's right column: the color being picked, then what's selected on the card.
  // It scrolls on its own, so a click anywhere in the settings shows its result here at once.
  agentsSide(t, pinned) {
    const a = this.agentsShown();
    return v_flex().w(300).flex_none().h_full().min_h(0).border_l_1().border_color(t.border)
      .when(!!pinned, (el) => el.child(pinned))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("insp").size_full().overflow_y_scroll().px(14).pt(14).pb(20).gap(10)
          .child(div().text_size(10.5).font_semibold().text_color(t.dim).child("SELECTED"))
          .child(this.cardInspector(t, a, this.cardOf(a))))
        .child(Scrollbar.vertical("insp").absolute().inset_0()));
  }

  cardInspector(t, a, card) {
    const sel = this.cardSel, defs = a.labels || [];
    const hint = (s) => div().text_size(12).text_color(t.dim).line_height("17px").child(s);
    const head = (title, onRemove, label = "Remove") => h_flex().h(28).items_center().gap(8)
      .child(div().flex_1().text_size(12.5).font_semibold().child(title))
      .child(this.button("ci-remove", label, t, onRemove));
    const sw = (id, label, on, onClick) => this.row(t, label, this.toggle(id, on, t, onClick));
    if (!sel) return hint("Click an item on a row, or a row's name, to change it.");
    if (sel.label) {
      const def = defs.find((l) => l.id === sel.label);
      return def ? v_flex().gap(2).child(head(`Label item: ${this.labelName(def)}`, (_e, cx) => this.removeLabel(def.id, cx), "Delete")).child(this.labelEditor(t, def)) : hint("That label item is gone.");
    }
    const r = card.rows[sel.row];
    if (!r) return hint("Click an item on a row, or a row's name, to change it.");
    if (sel.i == null) {
      return v_flex().gap(2)
        .child(head(`Row ${sel.row + 1}`, (_e, cx) => { const n = sel.row; this.cardSel = null; this.editCard((c) => c.rows.splice(n, 1), cx); }))
        .child(sw("cr-wrap", "Wrap", !!r.wrap, (_e, cx) => this.editRow({ wrap: !r.wrap }, cx)))
        .child(this.stacked(t, "Justify", this.seg("cr-j", [["start", "Start"], ["center", "Center"], ["end", "End"], ["between", "Between"]], r.justify || "start", t, (v, cx) => this.editRow({ justify: v }, cx), true)))
        .child(this.stacked(t, "Gap", this.seg("cr-g", [["auto", "Auto"], [3, "3"], [6, "6"], [9, "9"], [12, "12"]], r.gap == null ? "auto" : r.gap, t, (v, cx) => this.editRow({ gap: v === "auto" ? null : Number(v) }, cx), true)))
        .when(sel.row > 0, (el) => el.child(sw("cr-indent", "Under the name", !!r.indent, (_e, cx) => this.editRow({ indent: !r.indent }, cx))));
    }
    const it = r.items[sel.i];
    if (!it) return hint("Click an item on a row, or a row's name, to change it.");
    const def = it.kind === "label" ? defs.find((l) => l.id === it.id) : null;
    // Its own size, color and weight: every item that draws text, and the icon's size.
    const lookOf = this.itemLook(it, sel, a), hasLook = it.kind === "icon" || it.kind === "time" || isTextItem(it);
    const sizeKey = `${sel.row}.${sel.i}|${it.size || ""}|${lookOf.size}`;
    if (hasLook && this.sizeFor !== sizeKey) { this.sizeFor = sizeKey; this.itemSize.set_value(String(it.size || lookOf.size)); }
    const target = `item:${sel.row}.${sel.i}`;
    const look = v_flex().gap(2)
      .child(this.row(t, it.kind === "icon" ? "Size" : "Text size", h_flex().gap(8).items_center()
        .child(div().flex_none().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(NumberInput.new(this.itemSize).w(96).h(28).rounded(7).overflow_hidden().border_1().border_color(t.input).bg(t.background)
          .text_color(t.foreground).text_size(12).decrement_button(this.stepButton(t, "−")).increment_button(this.stepButton(t, "+"))))
        .when(!!it.size, (el) => el.child(this.link("ci-size-reset", "Reset", t, (_e, cx) => this.editItem({ size: undefined }, cx))))))
      .when(it.kind !== "icon", (el) => el
        .child(this.row(t, "Color", h_flex().gap(8).items_center()
          .child(this.chip(t, "ci-color", it.color ? "Its own" : "From its role", lookOf.color, this.pickTarget === target, (_e, cx) => this.selectTarget(target, cx)))
          .when(!!it.color, (el) => el.child(this.link("ci-color-reset", "Reset", t, (_e, cx) => { this.editItem({ color: undefined }, cx); })))))
        // Unset shows its role's weight; Reset goes back to following it.
        .child(this.stacked(t, it.weight ? "Weight · its own" : "Weight · from its role",
          this.seg("ci-weight", [["normal", "Regular"], ["medium", "Medium"], ["semibold", "Semibold"], ["bold", "Bold"]], it.weight || lookOf.weight || "normal", t, (v, cx) => this.editItem({ weight: v }, cx), true),
          it.weight ? this.link("ci-weight-reset", "Reset", t, (_e, cx) => this.editItem({ weight: undefined }, cx)) : null))
        .when(this.weightsMissing(), (el) => el.child(div().text_size(11.5).text_color(t.dim).line_height("16px")
          .child("Herdr's own copy of Geist draws every weight the same. To see these, put the Geist family (free from vercel.com/font) in ~/.config/herdr-app/fonts, or pick another UI font on the Type tab."))));
    return v_flex().gap(2)
      .child(head(this.itemName(it, defs), (_e, cx) => { const { row, i } = sel; this.cardSel = null; this.editCard((c) => c.rows[row].items.splice(i, 1), cx); }))
      .when(it.kind === "status", (el) => el.child(sw("ci-badge", "\"Needs you\" badge", it.badge !== false, (_e, cx) => this.editItem({ badge: it.badge === false }, cx))))
      .when(hasLook, (el) => el.child(look))
      .when(isTextItem(it), (el) => el
        .child(sw("ci-grow", "Grow", !!it.grow, (_e, cx) => this.editItem({ grow: !it.grow }, cx)))
        .child(sw("ci-trunc", "Truncate", it.truncate !== false, (_e, cx) => this.editItem({ truncate: it.truncate === false }, cx)))
        .child(this.stacked(t, "Max width", this.seg("ci-max", [[0, "None"], [80, "80"], [120, "120"], [160, "160"]], it.max || 0, t, (v, cx) => this.editItem({ max: Number(v) }, cx), true)))
        .when(!(def && def.style === "pill"), (el) => el.child(this.stacked(t, "Style", this.seg("ci-role", [["auto", "Auto"], ["name", "Name"], ["detail", "Detail"], ["accent", "Accent"]], it.role || "auto", t, (v, cx) => this.editItem({ role: v }, cx), true)))))
      .when(!!def, (el) => el.child(div().h(1).my(6).bg(t.border)).child(this.labelEditor(t, def)));
  }

  // A label item's look, shared by every place it's on the card.
  labelEditor(t, def) {
    if (this.labelFor !== def.id) {
      this.labelFor = def.id;
      for (const k of ["key", "prefix", "text"]) this.labelIn[k].set_value(def[k] || "");
    }
    const input = (k) => div().flex_1().min_w(0).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(this.labelIn[k]).w_full().h(28).px(8).rounded(7).border_1().border_color(t.input).bg(t.background).text_color(t.foreground).text_size(12));
    const seg = (id, opts, key) => this.seg(id, opts, def[key], t, (v, cx) => this.editLabel(def.id, { [key]: v }, cx), true);
    return v_flex().gap(2)
      .child(this.stacked(t, "Label key", input("key")))
      .child(this.stacked(t, "Shows as", seg("cl-style", [["text", "Text"], ["pill", "Pill"]], "style")))
      .child(this.stacked(t, "Prefix", input("prefix")))
      .when(def.style === "pill", (el) => el.child(this.stacked(t, "Color", seg("cl-color", [["accent", "Accent"], ["working", "Working"], ["blocked", "Blocked"], ["dim", "Dim"]], "color"))))
      .child(this.stacked(t, "If missing", seg("cl-missing", [["hide", "Hide"], ["text", "Show text"]], "missing")))
      .when(def.missing === "text", (el) => el.child(this.stacked(t, "Text", input("text"))));
  }

  // A label and a number box with − and +, for the agents list's sizes.
  stepButton(t, sign) {
    return h_flex().w(24).h_full().flex_none().items_center().justify_center().cursor_pointer()
      .text_size(14).text_color(t.muted).hover((st) => st.bg(t.hover).text_color(t.foreground)).child(sign);
  }
  numBox(t, k, label) {
    const step = (sign) => this.stepButton(t, sign);
    return h_flex().w(184).flex_none().h(32).gap(8).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.muted).child(label))
      .child(div().flex_none().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(NumberInput.new(this.agentNums[k]).w(96).h(28).rounded(7).overflow_hidden().border_1().border_color(t.input).bg(t.background)
          .text_color(t.foreground).text_size(12).decrement_button(step("−")).increment_button(step("+"))));
  }

  // An inspector row whose control needs the width: the label above it.
  stacked(t, label, control, extra = null) {
    return v_flex().gap(5).py(4)
      .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).text_size(12).text_color(t.muted).child(label)).when(!!extra, (el) => el.child(extra)))
      .child(h_flex().w_full().min_w(0).child(control));
  }

  // Values for the preview's label items: one a terminal has now, else the key in brackets.
  sampleLabels(defs) {
    let live = [];
    try { live = terminals().map((x) => x.labels || {}); } catch {}
    return Object.fromEntries(defs.filter((l) => l.key).map((l) => [l.key, (live.find((x) => x[l.key]) || {})[l.key] || `<${l.key}>`]));
  }

  // --- parts -----------------------------------------------------------------
  // A section: its title, an ⓘ whose tooltip holds the explanation, the controls, and at most one
  // short line under them for what you'd otherwise miss. `fold` makes it open and close.
  section(label, t, content, tip, o = {}) {
    const closed = !!o.fold && !this.open[o.fold];
    return v_flex().gap(10)
      .child(h_flex().id(`sec-${label}`).h(16).gap(6).items_center()
        .when(!!o.fold, (el) => el.cursor_pointer().on_click((_e, cx) => { this.open[o.fold] = closed; cx.notify(); })
          .child(div().w(10).text_size(10).text_color(t.dim).child(closed ? "▸" : "▾")))
        .child(div().text_size(10.5).font_semibold().text_color(t.dim).child(label.toUpperCase()))
        .when(closed && !!o.count, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(`· ${o.count}`)))
        .when(!!tip, (el) => el.child(div().id(`tip-${label}`).size(16).flex().items_center().justify_center().tooltip(tip)
          .child(svg(`${ICONS}/info.svg`).size(13).text_color(t.dim)))))
      .when(!closed, (el) => el.child(content))
      .when(!closed && !!o.hint, (el) => el.child(typeof o.hint === "string" ? div().text_size(11.5).text_color(t.dim).line_height("16px").child(o.hint) : o.hint));
  }

  // An inspector row: label, control, and the value when there is one.
  row(t, label, control, value) {
    return h_flex().min_h(32).gap(10).items_center()
      .child(div().w(112).flex_none().truncate().text_size(12.5).text_color(t.muted).child(label))
      .child(h_flex().flex_1().min_w(0).items_center().child(control))
      .when(value != null, (el) => el.child(div().w(44).flex_none().text_right().text_size(11.5).text_color(t.muted).child(value)));
  }

  slider(t, state, id, label, value) {
    return this.row(t, label, div().flex_1().min_w(0).child(Slider.new(state).child(SliderTrack.new(state).flex().items_center().h(20).w_full().cursor_pointer()
      .child(SliderIndicator.new(state).relative().w_full().h(4).rounded(2).bg(t.input)
        .range_style((f) => f.rounded(2).bg(t.accent))
        // A 14px dot; the shell places its top-left at the groove's top, so it's pulled back by half its size less the 4px groove.
        .child(SliderThumb.new(state).id(`thumb-${id}`).size(14).rounded(7).bg(t.foreground).border_2().border_color(t.accent).ml(-7).mt(-5))))), value);
  }

  // One of several: a joined control. `fill` stretches it across the row.
  seg(id, opts, value, t, onPick, fill = false) {
    return h_flex().p(2).gap(2).rounded(9).border_1().border_color(t.border).bg(t.canvas).min_w(0).when(fill, (el) => el.flex_1())
      .children(opts.map(([v, label]) => {
        const on = String(v) === String(value);
        return div().id(`${id}-${v}`).h(24).px(10).rounded(7).flex().items_center().justify_center().cursor_pointer().when(fill, (el) => el.flex_1())
          .border_1().border_color(on ? t.input : "#00000000").when(on, (el) => el.bg(t.raised).shadow_sm())
          .text_size(12).font_medium().text_color(on ? t.foreground : t.muted).hover((st) => st.text_color(t.foreground))
          .on_click((_e, cx) => onPick(v, cx))
          .child(label);
      }));
  }

  toggle(id, on, t, onClick) {
    return h_flex().id(id).w(30).h(18).flex_none().px(2).rounded(9).items_center().cursor_pointer().bg(on ? t.accent : t.input).when(on, (el) => el.justify_end())
      .on_click(onClick)
      .child(div().size(14).rounded(7).bg(on ? "#ffffff" : t.foreground));
  }

  // A pill with a color dot, for picking which color the picker edits; no hex, no dot.
  chip(t, id, label, hex, on, onClick) {
    return h_flex().id(id).gap(7).pl(hex ? 6 : 10).pr(10).h(28).items_center().rounded(8).cursor_pointer().text_size(12)
      .border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.raised).hover((st) => st.border_color(on ? t.accent : t.input))
      .on_click(onClick)
      .when(!!hex, (el) => el.child(div().size(16).rounded(5).bg(hex).border_1().border_color(t.input)))
      .child(div().child(label));
  }

  link(id, label, t, onClick) {
    return div().id(id).text_size(11.5).text_color(t.accent).cursor_pointer().hover((st) => st.opacity(0.8)).on_click(onClick).child(label);
  }

  iconButton(id, icon, tip, t, onClick, on = false, off = false) {
    return div().id(id).size(30).flex_none().rounded(8).flex().items_center().justify_center()
      .when(off, (el) => el.opacity(0.35)).when(!off, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)))
      .when(on, (el) => el.bg(t.hover))
      .tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .child(svg(`${ICONS}/${icon}.svg`).size(16).text_color(t.muted));
  }

  // `primary` true is the accent button; "ghost" has no border.
  button(id, label, t, onClick, primary = false) {
    return div().id(id).h(30).px(12).flex().items_center().rounded(8).cursor_pointer().text_size(12.5).font_medium()
      .when(primary === true, (el) => el.bg(t.accent).text_color(t.accent_foreground))
      .when(primary === "ghost", (el) => el.text_color(t.muted).hover((st) => st.bg(t.hover).text_color(t.foreground)))
      .when(!primary, (el) => el.border_1().border_color(t.input).bg(t.raised).text_color(t.foreground).hover((st) => st.bg(t.hover)))
      .when(primary === true, (el) => el.hover((st) => st.opacity(0.88)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick).child(label);
  }
}
