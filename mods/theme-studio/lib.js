// Pure helpers for Theme Studio: no `herdr` or `gpui-kit` imports, so node can test them (lib.test.mjs).

export const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

export function normHex(s) {
  if (typeof s !== "string") return null;
  let h = s.trim().replace(/^0x/i, "#");
  if (!h.startsWith("#")) h = "#" + h;
  if (/^#[0-9a-f]{3}$/i.test(h)) h = "#" + [...h.slice(1)].map((c) => c + c).join("");
  return HEX.test(h) ? h.toLowerCase() : null;
}

function rgba(hex) {
  const h = normHex(hex);
  if (!h) throw new Error("not a color: " + hex);
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(1), n(3), n(5), h.length === 9 ? n(7) / 255 : 1];
}

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio of fg on bg. A translucent fg is composited over bg first. */
export function contrast(fg, bg) {
  const b = rgba(bg), f = rgba(fg);
  const c = f.slice(0, 3).map((v, i) => v * f[3] + b[i] * (1 - f[3]));
  const x = lum(c), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** fg moved toward white (dark bg) or black (light bg) just far enough to reach `min` contrast:
 *  a preview of Herdr's minimum_contrast, not its exact formula. */
export function liftContrast(fg, bg, min) {
  if (!(min > 1) || contrast(fg, bg) >= min) return normHex(fg).slice(0, 7);
  const f = rgba(fg), to = lum(rgba(bg)) < 0.18 ? 255 : 0;
  const hex = (k) => "#" + f.slice(0, 3).map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, "0")).join("");
  for (let k = 0.05; k < 1; k += 0.05) if (contrast(hex(k), bg) >= min) return hex(k);
  return hex(1);
}

/** Text with a zero-width non-joiner between the characters of each common code ligature, so a
 *  sample can show ligatures off when the renderer always joins them. */
export const breakLigatures = (text) => text.replace(/->|=>|!=|==|<=|>=|::|\|>|<-|\/\/|&&|\|\|/g, (m) => m.split("").join("\u200c"));

/** `#rrggbb` (alpha dropped) plus alpha 0..1 → `#rrggbbaa`; alpha 1 gives plain `#rrggbb`. */
export function withAlpha(hex, a) {
  const base = normHex(hex).slice(0, 7);
  if (a >= 1) return base;
  return base + Math.round(Math.max(0, a) * 255).toString(16).padStart(2, "0");
}

/** `#rrggbb[aa]` → [hue 0..360, saturation 0..100, lightness 0..100, alpha 0..100], rounded. */
export function hexToHsla(hex) {
  const [r, g, b, a] = rgba(hex).map((v, i) => (i < 3 ? v / 255 : v));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  }
  return [Math.round(h) % 360, Math.round(s * 100), Math.round(l * 100), Math.round(a * 100)];
}

/** hexToHsla's inverse: alpha 100 gives `#rrggbb`, below it `#rrggbbaa`. */
export function hslaToHex(h, s, l, a = 100) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, m = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - m * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return withAlpha("#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join(""), a / 100);
}

/** Terminal cursor shape as the DECSCUSR number (`ESC [ n SP q`) a shell sends: steady block 2,
 *  underline 4, bar 6; blinking is one less. */
export const CURSOR_SHAPES = { block: 2, underline: 4, bar: 6 };
export const cursorCode = (shape, blink) => (CURSOR_SHAPES[shape] || 2) - (blink ? 1 : 0);

export const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";

/** Merge a patch into settings: null/undefined deletes a key; `colors` merges one level deeper. */
export function mergeSettings(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k];
    else if (k === "colors" && typeof v === "object") {
      const c = { ...(out.colors || {}) };
      for (const [ck, cv] of Object.entries(v)) { if (cv == null) delete c[ck]; else c[ck] = cv; }
      if (Object.keys(c).length) out.colors = c; else delete out.colors;
    } else out[k] = v;
  }
  return out;
}

// --- Theme files -----------------------------------------------------------
// themes/<name>.json: { background, foreground, selection, cursor?, ansi: [16], colors?: {...} }.
// In theme() names, the file's `foreground` is `terminal_foreground` (`foreground` is the panels' text).

const FILE_FIELD = { background: "background", terminal_foreground: "foreground", selection: "selection", cursor: "cursor" };

/** A theme file from theme()/themes() colors, so any theme can be forked. */
export function themeFileFrom(c) {
  const f = {
    background: c.background,
    foreground: c.terminal_foreground || c.foreground,
    selection: c.selection,
    cursor: c.cursor || c.terminal_foreground || c.foreground,
    ansi: Array.from({ length: 16 }, (_, i) => c["ansi" + i]),
  };
  if (f.ansi.some((x) => !x)) throw new Error("theme colors lack ansi0..15");
  return f;
}

/** Returns a copy of the theme file with one token set (hex) or reset (null, panel tokens only). */
export function setToken(file, token, hex) {
  const f = { ...file, ansi: [...file.ansi], colors: { ...(file.colors || {}) } };
  const m = /^ansi(\d+)$/.exec(token);
  if (m) { if (hex) f.ansi[+m[1]] = hex; }
  else if (FILE_FIELD[token]) { if (hex) f[FILE_FIELD[token]] = hex; }
  else if (hex) f.colors[token] = hex;
  else delete f.colors[token];
  if (!Object.keys(f.colors).length) delete f.colors;
  return f;
}

/** True when the token is stored as an override in the file's `colors` block. */
export const isOverride = (file, token) => !!(file && file.colors && token in file.colors);

// --- Importing other terminals' themes ---------------------------------------

const ANSI_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** iTerm2 .itermcolors (an XML plist of color dicts with 0..1 components) → a Herdr theme file.
 *  Newer iTerm2 themes can carry "(Dark)" and "(Light)" variants of each key, sometimes without the
 *  plain one: `variant` picks which to prefer when the plain key is missing. Binary plists must be
 *  converted to XML first (plutil). */
function parseIterm(t, variant = "Dark") {
  const colors = {};
  for (const m of t.matchAll(/<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)) {
    const comp = (name) => { const r = new RegExp(`<key>${name} Component</key>\\s*<real>([^<]+)</real>`).exec(m[2]); return r ? Number(r[1]) : NaN; };
    const rgb = ["Red", "Green", "Blue"].map(comp);
    if (rgb.some(Number.isNaN)) continue;
    colors[m[1].trim()] = "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
  }
  const other = variant === "Dark" ? "Light" : "Dark";
  const pick = (k) => colors[k] || colors[`${k} (${variant})`] || colors[`${k} (${other})`];
  const ansi = Array.from({ length: 16 }, (_, i) => pick(`Ansi ${i} Color`));
  if (!pick("Background Color") || !pick("Foreground Color")) throw new Error("no Background and Foreground Color found");
  if (ansi.some((x) => !x)) throw new Error(`found ${ansi.filter(Boolean).length} of 16 ANSI colors`);
  return {
    background: pick("Background Color"), foreground: pick("Foreground Color"),
    selection: pick("Selection Color") || ansi[8], cursor: pick("Cursor Color") || pick("Foreground Color"), ansi,
  };
}

/** Ghostty, kitty, Alacritty (TOML), iTerm2 (.itermcolors) or a Herdr theme JSON → a Herdr theme
 *  file. Throws when it can't. */
export function parseTheme(text) {
  // A file path (Finder's Copy puts the path on the clipboard) is for the caller to read.
  if (/^(\/|~\/)[^\n]+\.[a-z]+$/i.test(String(text).trim())) throw new Error("that's a file path: drop the file or pick it from the list");
  const t = String(text).trim();
  if (t.startsWith("bplist")) throw new Error("this is a binary plist: drop or pick the file instead of pasting it");
  if (t.startsWith("<?xml") || t.startsWith("<plist") || /<key>Ansi 0 Color( \((Dark|Light)\))?<\/key>/.test(t)) return parseIterm(t);
  if (t.startsWith("{")) {
    const j = JSON.parse(t);
    if (!j.background || !Array.isArray(j.ansi) || j.ansi.length !== 16) throw new Error("JSON is not a Herdr theme");
    return j;
  }
  const f = { ansi: Array(16).fill(null) };
  const set = (k, v) => { const h = normHex(v); if (h) f[k] = h; };
  let section = "";
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.replace(/\s+#(?![0-9a-f]{3,8}\b).*$/i, "").trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) { section = sec[1].trim(); continue; }
    let m;
    if ((m = /^palette\s*=\s*(\d+)\s*=\s*(\S+)$/.exec(line))) { const i = +m[1]; if (i < 16) f.ansi[i] = normHex(m[2]); continue; } // ghostty
    if ((m = /^color(\d+)\s+(\S+)$/.exec(line))) { const i = +m[1]; if (i < 16) f.ansi[i] = normHex(m[2]); continue; } // kitty
    if ((m = /^([a-z_-]+)\s*(?:=\s*)?["']?(#?[0-9a-fx]+)["']?$/i.exec(line))) {
      const key = m[1].toLowerCase().replace(/-/g, "_"), val = m[2];
      if (section.startsWith("colors.normal") || section.startsWith("colors.bright")) { // alacritty
        const i = ANSI_NAMES.indexOf(key);
        if (i >= 0) f.ansi[i + (section.startsWith("colors.bright") ? 8 : 0)] = normHex(val);
        continue;
      }
      if (section === "colors.cursor" && key === "cursor") { set("cursor", val); continue; }
      if (section === "colors.selection" && key === "background") { set("selection", val); continue; }
      if (key === "background") set("background", val);
      else if (key === "foreground") set("foreground", val);
      else if (key === "cursor" || key === "cursor_color") set("cursor", val);
      else if (key === "selection_background") set("selection", val);
    }
  }
  if (!f.background || !f.foreground) throw new Error("no background and foreground found");
  if (f.ansi.some((x) => !x)) throw new Error(`found ${f.ansi.filter(Boolean).length} of 16 ANSI colors`);
  f.selection ||= f.ansi[8];
  f.cursor ||= f.foreground;
  return { background: f.background, foreground: f.foreground, selection: f.selection, cursor: f.cursor, ansi: f.ansi };
}

// --- Glass ------------------------------------------------------------------

// behind: what shows around and between the pane cards ("" = the window background).
export const ROUNDED_HEADER = "pane-rounded";

/** Patches a clone of Herdr's `pane` header so its top corners follow the card's radius.
 *  Returns the patched source, or null when the source no longer looks like what we patch. */
export function patchHeader(src) {
  if (src.includes("studioRadius(")) return src;
  const root = /\.size_full\(\)(\s*)\.px\(10\)/;
  if (!root.test(src) || !/from "herdr";/.test(src)) return null;
  const helper = `
import { layout as studioLayout } from "herdr";
// Added by Theme Studio: the header's top corners follow the pane card's radius, less its border.
function studioRadius() {
  const find = (n) => n && (n.content && n.content.tab ? n : (n.children || []).reduce((f, c) => f || find(c), null));
  const p = (find(studioLayout()) || {}).content?.pane || {};
  return Math.max(0, (p.radius || 0) - ((p.border && p.border.width) || 0));
}
`;
  const at = src.indexOf("\n", src.lastIndexOf('from "herdr";')) + 1;
  return (src.slice(0, at) + helper + src.slice(at)).replace(root, ".size_full()$1.rounded_t(studioRadius())$1.px(10)");
}

// The agents list in the sidebar is Herdr's `agents` mod. The Studio's sizes and hidden parts go in a
// clone, rebuilt from Herdr's current file, that reads them live from shared "theme-studio.agents".
export const AGENTS_MOD = "agents-studio";
export const AGENTS_DEFAULT = { row: 30, text: 13, icon: 16, header: 30, headerText: 11, timeText: 11, titleText: 11.5, badgeText: 10.5, time: true, headers: true, icons: true, badge: true };
const AGENTS_PATCH = [
  ["icon(a.program, 16, t.foreground)", "icon(a.program, studioAgents().icon, t.foreground)"],
  [".h(30)\n        .flex_none()\n        .rounded(8)\n        .items_center()\n        .gap(9)",
    ".h(studioAgents().row)\n        .flex_none()\n        .rounded(8)\n        .items_center()\n        .gap(studioAgents().row < 26 ? 6 : 9)\n        .text_size(studioAgents().text)"],
  [".when(Boolean(pic), el => el.child(div().id(`agent-fold-", ".when(Boolean(pic) && studioAgents().icons, el => el.child(div().id(`agent-fold-"],
  [".when(this.hovered !== a.address && Boolean(when), el =>", ".when(this.hovered !== a.address && Boolean(when) && studioAgents().time, el =>"],
  [".child(this.status(t, a, byPriority && !isPinned));", ".child(this.status(t, a, (byPriority && !isPinned) || !studioAgents().badge));"],
  [".id(g.id)\n        .px(8)\n        .pt(8)\n        .h(30)", ".id(g.id)\n        .px(8)\n        .pt(studioAgents().header < 26 ? 4 : 8)\n        .h(studioAgents().header)"],
  [": groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);",
    ": groups.flatMap((g) => studioAgents().headers ? [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))] : g.members.flatMap(withKids));"],
  ["const pic = icon(k.program, 14, t.foreground);", "const pic = icon(k.program, Math.max(8, studioAgents().icon - 2), t.foreground);"],
  [".rounded(8)\n      .h(26)\n      .flex_none()\n      .gap(0)\n      .items_center()\n      .text_size(12.5)",
    ".rounded(8)\n      .h(Math.max(16, studioAgents().row - 4))\n      .flex_none()\n      .gap(0)\n      .items_center()\n      .text_size(studioAgents().text - 0.5)"],
  ["        .items_center()\n        .text_size(11)\n        .font_medium()", "        .items_center()\n        .text_size(studioAgents().headerText)\n        .font_medium()"],
  [".child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when)))", ".child(div().flex_none().text_size(studioAgents().timeText).text_color(t.dim).child(duration(now - when)))"],
  [".child(div().text_size(11.5).font_medium().text_color(t.dim).child(\"Agents\"))", ".child(div().text_size(studioAgents().titleText).font_medium().text_color(t.dim).child(\"Agents\"))"],
  ["px(6).h(18).rounded(5).bg(t.blocked + \"26\").text_size(10.5)", "px(6).h(studioAgents().badgeText + 7.5).rounded(5).bg(t.blocked + \"26\").text_size(studioAgents().badgeText)"],
  [".size(14).flex_none().rounded(4).bg(t.blocked + \"26\").text_size(10.5)", ".size(studioAgents().badgeText + 3.5).flex_none().rounded(4).bg(t.blocked + \"26\").text_size(studioAgents().badgeText)"],
];
/** Herdr's agents mod with the Studio's sizes and parts, or null when its code no longer matches. */
export function patchAgents(src) {
  if (src.includes("studioAgents(")) return src;
  if (!/import \{[^}]*\bshared\b[^}]*\} from "herdr";/.test(src)) return null;
  let out = src;
  for (const [from, to] of AGENTS_PATCH) {
    if (out.split(from).length !== 2) return null; // each anchor exactly once
    out = out.replace(from, () => to);
  }
  const helper = `
// Added by Theme Studio: row sizes and the parts shown, from shared "theme-studio.agents".
function studioAgents() { return { ...${JSON.stringify(AGENTS_DEFAULT)}, ...(shared("theme-studio.agents") || {}) }; }
`;
  const at = out.indexOf("\n", out.indexOf('from "herdr";')) + 1;
  return out.slice(0, at) + helper + out.slice(at);
}

/** Copy of a layout tree with its agents blocks on the Studio's clone (on) or Herdr's own mod. */
export function withAgentsMod(tree, on) {
  const [from, to] = on ? ["agents", AGENTS_MOD] : [AGENTS_MOD, "agents"];
  const walk = (n) => {
    if (!n || typeof n !== "object") return n;
    const c = { ...n };
    if (c.content && c.content.mod === from) c.content = { ...c.content, mod: to };
    if (Array.isArray(c.children)) c.children = c.children.map(walk);
    return c;
  };
  return walk(tree);
}

export const GLASS_DEFAULT = { bg: "theme", angle: 165, from: "accent", to: "canvas", image: "", frost: "", opacity: 1, chrome: 1, radius: 6, gap: 6, margin: 8, behind: "",
  bloom: "", bloomBase: "canvas", glowA: "accent", glowB: "ansi5", glowC: "ansi6", glowIntensity: 100 };
/** Glass fields a layout tree can't give back (the bloom colors), kept beside it in shared state. */
export const GLASS_EXTRA = ["bloomBase", "glowA", "glowB", "glowC", "glowIntensity"];

/** Copy of a layout tree with the glass look applied to its root and its `{tab:"active"}` blocks.
 *  `base` holds the theme's opaque `chrome` and `background` colors as hex, which get the alpha.
 *  See-through terminals: the terminal's own background goes fully transparent and the pane card
 *  carries the translucency instead. Herdr clips the card to its radius but paints a terminal's
 *  background square, so this is what keeps rounded corners clean. */
export function applyGlass(tree, g, base) {
  const { chrome, background } = typeof base === "string" ? { chrome: base } : base || {};
  const root = JSON.parse(JSON.stringify(tree));
  root.background =
    g.bg === "gradient" ? { gradient: [g.from || "accent", g.to || "canvas"], angle: g.angle } :
    g.bg === "bloom" && g.bloom ? { image: g.bloom, fit: "cover" } :
    g.bg === "frost" && g.frost ? { image: g.frost, fit: "cover" } :
    g.bg === "image" && g.image ? { image: g.image, fit: "cover" } : "canvas";
  const see = g.opacity < 1;
  if (see) root.terminal_opacity = 0; else delete root.terminal_opacity;
  const colors = { ...(root.colors || {}) };
  if (g.chrome < 1 && chrome) colors.chrome = withAlpha(chrome, g.chrome); else delete colors.chrome;
  if (Object.keys(colors).length) root.colors = colors; else delete root.colors;
  // Herdr doesn't paint a tab block's own background, so "behind" goes on the node holding it.
  (function walk(n, parent) {
    if (n.content && n.content.tab) {
      const p = { ...(n.content.pane || {}), radius: g.radius, gap: g.gap };
      // Herdr's pane header paints square corners inside a rounded card; its rounded clone doesn't.
      const hm = p.header && p.header.content && p.header.content.mod;
      if (hm === "pane" || hm === ROUNDED_HEADER) p.header = { ...p.header, content: { ...p.header.content, mod: g.radius > 0 ? ROUNDED_HEADER : "pane" } };
      if (see) p.background = withAlpha(background || "#000000", g.opacity); else delete p.background;
      n.content = { ...n.content, pane: p };
      delete n.background;
      const host = parent && parent !== root ? parent : null;
      if (host) {
        if (g.behind) host.background = g.behind; else delete host.background;
        // Herdr's pane gap only shows between split panes; the margin around them is the host's padding,
        // and the host's own gap is the space beside its other children (the side panel).
        host.padding = g.margin ?? GLASS_DEFAULT.margin; host.gap = g.gap;
      }
    }
    (n.children || []).forEach((c) => walk(c, n));
  })(root, null);
  return root;
}

/** What bloom.jxa.js draws: the base color and three soft glows (top left, right, bottom), with
 *  colors already resolved to hex. Positions are fractions of the picture, origin bottom left. */
export function bloomSpec(base, glows, intensity) {
  const spots = [[0.16, 0.86, 0.3, 0.55], [0.88, 0.52, 0.26, 0.45], [0.42, 0.04, 0.28, 0.4]];
  return { w: 1600, h: 1000, base: normHex(base).slice(0, 7),
    glows: glows.map((c, i) => ({ c: normHex(c).slice(0, 7), x: spots[i][0], y: spots[i][1], r: spots[i][2], a: Math.min(1, (spots[i][3] * intensity) / 100) })) };
}

/** Reads the glass settings back out of a layout tree (inverse of applyGlass, best effort). */
export function readGlass(tree) {
  const g = { ...GLASS_DEFAULT };
  if (!tree) return g;
  const bg = tree.background;
  if (bg && bg.gradient) { g.bg = "gradient"; g.angle = bg.angle ?? 165; [g.from, g.to] = bg.gradient; }
  else if (bg && bg.image) {
    const kind = /studio-frost/.test(bg.image) ? "frost" : /studio-bloom/.test(bg.image) ? "bloom" : "image";
    g.bg = kind; g[kind] = bg.image;
  }
  g.opacity = tree.terminal_opacity ?? 1;
  const alphaOf = (hex) => (typeof hex === "string" && hex.length === 9 ? Math.round((parseInt(hex.slice(7), 16) / 255) * 100) / 100 : 1);
  const ch = tree.colors && tree.colors.chrome;
  if (ch && ch.length === 9) g.chrome = Math.round((parseInt(ch.slice(7), 16) / 255) * 100) / 100;
  (function walk(n, parent) {
    if (n.content && n.content.tab && n.content.pane) {
      g.radius = n.content.pane.radius ?? g.radius; g.gap = n.content.pane.gap ?? g.gap;
      if (tree.terminal_opacity === 0) g.opacity = alphaOf(n.content.pane.background);
      g.behind = parent && parent !== tree && typeof parent.background === "string" ? parent.background : "";
      if (parent && parent !== tree && typeof parent.padding === "number") g.margin = parent.padding;
    }
    (n.children || []).forEach((c) => walk(c, n));
  })(tree, null);
  return g;
}

// --- Fonts -------------------------------------------------------------------

const MONO = /mono|\bcode\b|courier|menlo|monaco|consol|term|fixed|hack|iosevka|inconsolata|fira|plex mono/i;
/** Monospaced-looking families first, then the rest; each group alphabetical. */
export const sortFonts = (fonts) => [...fonts].sort((a, b) => (MONO.test(b) - MONO.test(a)) || a.localeCompare(b));
export const isMono = (f) => MONO.test(f);

// --- Sidebar button ----------------------------------------------------------------

export const BUTTON_ID = "theme-studio-button";
const findNode = (n, id) => (n.id === id ? n : (n.children || []).reduce((f, c) => f || findNode(c, id), null));
export const hasButton = (tree) => !!(tree && findNode(tree, BUTTON_ID));

/** Copy of a layout tree with the Theme Studio row added just above the sidebar footer (on) or
 *  removed (off). Null when the layout has no sidebar to put it in. */
export function withButton(tree, on) {
  const root = JSON.parse(JSON.stringify(tree));
  (function strip(n) { if (n.children) { n.children = n.children.filter((c) => c.id !== BUTTON_ID); n.children.forEach(strip); } })(root);
  if (!on) return root;
  const block = { id: BUTTON_ID, type: "block", size: { px: 32 }, content: { mod: "theme-studio", props: { part: "button" } } };
  const parentOf = (n, id) => (n.children || []).some((c) => c.id === id) ? n : (n.children || []).reduce((f, c) => f || parentOf(c, id), null);
  const footerParent = parentOf(root, "sidebar-footer");
  if (footerParent) { footerParent.children.splice(footerParent.children.findIndex((c) => c.id === "sidebar-footer"), 0, block); return root; }
  const sidebar = findNode(root, "sidebar");
  if (sidebar && sidebar.children) { sidebar.children.push(block); return root; }
  return null;
}

// --- Palette icon beside Settings ----------------------------------------------------
// Herdr's sidebar footer (the shipped `workspace-chrome` mod, props {footer: true}) can't be
// edited, so the Studio clones it as FOOTER_MOD, adds a palette button to the Settings row, and
// points the personal layout's `sidebar-footer` block at the clone.

export const FOOTER_MOD = "workspace-chrome-studio";

const SETTINGS_ROW = 'row("settings", "settings", "Settings", false, () => run("app.settings"))';
const SETTINGS_DOT = /(\s*\.when\(Boolean\(updates\(\)\.app\.ready\), el => el\.child\(div\(\)\.size\(6\)\.rounded_full\(\)\.bg\(t\.accent\)\)\))\)/;

export const FOOTER_PATCH = "theme-studio footer patch v3";

/** Patches a pristine clone of Herdr's workspace-chrome so the footer's Settings row gets a
 *  palette button that opens Theme Studio: beside Settings when the sidebar is wide, on its own
 *  row under Settings on the narrow rail, where the footer grows by that row (layout.resize, a
 *  click Herdr keeps) and shrinks back when the sidebar widens. Returns the source unchanged when
 *  it already carries this version, and null when it isn't pristine and patchable. */
export function patchFooter(src) {
  if (src.includes(FOOTER_PATCH)) return src;
  if (src.includes("studioIcon(")) return null; // an older patch: re-clone first
  const at = src.indexOf(".child(" + SETTINGS_ROW);
  if (at < 0 || !SETTINGS_DOT.test(src.slice(at)) || !/from "herdr";/.test(src) || !/\n  render\(\) \{/.test(src)) return null;
  const helper = `
// ${FOOTER_PATCH}: a palette button beside Settings (or under it on the
// narrow rail) that opens Theme Studio.
const STUDIO_ROW = 28;
function studioIcon(t) {
  return div().id("theme-studio").size(26).flex_none().flex().items_center().justify_center().rounded(6)
    .text_color(t.muted).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
    .on_click(() => run("mod.open", { name: "theme-studio" }))
    .child(svg("mods/theme-studio/palette.svg").size(14));
}
function studioRail(t) {
  return h_flex().id("theme-studio-rail").h(STUDIO_ROW).px(8).items_center().rounded(8).text_color(t.muted).cursor_pointer()
    .hover(s => s.bg(t.hover).text_color(t.foreground))
    .on_click(() => run("mod.open", { name: "theme-studio" }))
    .child(svg("mods/theme-studio/palette.svg").size(14));
}
// The footer block is sized for its own rows: one more on the rail, back when wide.
function studioFit(cx) {
  if (!props()?.footer) return;
  const px = find(layout(), "sidebar-footer")?.size?.px;
  if (!px) return;
  const rail = narrow(), grown = Boolean(shared("theme-studio.footer-grown"));
  if (rail === grown) {
    if (!rail && shared("theme-studio.footer-px") !== px) setShared("theme-studio.footer-px", px);
    return;
  }
  const base = rail ? px : (shared("theme-studio.footer-px") ?? px - STUDIO_ROW);
  setShared("theme-studio.footer-px", base);
  setShared("theme-studio.footer-grown", rail);
  cx.timer.after(0, () => run("layout.resize", { id: "sidebar-footer", px: rail ? base + STUDIO_ROW : base }));
}`;
  const imp = src.indexOf("\n", src.lastIndexOf('from "herdr";')) + 1;
  let out = src.slice(0, imp) + helper + src.slice(imp);
  out = out.replace(/\n  render\(\) \{/, "\n  render(cx) {\n    studioFit(cx);");
  const row = out.indexOf(".child(" + SETTINGS_ROW);
  const head = out.slice(0, row), tail = out.slice(row);
  return head + tail
    .replace(".child(" + SETTINGS_ROW, ".child(h_flex().items_center().gap(2).child(" + SETTINGS_ROW + ".flex_1()")
    .replace(SETTINGS_DOT, "$1).when(!collapsed, el => el.child(studioIcon(t))))\n        .when(collapsed, el => el.child(studioRail(t)))");
}

/** Copy of a layout tree with the sidebar footer pointed at the patched clone (on) or back at
 *  Herdr's own (off). Also drops the older separate Theme Studio row. Null without a footer. */
export function withFooterIcon(tree, on) {
  const root = withButton(tree, false);
  const footer = findNode(root, "sidebar-footer");
  if (!footer || !footer.content) return null;
  footer.content = { ...footer.content, mod: on ? FOOTER_MOD : "workspace-chrome" };
  return root;
}
export const hasFooterIcon = (tree) => { const f = tree && findNode(tree, "sidebar-footer"); return !!(f && f.content && f.content.mod === FOOTER_MOD); };
