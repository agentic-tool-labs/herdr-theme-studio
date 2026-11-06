// Theme Studio: one window for Herdr's whole look. Themes, every color token, fonts,
// glass (terminal opacity, backgrounds, frosted wallpaper, translucent chrome) and pane frames.
// It edits the files Herdr already redraws from: themes/*.json, settings.json, and the shown
// layout (through layout.set). Opened with ctrl-shift-y (mod.open theme-studio).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, Popup, InputState, Input, TextareaState, Textarea, SliderState, Slider, SliderTrack, SliderIndicator, SliderThumb } from "gpui-base";
import { theme, themes, settings, fonts, layout, layouts, nextCommand, shared, setShared, run, exec, appHome, home, props, closeOverlay, readTextFile, writeTextFile } from "herdr";
import * as fs from "fs/promises";
import { cursorCode, patchAgents, withAgentsMod, AGENTS_MOD, AGENTS_DEFAULT, liftContrast, breakLigatures, patchHeader, ROUNDED_HEADER, patchFooter, FOOTER_MOD, withFooterIcon, hasFooterIcon, contrast, normHex, mergeSettings, themeFileFrom, setToken, isOverride, parseTheme, slug, applyGlass, readGlass, GLASS_DEFAULT, GLASS_EXTRA, bloomSpec, hexToHsla, hslaToHex, withAlpha, sortFonts, isMono } from "./lib.js";

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
// The agents list: density presets (Comfortable is Herdr's own) and the sliders' ranges.
const AGENT_PRESETS = {
  Comfortable: { row: 30, text: 13, icon: 16, header: 30 },
  Compact: { row: 24, text: 12, icon: 14, header: 24 },
  Dense: { row: 20, text: 11.5, icon: 12, header: 20 },
};
const AGENT_SLIDERS = { row: [18, 34, 1], text: [10.5, 14, 0.5], icon: [10, 18, 1], header: [16, 34, 1] };

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
const GLASS_COLORS = ["from", "to", "bloomBase", "glowA", "glowB", "glowC", "behind"];
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
    this.tab = TABS.some(([id]) => id === shared(K.tab)) ? shared(K.tab) : "colors";
    // "themes" (the manager), "import", or "edit" (this.editing in the tabs). An editor survives a reopen.
    this.editing = ownedThemes().includes(shared(K.editing)) ? shared(K.editing) : null;
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

    this.hex = InputState.new({ placeholder: "#rrggbb or #rrggbbaa" });
    this.hex.on("submit", (_e, cx) => this.stageHex(this.hex.value(), cx));
    this.fontIn = InputState.new({ placeholder: "Filter fonts…" });
    this.fontIn.on("change", (_e, cx) => { this.fontQuery = this.fontIn.value(); cx.notify(); });
    this.importText = TextareaState.new({ placeholder: "Paste or drop an iTerm2, Ghostty, kitty, Alacritty or Herdr theme", rows: 7 });
    this.importName = InputState.new({ placeholder: "Theme name" });
    this.imagePath = InputState.new({ placeholder: "backgrounds/my-picture.jpg (in ~/.config/herdr-app)" });
    this.imagePath.on("submit", (_e, cx) => this.useImage(this.imagePath.value().trim(), cx));
    this.copyName = InputState.new({ placeholder: "Name for the copy" });
    this.copyName.on("submit", (_e, cx) => this.copyTheme(this.ask && this.ask.from, this.copyName.value(), cx, this.ask && this.ask.edit));

    this.glass = { ...GLASS_DEFAULT }; // what the layout has
    this.glassDraft = {}; // Glass tab changes not yet applied
    this.agentsDraft = {}; // Agents tab changes not yet applied
    this.agentSliders = {};
    for (const [k, [min, max, step]] of Object.entries(AGENT_SLIDERS)) {
      const s = SliderState.new({ min, max, step, value: this.agentsNow()[k] });
      s.on("change", (v, cx) => this.stageAgents({ [k]: v }, cx));
      this.agentSliders[k] = s;
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
  // view=themes|import · select=<name> · edit=<name> · copy=<from>:<new> · delete-theme=<name> · export=<name> · save · discard
  command(c, cx) {
    const i = c.indexOf("=");
    const verb = i < 0 ? c : c.slice(0, i), arg = i < 0 ? "" : c.slice(i + 1);
    const num = Number(arg);
    if (verb === "tab" && TABS.some(([id]) => id === arg)) { this.tab = arg; setShared(K.tab, arg); }
    else if (verb === "back" || (verb === "view" && arg === "themes" && this.view === "edit")) this.back(cx);
    else if (verb === "view" && ["themes", "import"].includes(arg)) this.goTo(arg, cx);
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
    else if (verb.startsWith("agents-") && verb.slice(7) in AGENTS_DEFAULT) { const k = verb.slice(7); this.stageAgents({ [k]: typeof AGENTS_DEFAULT[k] === "boolean" ? arg !== "off" : Number(arg) }, cx); }
    else if (verb === "image") arg ? this.useImage(arg, cx) : this.chooseImage(cx);
    else if (verb === "button") this.setButton(arg !== "off", cx);
    else if (verb !== "focus") this.say(`Unknown command ${c}`, "error", cx);
  }

  // --- status line -----------------------------------------------------------
  say(text, level = "info", cx) { this.msg = { text, level }; cx && cx.notify(); }
  async guard(cx, label, work) {
    if (this.busy) return this.say("Still finishing the last change; try again in a moment", "info", cx);
    this.busy = true;
    this.say(label + "…", "info", cx);
    try { await work(); }
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
  async editableTheme(cx) {
    const name = settings().theme;
    if (ownedThemes().includes(name) && (await readTextFile(themePath(name)))) return name;
    const fork = `${slug(name)}-custom`;
    if (!(await readTextFile(themePath(fork)))) {
      const src = themes().find((t) => t.name === name);
      if (!src) throw new Error(`can't find theme ${name}`);
      const own = await this.readThemeFile(name).catch(() => null); // a user theme file keeps its own overrides
      await this.writeThemeFile(fork, own && own.ansi ? own : themeFileFrom(src.colors));
    } else if (!ownedThemes().includes(fork)) setShared(K.owned, [...ownedThemes(), fork]);
    await this.useTheme(cx, fork);
    return fork;
  }

  // Writes staged tokens (hex, or null to reset) into the theme being edited, in one write.
  async writeColors(cx, draft) {
    const name = this.view === "edit" && this.editing ? this.editing : await this.editableTheme(cx);
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

  // With a theme staged: its own saved glass, or else the glass colors set to a fixed hex go back to
  // their theme-following defaults.
  themeReset() {
    if (!this.themeDraft) return {};
    const ex = extrasOf(this.themeDraft.name);
    if (ex && ex.glass && this.personal()) return { ...GLASS_DEFAULT, ...ex.glass, bloom: "", frost: this.glass.frost }; // bloom re-renders
    return Object.fromEntries(GLASS_COLORS.filter((k) => String(this.glass[k] || "").startsWith("#")).map((k) => [k, GLASS_DEFAULT[k]]));
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
    const ex = this.themeDraft && extrasOf(this.themeDraft.name);
    return { ...this.agentsNow(), ...((ex && ex.agents) || {}), ...this.agentsDraft };
  }
  stageAgents(patch, cx) {
    const now = this.agentsNow();
    for (const [k, v] of Object.entries(patch)) if (now[k] === v) delete this.agentsDraft[k]; else this.agentsDraft[k] = v;
    const a = this.agentsShown();
    for (const [k, sl] of Object.entries(this.agentSliders)) if (sl.value() !== a[k]) sl.set_value(a[k]);
    cx.notify();
  }

  cursorShown() { return { shape: "block", blink: false, ...(shared(K.cursor) || {}), ...this.cursorDraft }; }

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
    return kind === "tok" ? normHex(this.themeColors()[key] || "") || "#000000" : this.glassHex(key);
  }

  // From the picker (fromPicker: its sliders already match) or the hex box.
  stageTarget(hex, cx, fromPicker = false) {
    const id = this.pickTarget;
    if (!id) return;
    const [kind, key] = id.split(":");
    if (fromPicker) { this.pickFor = `${id}|${hex}`; this.hex.set_value(hex); }
    if (kind === "tok") this.stageColor(key, hex, cx); else this.stageGlass({ [key]: hex }, cx);
  }

  stageHex(value, cx) {
    const [kind] = (this.pickTarget || "").split(":");
    if (kind === "glass" && value.trim() === "") return this.stageTarget("", cx); // back to the default
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
    const th = this.themeDraft, ex = th && extrasOf(th.name), colors = this.colorDraft;
    // A theme with saved type and cursor brings them too; anything staged on top wins.
    const type = { ...((ex && ex.type) || {}), ...this.draft };
    const cursor = { ...(ex && ex.cursor ? { ...this.cursorShown(), ...ex.cursor } : {}), ...this.cursorDraft };
    const glass = { ...this.themeReset(), ...this.glassDraft };
    const agents = { ...((ex && ex.agents) || {}), ...this.agentsDraft };
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
      if (after) await after();
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
    if (Object.keys(AGENTS_DEFAULT).some((k) => a[k] !== AGENTS_DEFAULT[k])) await this.ensureAgentsClone(cx);
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
    if (want !== now) await writeTextFile(`${dir}/main.js`, want, now);
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
    cx.timer.after(250, (cx) => {
      if (gen !== this.bloomGen || this.glassShown().bg !== "bloom") return;
      cx.spawn(async (cx) => {
        const rel = await this.renderBloom(this.glassShown()).catch((e) => { this.say(String(e.message || e), "error", cx); return null; });
        if (rel && gen === this.bloomGen) { this.glassDraft.bloom = rel; cx.notify(); }
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

  goTo(view, cx) {
    this.view = view; this.ask = null; this.leaving = false;
    if (view !== "edit") { this.editing = null; setShared(K.editing, null); }
    if (view === "import") cx.spawn((cx) => this.scanThemeFiles(cx));
    cx.notify();
  }

  // Opens a theme in the editor. It becomes the theme in use first, so the window shows every edit.
  editTheme(name, cx) {
    if (!this.isOwn(name)) return this.say(`${name} isn't yours to change: copy it first`, "error", cx);
    const open = async () => {
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
    const name = this.editing;
    if (!name) return;
    this.applyAll(cx, async () => {
      const s = this.shown();
      setExtras(name, {
        type: { font: s.font_family, font_size: s.font_size, ui_font: s.ui_font_family, font_ligatures: s.font_ligatures, minimum_contrast: s.minimum_contrast },
        // Rendered pictures are dropped as newer ones replace them, so the theme keeps the recipe and re-renders.
        glass: this.personal() ? { ...this.glass, bloom: "", frost: "" } : null,
        cursor: this.cursorShown(),
        agents: this.agentsNow(),
      });
      this.leaving = false;
      this.say(`Saved ${name}`, "success", cx);
      if (then) then();
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
  // Two levels: the theme manager (and its import view), and the editor for one theme with its tabs.
  render(cx) {
    if (this.part === "button") return div();
    const t = theme();
    const s = this.shown();
    const overlay = props() && props().overlay;
    const view = this.view === "edit"
      ? { themes: null, colors: () => this.colorsTab(t, s, cx), type: () => this.typeTab(t, s, cx), glass: () => this.glassTab(t, s, cx), agents: () => this.agentsTab(t, s, cx) }[this.tab]()
      : this.view === "import" ? this.importView(t, s, cx) : this.managerView(t, s, cx);
    // A view may pin a head (preview and its bar) above the part that scrolls.
    const head = view.head, body = view.head ? view.body : view;
    const m = this.msg;
    const msgColor = !m ? t.dim : m.level === "error" ? t.blocked : m.level === "success" ? t.done : t.muted;
    const title = this.view === "edit" ? `Editing ${this.editing}` : this.view === "import" ? "Import a theme" : "Theme Studio";
    const sub = this.view === "edit"
      ? `Changes show in the window; Save keeps them in ${this.editing}.`
      : `In use: dark ${s.theme_dark} · light ${s.theme_light} · ${s.dark ? "dark" : "light"} mode now`;
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    return v_flex().id("root").size_full().bg(t.popover).text_color(t.foreground).text_size(13)
      .child(stop(h_flex().px(14).pt(12).pb(8).gap(8).items_center())
        .when(this.view !== "themes", (el) => el.child(this.button("back", "← Themes", t, (_e, cx) => this.back(cx))))
        .child(v_flex().flex_1().min_w(0).child(div().text_size(14).font_semibold().truncate().child(title))
          .child(div().text_size(11.5).text_color(t.muted).truncate().child(sub)))
        .when(this.view === "themes", (el) => el.child(this.button("import-view", "Import", t, (_e, cx) => this.goTo("import", cx))))
        .when(!!overlay, (el) => el.child(this.button("close", "Close", t, () => closeOverlay(overlay)))))
      .when(this.view === "edit", (el) => el.child(stop(h_flex().px(10).pb(8).gap(2))
        .children(TABS.map(([id, label]) => this.pill(`tab-${id}`, label, this.tab === id, t, (_e, cx) => { this.tab = id; setShared(K.tab, id); if (id === "colors") cx.spawn((cx) => this.checkCursorHook(cx)); cx.notify(); })))))
      .child(div().border_b_1().border_color(t.border))
      .when(!!head, (el) => el.child(stop(v_flex().px(14).pt(12).pb(10).border_b_1().border_color(t.border)).child(head)))
      .child(stop(v_flex().id("body").flex_1().min_h(0).overflow_y_scrollbar().p(14).gap(16)).child(body))
      .child(stop(h_flex().px(14).py(8).gap(10).items_center().justify_between().border_t_1().border_color(t.border))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(msgColor).child(m ? m.text : this.view === "edit" ? "Changes wait for Save." : "Pick a theme to preview it."))
        .when(!!shared(K.backup), (el) => el.child(this.button("revert", "Revert", t, (_e, cx) => this.revert(cx)))));
  }

  // Back from the editor asks first when there's something unsaved.
  back(cx) {
    if (this.view === "edit" && this.changeCount() > 0) { this.leaving = true; return cx.notify(); }
    this.cancelAll(cx);
    this.goTo("themes", cx);
  }

  changeCount() { const c = this.changes(); return c.type + c.colors + c.glass + c.agents; }

  // --- the theme manager -------------------------------------------------------
  managerView(t, s, cx) {
    // A theme named like a layout belongs to that layout (Herdr offers it only there).
    const all = themes().filter((th) => th.name === shared("layout") || !layouts().includes(th.name));
    const sel = this.selected();
    const card = (id, name, c, onClick) => {
      const on = sel === name, used = this.inUse(name);
      return v_flex().id(id).w(132).rounded(8).overflow_hidden().cursor_pointer()
        .border_1().border_color(on ? t.accent : t.border).when(on, (el) => el.shadow_sm())
        .hover((st) => st.border_color(on ? t.accent : t.input))
        .on_click(onClick)
        .child(h_flex().h(40).p(6).gap(2).items_end().bg(c.background)
          .children([1, 2, 3, 4, 5, 6].map((i) => div().flex_1().h(8 + ((i * 7) % 20)).rounded(2).bg(c.ansi[i]))))
        .child(h_flex().px(8).py(5).gap(4).justify_between().bg(t.raised)
          .child(div().text_size(11.5).truncate().child(name))
          .child(div().flex_none().text_size(10.5).text_color(used ? t.done : t.dim).child(used ? "● in use" : c.light ? "light" : "dark")));
    };
    const asCard = (th) => ({ background: th.colors.background, ansi: Array.from({ length: 16 }, (_, i) => th.colors["ansi" + i]), light: th.light });
    const pick = (name) => (_e, cx) => { this.ask = null; this.stageTheme(name, cx); };
    const mine = all.filter((th) => this.isOwn(th.name)), others = all.filter((th) => !this.isOwn(th.name));
    const presets = this.presets.filter((p) => !all.some((th) => th.name === p.name)).map((p) => {
      const light = contrast("#000000", p.file.background) > contrast("#ffffff", p.file.background);
      return card(`pre-${p.name}`, p.name, { background: p.file.background, ansi: p.file.ansi, light }, pick(p.name));
    });
    const grid = (cards) => h_flex().flex_wrap().gap(8).children(cards);
    const body = v_flex().gap(16)
      .child(this.section("Your themes", t, mine.length ? grid(mine.map((th) => card(`th-${th.name}`, th.name, asCard(th), pick(th.name))))
        : div().text_color(t.dim).child("None yet. Copy one below to make it yours."),
        "Yours to edit and delete. A theme holds its colors and, once saved in the editor, its type, glass and cursor too."))
      .child(this.section("Herdr's and others", t, grid(others.map((th) => card(`th-${th.name}`, th.name, asCard(th), pick(th.name)))),
        "Copy one to change it, so the original stays as it was."))
      .when(presets.length > 0, (el) => el.child(this.section("Presets", t, grid(presets),
        "Bundled with the Studio. Applying one adds it to themes/, so Herdr's Settings lists it too.")))
      .child(this.section("Palette icon beside Settings", t, this.personal()
        ? h_flex().child(this.button("sidebar-btn", hasFooterIcon(layout()) ? "Remove the icon" : "Add the icon", t, (_e, cx) => this.setButton(!hasFooterIcon(layout()), cx), !hasFooterIcon(layout())))
        : h_flex().child(this.button("sidebar-copy", `Make my copy of ${shared("layout")} and add it`, t, (_e, cx) => this.makeCopy(cx, "colors"), true)),
        this.personal()
          ? "Herdr's Settings screen can't take extra sections, so the icon sits in the Settings row of the sidebar, or under Settings on the narrow rail."
          : "Herdr's own layouts can't change, so the icon needs your own copy of this one. Herdr keeps updating everything else."))
      .child(h_flex().child(this.button("reveal", "Show themes folder", t, (_e, cx) => cx.spawn(async () => { await exec("open", [`${HOME}/themes`]); }))));
    return { head: v_flex().gap(8).child(this.windowPreview(t)).child(this.managerBar(t, s)), body };
  }

  // The selected theme's actions under the preview, or the copy or delete step in their place.
  managerBar(t, s) {
    const name = this.selected(), own = this.isOwn(name), staged = !!this.themeDraft;
    const field = (state) => Input.new(state).flex_1().h(30).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_color(t.foreground);
    if (this.ask && this.ask.kind === "copy") return h_flex().gap(6).items_center()
      .child(div().flex_none().text_size(12).text_color(t.muted).child(`Copy ${this.ask.from} as`))
      .child(field(this.copyName))
      .child(this.button("ask-cancel", "Cancel", t, (_e, cx) => { this.ask = null; cx.notify(); }))
      .child(this.button("copy-go", this.ask.edit ? "Copy and edit" : "Copy", t, (_e, cx) => this.copyTheme(this.ask.from, this.copyName.value(), cx, this.ask.edit), true));
    if (this.ask && this.ask.kind === "delete") return h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).text_size(12).child(`Delete ${name}? Its file in themes/ goes too.`))
      .child(this.button("ask-cancel", "Keep it", t, (_e, cx) => { this.ask = null; cx.notify(); }))
      .child(this.button("delete-go", "Delete", t, (_e, cx) => this.deleteTheme(name, cx), true));
    const copy = (edit) => (_e, cx) => { this.ask = { kind: "copy", from: name, edit }; this.copyName.set_value(`${slug(name)}-copy`); cx.notify(); };
    return h_flex().gap(6).items_center()
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(12.5).font_medium().truncate().child(name))
        .child(div().text_size(11).text_color(t.dim).truncate().child(staged ? "Previewing: Apply to use it" : this.inUse(name) ? "In use" : own ? "Yours" : "Herdr's: copy to edit")))
      .child(own ? this.button("edit", "Edit", t, (_e, cx) => this.editTheme(name, cx)) : this.button("copy-edit", "Copy to edit", t, copy(true)))
      .child(this.button("copy", "Copy", t, copy(false)))
      .child(this.button("export", "Copy JSON", t, (_e, cx) => this.exportTheme(name, cx)))
      .when(own && !this.inUse(name), (el) => el.child(this.button("delete", "Delete", t, (_e, cx) => { this.ask = { kind: "delete", name }; cx.notify(); })))
      .when(staged, (el) => el.child(this.button("apply-theme", "Apply", t, (_e, cx) => this.applyAll(cx), true)));
  }

  // --- import ---------------------------------------------------------------------
  importView(t, s, cx) {
    return v_flex().gap(16)
      .when(this.found.length > 0, (el) => el.child(this.section("Theme files on this Mac", t,
        h_flex().flex_wrap().gap(6).children(this.found.map((f) => this.pill(`found-${f.name}`, f.name, false, t, (_e, cx) => this.importFile(f.path, cx)))),
        "iTerm2 themes in Downloads and on the Desktop. Click one to import it. The first time, macOS asks whether Herdr may read those folders.")))
      .child(this.section("Paste or drop", t, v_flex().gap(6)
        .child(div().id("import-drop").on_drop((e, cx) => this.importFile(e.paths && e.paths[0], cx))
          .child(Textarea.new(this.importText).h(130).p(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_color(t.foreground).text_size(12)))
        .child(h_flex().gap(6)
          .child(Input.new(this.importName).flex_1().h(30).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
          .child(this.button("import-clip", "From clipboard", t, (_e, cx) => this.importTheme(cx, cx.read_from_clipboard() || "")))
          .child(this.button("import", "Import", t, (_e, cx) => this.importTheme(cx), true))),
        "iTerm2 (.itermcolors), Ghostty, kitty, Alacritty TOML, or Herdr JSON. A dropped file is named after itself. The theme joins Your themes; nothing changes until you apply it."));
  }

  colorsTab(t, s, cx) {
    const c = this.themeColors(), sel = this.pickTarget, g = this.glassShown();
    const editing = this.editing || (ownedThemes().includes(s.theme) ? s.theme : `${slug(s.theme)}-custom`);
    const swatch = (hex, size = 16) => div().size(size).rounded(4).bg(hex).border_1().border_color(t.input);
    const badge = (token) => {
      const p = PAIRS[token];
      if (!p || !c[token] || !c[p[0]]) return null;
      const r = contrast(c[token], c[p[0]]);
      const ok = r >= p[1];
      return div().px(6).rounded(9).text_size(10.5).bg(ok ? t.hover : t.selected).text_color(ok ? t.done : t.working).child(`${r.toFixed(1)}:1`);
    };
    const row = (token) => {
      const on = sel === `tok:${token}`, staged = token in this.colorDraft;
      return v_flex()
        .child(h_flex().id(`tok-${token}`).gap(8).px(6).py(3).rounded(6).items_center().cursor_pointer()
          .when(on, (el) => el.bg(t.selected)).hover((st) => st.bg(t.hover))
          .on_click((_e, cx) => this.selectTarget(`tok:${token}`, cx))
          .child(swatch(c[token] || "#00000000"))
          .child(div().flex_1().truncate().child(token))
          .when(!!badge(token), (el) => el.child(badge(token)))
          .child(div().w(76).text_size(11.5).text_color(staged ? t.accent : t.dim).child(staged ? (this.colorDraft[token] || "reset") : c[token] || "")))
        .when(on, (el) => el.child(this.colorEditor(t, token.startsWith("ansi") || ["background", "terminal_foreground", "selection", "cursor"].includes(token)
          ? "A terminal color: Reset doesn't apply; set it back by hand."
          : "Reset drops your override and lets Herdr derive it from the terminal colors again.",
          (cx) => this.stageColor(token, null, cx))));
    };
    const ansiTokens = GROUPS.find(([l]) => l === "Terminal ANSI")[1];
    const ansi = (token) => div().id(`tok-${token}`).flex_1().h(22).rounded(4).bg(c[token]).cursor_pointer()
      .border_2().border_color(sel === `tok:${token}` ? t.foreground : "#00000000")
      .on_click((_e, cx) => this.selectTarget(`tok:${token}`, cx));
    const ansiSel = sel && sel.startsWith("tok:ansi") ? sel.slice(4) : null;
    const behinds = [["", "Window background"], ["canvas", "Canvas"], ["chrome", "Chrome"], ["background", "Terminal"]];
    const custom = g.behind && !behinds.some(([v]) => v === g.behind);
    const behind = this.personal()
      ? v_flex().gap(6)
        .child(h_flex().flex_wrap().gap(6)
          .children(behinds.map(([v, label]) => this.pill(`behind-${v || "none"}`, label, g.behind === v, t, (_e, cx) => this.stageGlass({ behind: v }, cx))))
          .child(this.chip(t, "behind-custom", "Custom", this.glassHex("behind"), custom || sel === "glass:behind", (_e, cx) => this.selectTarget("glass:behind", cx))))
        .when(sel === "glass:behind", (el) => el.child(this.colorEditor(t, "A color you pick stays as it is when you change themes.")))
      : div().text_size(11.5).text_color(t.dim).child("Needs your own copy of this layout (Glass tab).");
    const cur = this.cursorShown();
    const cursor = v_flex().gap(8)
      .child(h_flex().flex_wrap().gap(6).items_center()
        .children([["block", "Block"], ["underline", "Underline"], ["bar", "Bar"]].map(([v, label]) => this.pill(`cur-${v}`, label, cur.shape === v, t, (_e, cx) => this.stageCursor({ shape: v }, cx))))
        .child(div().w(8))
        .child(this.checkbox("cur-blink", "Blink", cur.blink, t, (_e, cx) => this.stageCursor({ blink: !cur.blink }, cx)))
        .child(div().w(8))
        .child(this.chip(t, "cur-color", "Color", c.cursor || c.foreground, sel === "tok:cursor", (_e, cx) => this.selectTarget("tok:cursor", cx))))
      .when(sel === "tok:cursor", (el) => el.child(this.colorEditor(t, "Saves to the theme, like the colors below.")))
      .when(!this.cursorHooked, (el) => el.child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.dim).line_height("17px").child("Apply changes the shape in open panes. Herdr has no cursor-shape setting, so for new panes add this line to ~/.zshrc once (the Studio doesn't edit it):"))
        .child(this.button("cur-copy", "Copy line", t, (_e, cx) => { cx.write_to_clipboard(CURSOR_LINE); this.say("Copied. Paste it at the end of ~/.zshrc", "success", cx); }))));
    const body = v_flex().gap(14)
      .child(div().text_size(11.5).text_color(t.dim).child(`Theme colors save to themes/${editing}.json. Click a color to edit it.`))
      .child(this.section("Cursor", t, cursor, "The color saves to the theme. Shape and blink go to every Herdr pane: programs like vim may change them until the next prompt."))
      .children(GROUPS.map(([label, tokens]) => label === "Terminal ANSI"
        ? this.section(label, t, v_flex().gap(4).child(h_flex().gap(4).children(tokens.slice(0, 8).map(ansi))).child(h_flex().gap(4).children(tokens.slice(8).map(ansi)))
            .when(!!ansiSel && ansiTokens.includes(ansiSel), (el) => el.child(this.colorEditor(t, `${ansiSel}: a terminal color. Reset doesn't apply; set it back by hand.`))))
        : this.section(label, t, v_flex().children(tokens.map(row)))))
      .child(this.section("Behind panes", t, behind,
        "The gap between panes and the corners outside each pane's rounding. This one saves to your layout, not the theme. Window background paints nothing there, so the window's own background shows through. Canvas, Chrome and Terminal are the theme's colors above and follow the theme when it changes; a custom color stays as you set it."));
    return { head: v_flex().gap(8).child(this.windowPreview(t)).child(this.applyBar(t)), body };
  }

  // Type picks are staged: Herdr takes up to ~10 s to show some of them, so the sample shows them at
  // once and Apply writes them together.
  typeValues(s) {
    const now = { font: s.font_family, ui_font: s.ui_font_family, font_size: s.font_size, font_ligatures: !!s.font_ligatures, minimum_contrast: s.minimum_contrast ?? 1 };
    return { now, v: { ...now, ...this.draft } };
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
    return v_flex().gap(2).p(12).rounded(8).border_1().border_color(t.border).bg(bg).font_family(v.font).text_size(v.font_size).line_height(`${Math.round(v.font_size * 1.45)}px`)
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
    const trigger = h_flex().id(`font-trigger-${target}`).flex_1().min_w(0).h(32).px(10).gap(8).items_center().rounded(7).cursor_pointer()
      .border_1().border_color(open ? t.accent : t.input).bg(t.background)
      // A press on the trigger first closes an open menu as a press outside it: don't reopen.
      .on_click((_e, cx) => { this.fontOpen = !open && Date.now() - (this.fontClosedAt || 0) > 300 ? target : null; cx.notify(); })
      .child(div().flex_1().truncate().font_family(current).text_size(14).child(current))
      .child(div().text_size(11).text_color(t.dim).child(open ? "▴" : "▾"));
    return Popup.new(`font-popup-${target}`, trigger).anchor("top_left").flex_1().min_w(0)
      .when(open, (el) => el.content(v_flex().id("font-menu").w(420).p(6).gap(6).rounded(8)
        .border_1().border_color(t.border).bg(t.popover).shadow_lg()
        .on_mouse_down_out((_e, cx) => { this.fontOpen = null; this.fontClosedAt = Date.now(); cx.notify(); })
        .child(Input.new(this.fontIn).h(30).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(div().px(2).text_size(11).text_color(t.dim).child(target === "font" && !q ? "Monospaced fonts only. Type to search every font." : `${list.length} of ${fonts().length} fonts`))
        .child(v_flex().id("font-list").h(220).overflow_y_scrollbar().children(list.map(row)))));
  }

  // Size box with up/down steps, like a native stepper.
  stepper(t, value, min, max, onStep) {
    const arrow = (id, label, d) => div().id(id).h(15).w(18).flex().items_center().justify_center().text_size(9).text_color(t.muted)
      .rounded(3).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { const n = Math.min(max, Math.max(min, value + d)); if (n !== value) onStep(n, cx); })
      .child(label);
    return h_flex().h(32).pl(10).pr(3).gap(4).items_center().rounded(7).border_1().border_color(t.input).bg(t.background)
      .child(div().w(22).text_size(13.5).child(String(value)))
      .child(v_flex().child(arrow("size-up", "▲", 1)).child(arrow("size-down", "▼", -1)));
  }

  // A labelled slider with its value on the right.
  slider(t, state, id, label, value) {
    return v_flex().gap(4)
      .child(h_flex().justify_between().child(div().text_color(t.muted).child(label)).child(div().text_size(12).child(value)))
      .child(Slider.new(state).child(SliderTrack.new(state).flex().items_center().h(22).w_full().cursor_pointer()
        .child(SliderIndicator.new(state).relative().w_full().h(4).rounded(2).bg(t.input)
          .range_style((f) => f.rounded(2).bg(t.accent))
          // A 24x16 pill; the shell places its top-left at the groove's top, so it's pulled back by half its size less the 4px groove.
          .child(SliderThumb.new(state).id(`thumb-${id}`).w(24).h(16).rounded(8).bg(t.foreground).border_2().border_color(t.accent).ml(-12).mt(-6)))));
  }

  checkbox(id, label, on, t, onClick) {
    return h_flex().id(id).gap(8).items_center().cursor_pointer().on_click(onClick)
      .child(div().size(16).rounded(4).flex().items_center().justify_center().text_size(11)
        .when(on, (el) => el.bg(t.accent).text_color(t.accent_foreground).child("✓"))
        .when(!on, (el) => el.border_1().border_color(t.input).bg(t.background)))
      .child(div().child(label));
  }

  // The editor's bar under its preview: "N changes not saved" with Discard and Save. After Back with
  // unsaved changes it asks instead. One Save writes what every tab has staged.
  applyBar(t) {
    const c = this.changes(), n = c.type + c.colors + c.glass + c.agents;
    const where = [["Colors", c.colors], ["Type", c.type], ["Glass", c.glass], ["Agents", c.agents]].filter(([, k]) => k).map(([w]) => w).join(", ");
    if (this.leaving && n) return h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).text_size(12).child(`Save your changes to ${this.editing}?`))
      .child(this.button("stay", "Keep editing", t, (_e, cx) => { this.leaving = false; cx.notify(); }))
      .child(this.button("discard", "Discard", t, (_e, cx) => { this.cancelAll(cx); this.goTo("themes", cx); }))
      .child(this.button("save-leave", "Save", t, (_e, cx) => this.saveEdit(cx, () => this.goTo("themes", cx)), true));
    return h_flex().gap(6).items_center()
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(n ? t.foreground : t.dim)
        .child(n ? `${n} change${n > 1 ? "s" : ""} not saved (${where})` : `Change anything below; Save keeps it in ${this.editing}.`))
      .when(n > 0, (el) => el.child(this.button("cancel-all", "Discard", t, (_e, cx) => this.cancelAll(cx))))
      .child(this.button("apply-all", "Save", t, (_e, cx) => this.saveEdit(cx), n > 0));
  }

  typeTab(t, s, cx) {
    const { v } = this.typeValues(s);
    const label = (text) => div().w(64).flex_none().text_color(t.muted).child(text);
    const preview = v_flex().gap(8)
      .child(this.typeSample({ ...t, ...this.themeColors() }, v))
      .child(this.applyBar(t));
    const body = v_flex().gap(16)
      .child(this.section("Font", t, v_flex().gap(10)
        .child(h_flex().gap(8).items_center().child(label("Terminal"))
          .child(this.fontPicker(t, "font", v.font))
          .child(this.stepper(t, v.font_size, MIN_SIZE, MAX_SIZE, (n, cx) => this.stage("font_size", n, cx))))
        .child(h_flex().pl(72).child(this.checkbox("lig", "Use ligatures", v.font_ligatures, t, (_e, cx) => this.stage("font_ligatures", !v.font_ligatures, cx))))
        .child(h_flex().gap(8).items_center().child(label("Panels")).child(this.fontPicker(t, "ui_font", v.ui_font))),
        "Herdr has no font weight, character or line spacing, or anti-aliasing settings, so those aren't here. Panel text has no size setting either: panels follow Herdr's zoom (⌘+ / ⌘−)."))
      .child(this.section("Minimum contrast", t, h_flex().flex_wrap().gap(6)
        .children(CONTRASTS.map((n) => this.pill(`mc-${n}`, String(n), v.minimum_contrast === n, t, (_e, cx) => this.stage("minimum_contrast", n, cx)))),
        "Lifts terminal text that's too faint for its background. 1 leaves programs' colors alone. The preview's lift and ligatures are close to Herdr's, not exact."))
      .child(this.section("Your own font files", t, h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).text_size(11.5).line_height("17px").text_color(t.dim).child(".ttf or .otf files in the fonts folder load without installing them system-wide."))
        .child(this.button("fonts-open", "Open fonts folder", t, (_e, cx) => cx.spawn(async () => { await fs.mkdir(`${HOME}/fonts`, { recursive: true }).catch(() => {}); await exec("open", [`${HOME}/fonts`]); })))));
    return { head: preview, body };
  }

  glassTab(t, s, cx) {
    if (!this.personal()) {
      return v_flex().gap(12).p(12).rounded(8).bg(t.raised)
        .child(div().font_semibold().child("Glass needs your own copy of this layout"))
        .child(div().text_color(t.muted).line_height("19px").child(`Herdr's own layouts (${shared("layout")}) only take theme and background changes. A copy takes everything: terminal opacity, translucent sidebars, pane corners and gaps. Herdr updates won't change your copy; you can switch back any time with ⌘⇧L. The Studio closes for a moment while Herdr switches.`))
        .child(h_flex().child(this.button("copy", `Make my copy of ${shared("layout")}`, t, (_e, cx) => this.makeCopy(cx), true)));
    }
    const g = this.glassShown(), sel = this.pickTarget;
    const fmt = { opacity: (v) => v.toFixed(2), chrome: (v) => v.toFixed(2), radius: (v) => `${v}px`, gap: (v) => `${v}px`, margin: (v) => `${v}px`, angle: (v) => `${v}°`, glowIntensity: (v) => `${v}%` };
    const slider = (k, label) => this.slider(t, this.sliders[k], k, label, fmt[k](g[k]));
    // A row of color chips; the picker opens under the row for the selected one.
    const colors = (keys, note) => v_flex().gap(6)
      .child(h_flex().flex_wrap().gap(6).children(keys.map(([k, label]) => this.chip(t, `gc-${k}`, label, this.glassHex(k), sel === `glass:${k}`, (_e, cx) => this.selectTarget(`glass:${k}`, cx)))))
      .when(keys.some(([k]) => sel === `glass:${k}`), (el) => el.child(this.colorEditor(t, note)));
    const bgs = [["theme", "Theme"], ["gradient", "Gradient"], ["bloom", "Bloom"], ["frost", "Frosted wallpaper"], ["image", "Image"]];
    const body = v_flex().gap(16)
      .child(this.section("Presets", t, h_flex().gap(6).children(Object.entries(GLASS_PRESETS).map(([n, p]) =>
        this.pill(`gp-${n}`, n, false, t, (_e, cx) => this.stageGlass({ ...p }, cx))))))
      .child(this.section("Window background", t, v_flex().gap(10)
        .child(h_flex().flex_wrap().gap(6).children(bgs.map(([id, label]) => this.pill(`bg-${id}`, label, g.bg === id, t, (_e, cx) => this.stageGlass({ bg: id }, cx)))))
        .when(g.bg === "gradient", (el) => el.child(colors([["from", "From"], ["to", "To"]], "Clear the hex box to go back to the theme's accent (From) or canvas (To)."))
          .child(slider("angle", "Gradient angle")))
        .when(g.bg === "bloom", (el) => el.child(colors([["bloomBase", "Base"], ["glowA", "Glow 1"], ["glowB", "Glow 2"], ["glowC", "Glow 3"]], "Clear the hex box to go back to the theme's color."))
          .child(slider("glowIntensity", "Glow strength"))
          .child(div().text_size(11.5).text_color(t.dim).line_height("17px").child("Soft glows behind the glass. Herdr can only paint a flat color, a straight gradient or a picture behind panes, so the Studio renders the glows into a picture (backgrounds/studio-bloom-*.jpg). It's redrawn as you change it and when the theme changes.")))
        .when(g.bg === "frost", (el) => el.child(h_flex().gap(8).items_center()
          .child(div().flex_1().text_size(11.5).text_color(t.dim).line_height("17px").child("Your desktop picture, blurred. It shows the wallpaper only, not the windows behind Herdr, and it doesn't move with the window. Rebuilt when the wallpaper changes and you open the Studio."))
          .child(this.button("frost-now", "Rebuild", t, (_e, cx) => cx.spawn((cx) => this.guard(cx, "Blurring wallpaper", async () => { await this.refreshFrost(cx, true); this.pushGlass(); this.say("Frosted wallpaper rebuilt", "success", cx); }))))))
        .when(g.bg === "image", (el) => el.child(v_flex().gap(6)
          .child(h_flex().id("img-drop").gap(6).on_drop((e, cx) => this.useImage(e.paths && e.paths[0], cx))
            .child(this.button("img-choose", "Choose…", t, (_e, cx) => this.chooseImage(cx), true))
            .child(Input.new(this.imagePath).flex_1().h(30).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
            .child(this.button("img-set", "Use", t, (_e, cx) => this.useImage(this.imagePath.value().trim(), cx))))
          .child(div().text_size(11.5).text_color(t.dim).line_height("17px").child("Choose a picture, drop one here, or type a path. Herdr only reads pictures in its own folder, so one from elsewhere is copied into backgrounds/ first."))))))
      .child(this.section("Glass surfaces", t, v_flex().gap(12)
        .child(slider("chrome", "Sidebar and bar opacity"))
        .child(slider("opacity", "Terminal opacity")),
        "Below 1, the window background shows through. A busy background needs higher opacity to keep text readable. The glass takes the theme's chrome and terminal colors: change those on the Colors tab."))
      .child(this.section("Pane frames", t, v_flex().gap(12).child(slider("radius", "Corner radius")).child(slider("margin", "Margin around panes")).child(slider("gap", "Gap between panes")),
        "The margin frames the pane area, even with one pane. The gap shows between split panes and beside the side panel. Their color is on the Colors tab, under Behind panes."))
      .child(this.section("True window blur", t, div().text_size(11.5).text_color(t.dim).line_height("17px")
        .child("Seeing the desktop and other windows through Herdr needs a Herdr setting that doesn't exist yet (herdr-app issue #190).")));
    return { head: v_flex().gap(8).child(this.windowPreview(t)).child(this.applyBar(t)), body };
  }

  // A pill with a color dot, for picking which color the picker edits.
  chip(t, id, label, hex, on, onClick) {
    return h_flex().id(id).gap(6).px(9).h(28).items_center().rounded(7).cursor_pointer().text_size(12.5)
      .border_1().border_color(on ? t.accent : t.input).bg(on ? t.selected : t.background).hover((st) => st.bg(t.hover))
      .on_click(onClick)
      .child(div().size(14).rounded(7).bg(hex).border_1().border_color(t.input))
      .child(div().child(label));
  }

  agentsTab(t, s, cx) {
    if (!this.personal()) {
      return v_flex().gap(12).p(12).rounded(8).bg(t.raised)
        .child(div().font_semibold().child("The agents list needs your own copy of this layout"))
        .child(div().text_color(t.muted).line_height("19px").child(`Herdr's own layouts (${shared("layout")}) can't swap their agents list. A copy can: it shows the Studio's version of the list, a copy of Herdr's with your sizes. The Studio closes for a moment while Herdr switches.`))
        .child(h_flex().child(this.button("copy", `Make my copy of ${shared("layout")}`, t, (_e, cx) => this.makeCopy(cx, "agents"), true)));
    }
    const a = this.agentsShown();
    const px = (v) => `${v}px`;
    const preset = Object.entries(AGENT_PRESETS).find(([, p]) => Object.keys(p).every((k) => p[k] === a[k]));
    const body = v_flex().gap(16)
      .child(this.section("Density", t, h_flex().flex_wrap().gap(6)
        .children(Object.keys(AGENT_PRESETS).map((name) => this.pill(`agp-${name}`, name, preset && preset[0] === name, t, (_e, cx) => this.stageAgents({ ...AGENT_PRESETS[name] }, cx)))),
        "Comfortable is Herdr's own list. Fine-tune with the sliders."))
      .child(this.section("Sizes", t, v_flex().gap(12)
        .child(this.slider(t, this.agentSliders.row, "ag-row", "Row height", px(a.row)))
        .child(this.slider(t, this.agentSliders.text, "ag-text", "Text size", px(a.text)))
        .child(this.slider(t, this.agentSliders.icon, "ag-icon", "Icon size", px(a.icon)))
        .child(this.slider(t, this.agentSliders.header, "ag-header", "Group header height", px(a.header)))))
      .child(this.section("Show", t, v_flex().gap(8)
        .child(this.checkbox("ag-time", "Time since (3m, 12m)", a.time, t, (_e, cx) => this.stageAgents({ time: !a.time }, cx)))
        .child(this.checkbox("ag-headers", "Group headers (Working, Pinned, …)", a.headers, t, (_e, cx) => this.stageAgents({ headers: !a.headers }, cx)))
        .child(this.checkbox("ag-icons", "Agent icons", a.icons, t, (_e, cx) => this.stageAgents({ icons: !a.icons }, cx)))
        .child(this.checkbox("ag-badge", "\"Needs you\" badge (off: a small !)", a.badge, t, (_e, cx) => this.stageAgents({ badge: !a.badge }, cx))),
        "Your layout copy shows the Studio's copy of Herdr's agents list once anything here differs from Herdr's. It's rebuilt from Herdr's list on each Save, so Herdr's updates still reach it."));
    return { head: v_flex().gap(8).child(this.agentsPreview(t, a)).child(this.applyBar(t)), body };
  }

  // A mock of the sidebar's agents list with the staged sizes.
  agentsPreview(t, a) {
    const rows = [["herdr-app-theming", "3m", "working"], ["agent-tools-private", "12m", "blocked"], ["notes", "1h", "idle"]];
    const status = (st) => st === "working" ? div().size(10).flex_none().rounded(5).border_2().border_color(t.working)
      : st === "blocked" ? (a.badge ? div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you")
        : div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!"))
      : div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle || t.dim);
    const row = ([name, when, st], i) => h_flex().id(`agm-${i}`).px(8).h(a.row).flex_none().rounded(8).items_center().gap(a.row < 26 ? 6 : 9).text_size(a.text)
      .when(i === 0, (el) => el.bg(t.selected))
      .when(a.icons, (el) => el.child(div().size(a.icon).flex_none().rounded(4).bg(t.accent)))
      .child(div().flex_1().min_w(0).truncate().text_color(st === "idle" ? t.muted : t.foreground).child(name))
      .when(a.time, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(when)))
      .child(status(st));
    const header = (label, n) => h_flex().px(8).pt(a.header < 26 ? 4 : 8).h(a.header).flex_none().gap(6).items_center().text_size(11).font_medium().text_color(t.dim)
      .child(label).child(div().text_color(t.dim).child(String(n)));
    return v_flex().w(240).p(8).rounded(8).bg(t.chrome).border_1().border_color(t.border).self_center()
      .when(a.headers, (el) => el.child(header("Working", 2)))
      .child(row(rows[0], 0)).child(row(rows[1], 1))
      .when(a.headers, (el) => el.child(header("Idle", 1)))
      .child(row(rows[2], 2));
  }

  // A small mock window drawn from the staged theme colors and glass: backdrop, sidebar and tab bar,
  // two pane cards over the behind-panes color.
  windowPreview(t) {
    const c = { ...t, ...this.themeColors() }, g = this.glassShown(), base = this.baseColors(g, c);
    const behind = g.behind ? this.glassHex("behind", g, c) : null;
    const see = g.opacity < 1;
    const chrome = withAlpha(base.chrome, g.chrome), term = see ? withAlpha(base.background, g.opacity) : c.background;
    // ponytail: the gradient snaps to the nearest of four directions; Herdr draws the exact angle.
    const a = ((g.angle % 360) + 360) % 360, across = (a > 45 && a < 135) || (a > 225 && a < 315);
    const flip = across ? a > 180 : !(a >= 135 && a <= 225);
    const from = this.glassHex("from", g, c), to = this.glassHex("to", g, c);
    const bands = Array.from({ length: 16 }, (_, i) => div().flex_1().bg(withAlpha(from, flip ? i / 15 : 1 - i / 15)));
    const path = g.bg === "frost" ? g.frost : g.bg === "image" ? g.image : g.bg === "bloom" ? g.bloom : "";
    const backdrop = g.bg === "gradient" ? (across ? h_flex() : v_flex()).size_full().bg(to).children(bands)
      : path ? image(path).size_full() : div().size_full().bg(g.bg === "bloom" ? this.glassHex("bloomBase", g, c) : c.canvas);
    const bar = (w, col) => div().w(w).h(5).rounded(3).bg(col);
    const font = settings().font_family;
    const line = (parts) => h_flex().gap(5).children(parts.map(([text, col]) => div().text_color(col).child(text)));
    const card = (title, lines, tail) => v_flex().flex_1().h_full().min_w(0).rounded(g.radius).overflow_hidden().bg(term)
      .child(div().h(16).px(6).flex().items_center().text_size(9).text_color(c.muted).border_b_1().border_color(c.border).child(title))
      .child(v_flex().p(6).gap(1).font_family(font).text_size(9.5).line_height("13px").children(lines.map((l, i) => i === lines.length - 1 && tail ? line(l).child(tail) : line(l))));
    return div().relative().h(170).w_full().rounded(8).overflow_hidden().border_1().border_color(t.border).bg(c.canvas)
      .child(div().absolute().inset_0().child(backdrop))
      .child(h_flex().absolute().inset_0()
        .child(v_flex().w(72).h_full().bg(chrome).border_r_1().border_color(c.border).p(8).gap(7)
          .child(bar(30, c.foreground)).child(bar(46, c.muted)).child(bar(38, c.muted)).child(bar(42, c.dim)))
        .child(v_flex().flex_1().h_full().min_w(0)
          .child(h_flex().h(20).px(8).gap(6).items_center().bg(chrome).border_b_1().border_color(c.border)
            .child(div().w(34).h(12).rounded(4).bg(c.selected)).child(div().w(28).h(12).rounded(4).bg(c.hover)))
          .child(h_flex().flex_1().min_h(0).p(g.margin).gap(g.gap).when(!!behind, (el) => el.bg(behind))
            .child(card("zsh", [[["~/app", c.ansi4], ["main", c.ansi5]], [["$ npm test", c.terminal_foreground || c.foreground]], [["✓ 42 passed", c.ansi2]]]))
            .child(card("claude", [[["● Reading lib.js", c.ansi3]], [["  edits ready", c.muted]], [["❯", c.accent]]], this.cursorMark(c))))));
  }

  // The terminal cursor in the mock window, in its staged shape and color (blink isn't shown).
  cursorMark(c) {
    const col = c.cursor || c.foreground, shape = this.cursorShown().shape;
    return h_flex().h(13).items_center()
      .child(shape === "bar" ? div().w(1.5).h(12).bg(col) : shape === "underline" ? div().w(6).h(12).flex().items_end().child(div().w_full().h(1.5).bg(col)) : div().w(6).h(12).bg(col));
  }

  // The picker for the selected color: swatch, hue/saturation/lightness/alpha strips, hex box, and
  // Reset when `reset` is given. Each strip shows what its slider would give.
  colorEditor(t, note, reset) {
    const P = this.pick;
    const strips = [
      ["H", (k) => hslaToHex(k * 359, 100, 50)],
      ["S", (k) => hslaToHex(P[0], k * 100, P[2])],
      ["L", (k) => hslaToHex(P[0], P[1], k * 100)],
      ["A", (k) => hslaToHex(P[0], P[1], P[2], k * 100)],
    ];
    const row = ([label, fn], i) => h_flex().gap(8).items_center()
      .child(div().w(12).text_size(11).text_color(t.dim).child(label))
      // The strip sits under the slider: the indicator draws only the fill and the thumb.
      .child(div().relative().flex_1()
        .child(h_flex().absolute().top(5).left(0).w_full().h(10).rounded(5).bg(t.background)
          // overflow_hidden doesn't clip to the radius, so the end bands round themselves.
          .children(Array.from({ length: 48 }, (_, j) => div().flex_1().h_full().bg(fn(j / 47)).when(j === 0, (el) => el.rounded_l(5)).when(j === 47, (el) => el.rounded_r(5)))))
        .child(Slider.new(this.pickers[i]).child(SliderTrack.new(this.pickers[i]).flex().items_center().h(20).w_full().cursor_pointer()
        .child(SliderIndicator.new(this.pickers[i]).relative().w_full().h(10)
          .range_style((f) => f)
          // 24x16 pill on a 10px strip: pulled back half its width and 3px up.
          .child(SliderThumb.new(this.pickers[i]).id(`pick-${label}`).w(24).h(16).rounded(8).bg(t.foreground).border_2().border_color(t.background).ml(-12).mt(-3))))))
      .child(div().w(26).ml(6).text_size(11).text_color(t.muted).text_right().child(String(P[i])));
    return v_flex().gap(8).mt(4).mb(6).p(10).rounded(8).bg(t.raised)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(h_flex().gap(10).items_center()
        .child(div().size(56).rounded(8).border_1().border_color(t.input).bg(hslaToHex(...P)))
        .child(v_flex().flex_1().gap(2).children(strips.map(row))))
      .child(h_flex().gap(6).items_center()
        .child(Input.new(this.hex).flex_1().h(30).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_color(t.foreground))
        .child(this.button("hex-set", "Set", t, (_e, cx) => this.stageHex(this.hex.value(), cx), true))
        .when(!!reset, (el) => el.child(this.button("hex-reset", "Reset", t, (_e, cx) => reset(cx)))))
      .when(!!note, (el) => el.child(div().text_size(11.5).text_color(t.dim).line_height("17px").child(note)));
  }

  // --- parts -----------------------------------------------------------------
  section(label, t, content, note) {
    return v_flex().gap(8)
      .child(div().text_size(11).font_semibold().text_color(t.muted).child(label.toUpperCase()))
      .child(content)
      .when(!!note, (el) => el.child(div().text_size(11.5).text_color(t.dim).line_height("17px").child(note)));
  }

  pill(id, label, active, t, onClick) {
    return div().id(id).px(10).py(4).rounded(7).cursor_pointer().text_size(12.5)
      .border_1().border_color(active ? t.accent : t.border)
      .bg(active ? t.accent : "#00000000").text_color(active ? t.accent_foreground : t.foreground)
      .hover((st) => st.bg(active ? t.accent : t.hover))
      .on_click(onClick).child(label);
  }

  button(id, label, t, onClick, primary = false) {
    return div().id(id).px(10).py(5).rounded(7).cursor_pointer().text_size(12.5).font_medium()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground))
      .when(!primary, (el) => el.border_1().border_color(t.input).text_color(t.foreground))
      .hover((st) => st.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick).child(label);
  }
}
