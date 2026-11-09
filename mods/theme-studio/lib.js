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
export const AGENTS_DEFAULT = { row: 30, text: 13, icon: 16, header: 30, headerText: 11, timeText: 11, titleText: 11.5, badgeText: 10.5, time: true, headers: true, icons: true, badge: true, lines: "one", lead: "space", show: "title", card: null, labels: null,
  detailText: 11, weight: "normal", statusSide: "right", radius: 8, pad: 8, space: 0,
  // Colors: "" is the theme's own.
  nameColor: "", detailColor: "", timeColor: "", cardColor: "", borderColor: "", selectedColor: "", hoverColor: "" };
const AGENTS_PATCH = [
  ["icon(a.program, 16, t.foreground)", "icon(a.program, studioAgents().icon, t.foreground)"],
  [".px(8)\n        .h(30)\n        .flex_none()\n        .rounded(8)\n        .items_center()\n        .gap(9)\n        .when(a.focused, (el) => el.bg(t.selected))\n        .cursor_pointer()\n        .hover((s) => s.bg(t.hover))",
    ".px(studioAgents().pad)\n        .h(studioAgents().row)\n        .flex_none()\n        .rounded(studioAgents().radius)\n        .items_center()\n        .gap(studioAgents().row < 26 ? 6 : 9)\n        .text_size(studioAgents().text)\n        .when(true, studioCard)\n        .when(a.focused, (el) => el.bg(studioAgents().selectedColor || t.selected))\n        .cursor_pointer()\n        .hover((s) => s.bg(studioAgents().hoverColor || t.hover))"],
  [".child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))",
    ".child(div().min_w(0).max_w(studioMore ? 120 : 200).truncate().text_color(studioAgents().nameColor || (idle ? t.muted : t.foreground)).when(true, studioWeight).child(name))"],
  [".px(collapsed ? 0 : 8).overflow_y_scrollbar()", ".px(collapsed ? 0 : 8).when(!collapsed, (el) => el.gap(studioAgents().space)).overflow_y_scrollbar()"],
  [".when(Boolean(pic), el => el.child(div().id(`agent-fold-", ".when(studioAgents().statusSide === \"left\", (el) => el.child(studioLeft(this.status(t, a, true))))\n        .when(Boolean(pic) && studioAgents().icons, el => el.child(div().id(`agent-fold-"],
  [".when(this.hovered !== a.address && Boolean(when), el =>", ".when(this.hovered !== a.address && Boolean(when) && studioAgents().time, el =>"],
  [".child(this.status(t, a, byPriority && !isPinned));", ".when(studioAgents().statusSide !== \"left\", (el) => el.child(this.status(t, a, (byPriority && !isPinned) || !studioAgents().badge)));"],
  [".id(g.id)\n        .px(8)\n        .pt(8)\n        .h(30)", ".id(g.id)\n        .px(8)\n        .pt(studioAgents().header < 26 ? 4 : 8)\n        .h(studioAgents().header)"],
  [": groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);",
    ": groups.flatMap((g) => studioAgents().headers ? [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))] : g.members.flatMap(withKids));"],
  ["const pic = icon(k.program, 14, t.foreground);", "const pic = icon(k.program, Math.max(8, studioAgents().icon - 2), t.foreground);"],
  [".rounded(8)\n      .h(26)\n      .flex_none()\n      .gap(0)\n      .items_center()\n      .text_size(12.5)",
    ".rounded(8)\n      .h(Math.max(16, studioAgents().row - 4))\n      .flex_none()\n      .gap(0)\n      .items_center()\n      .text_size(studioAgents().text - 0.5)"],
  ["        .items_center()\n        .text_size(11)\n        .font_medium()", "        .items_center()\n        .text_size(studioAgents().headerText)\n        .font_medium()"],
  [".child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when)))", ".child(div().flex_none().text_size(studioAgents().timeText).text_color(studioAgents().timeColor || t.dim).child(duration(now - when)))"],
  [".child(div().text_size(11.5).font_medium().text_color(t.dim).child(\"Agents\"))", ".child(div().text_size(studioAgents().titleText).font_medium().text_color(t.dim).child(\"Agents\"))"],
  ["px(6).h(18).rounded(5).bg(t.blocked + \"26\").text_size(10.5)", "px(6).h(studioAgents().badgeText + 7.5).rounded(5).bg(t.blocked + \"26\").text_size(studioAgents().badgeText)"],
  [".size(14).flex_none().rounded(4).bg(t.blocked + \"26\").text_size(10.5)", ".size(studioAgents().badgeText + 3.5).flex_none().rounded(4).bg(t.blocked + \"26\").text_size(studioAgents().badgeText)"],
  // Two lines: the icon and name on top; the detail, machine, time and status under the name.
  ["      const name = full ? a.space_name || label(a) : more ?? (/^\\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));\n",
    `      let name = full ? a.space_name || label(a) : more ?? (/^\\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      let studioMore = full && more ? more : "";
      // A card from the designer: rows of items (studioDrawCard), in the same clickable card.
      if (studioAgents().card) {
        const S = studioAgents(), lb = (studioLabels && studioLabels.get(a.address)) || {};
        const plain = /^\\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a);
        return v_flex()
          .id("ag-" + a.address)
          .px(S.pad).py(3).min_h(S.row).flex_none().justify_center()
          .rounded(S.radius).text_size(S.text)
          .when(true, studioCard)
          .when(a.focused, (el) => el.bg(S.selectedColor || t.selected))
          .cursor_pointer()
          .hover((s) => s.bg(S.hoverColor || t.hover))
          .on_hover((on, cx) => {
            if (on) this.hovered = a.address;
            else if (this.hovered === a.address) this.hovered = null;
            cx.notify();
          })
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(studioDrawCard(S.card, {
            title: plain, space: full ? a.space_name || "" : "", machine, labels: lb, idle,
            name: () => lb.name || studioName(a.address),
            time: when ? duration(now - when) : null, hovered: this.hovered === a.address, pin,
            status: (badge) => this.status(t, a, (byPriority && !isPinned) || !badge),
            icon: pic ? (sz) => div().id("agent-fold-" + a.address).flex_none()
              .when(subs.length > 0, (el) => el.on_click((_e, cx) => {
                cx.stop_propagation();
                this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
                cx.notify();
              }))
              .child(icon(a.program, sz, t.foreground) || pic) : null,
            fold: subs.length > 0 ? fold(a, subs) : null,
          }, S, t, { div, h_flex, v_flex }));
      }
      // "name" / "both": the session's own name (Claude Code's /rename) instead of, or before, its title.
      const studioN = studioAgents().show === "title" ? "" : studioName(a.address);
      if (studioN && !full) [name, studioMore] = studioAgents().show === "both" && name !== studioN ? [studioN, name] : [studioN, ""];
      else if (studioN) studioMore = studioAgents().show === "both" && studioMore && studioMore !== studioN ? studioN + " \\u00b7 " + studioMore : studioN;
      // "session": the session's title leads and its workspace follows.
      if (full && studioMore && studioAgents().lead === "session") [name, studioMore] = [studioMore, name];
      if (studioTwoLines(name, studioMore)) {
        const S = studioAgents(), gap = S.row < 26 ? 6 : 9, showPic = Boolean(pic) && S.icons, left = S.statusSide === "left";
        return v_flex()
          .id(\`ag-\${a.address}\`)
          .px(S.pad)
          .py(3)
          .flex_none()
          .rounded(S.radius)
          .gap(1)
          .text_size(S.text)
          .when(true, studioCard)
          .when(a.focused, (el) => el.bg(S.selectedColor || t.selected))
          .cursor_pointer()
          .hover((s) => s.bg(S.hoverColor || t.hover))
          .on_hover((on, cx) => {
            if (on) this.hovered = a.address;
            else if (this.hovered === a.address) this.hovered = null;
            cx.notify();
          })
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(h_flex().h(Math.max(16, S.row - 6)).items_center().gap(gap)
            .when(left, (el) => el.child(studioLeft(this.status(t, a, true))))
            .when(showPic, el => el.child(div().id(\`agent-fold-\${a.address}\`)
              .when(subs.length > 0, el => el.on_click((_e, cx) => {
                cx.stop_propagation();
                this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
                cx.notify();
              })).child(pic)))
            .child(div().flex_1().min_w(0).truncate().text_color(S.nameColor || (idle ? t.muted : t.foreground)).when(true, studioWeight).child(name))
            .when(subs.length > 0, el => el.child(fold(a, subs))))
          .child(h_flex().min_h(18).items_center().gap(6).pl((showPic ? S.icon + gap : 0) + (left ? 16 + gap : 0))
            .child(div().flex_1().min_w(0).truncate().text_size(S.detailText).text_color(S.detailColor || t.dim).child(studioMore))
            .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
            .when(this.hovered === a.address, el => el.child(pin))
            .when(this.hovered !== a.address && Boolean(when) && S.time, el => el.child(div().flex_none().text_size(S.timeText).text_color(S.timeColor || t.dim).child(duration(now - when))))
            .when(!left, (el) => el.child(this.status(t, a, (byPriority && !isPinned) || !S.badge))));
      }
`],
  // A card from the designer reads terminal labels: once per render, and only then.
  ["    const leads = leadPanes(panes());\n", "    const leads = leadPanes(panes());\n    const studioLabels = studioAgents().card ? new Map(terminals().map((x) => [x.address, x.labels || {}])) : null;\n"],
  // One line: the same order as two.
  [".when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\\u00b7 ${more}`))))",
    ".when(Boolean(studioMore), el => el.child(div().flex_1().min_w(0).truncate().text_color(studioAgents().detailColor || t.dim).child(`\\u00b7 ${studioMore}`))))"],
];
// --- Parts and inheritance ---------------------------------------------------------------------
// A theme's type, cursor, glass and agents list are each its own, inherited from another theme
// ("from:<name>"), or "default": the theme Settings › Defaults names for that part in its mode.
// The source is `ex.src[part]`; older saves have none, so a saved part is its own.
export const PARTS = ["type", "cursor", "glass", "agents"];
export const PART_LABEL = { type: "Type", cursor: "Cursor", glass: "Glass", agents: "Agents list" };

/** "own", "default" or "from:<name>" for one part of a theme's extras. */
export function partSource(ex, part) {
  const s = ex && ex.src && ex.src[part];
  return s || (ex && ex[part] ? "own" : "default");
}

/** Follows a part to where its values live. `ctx`: { all: name → extras, defaults: { dark, light }
 *  (part → theme), light(name) }. Returns { value (null: Herdr's), why: own | inherit | default |
 *  herdr, from (the theme it points at), chain (every theme visited) }. A loop ends at Herdr's. */
export function resolvePart(ctx, name, part, seen = []) {
  if (seen.includes(name)) return { value: null, why: "herdr", from: null, chain: seen };
  const chain = [...seen, name], ex = ctx.all[name], src = partSource(ex, part);
  if (src === "own") return ex && ex[part] ? { value: ex[part], why: "own", from: null, chain } : { value: null, why: "herdr", from: null, chain };
  if (src.startsWith("from:")) {
    const f = src.slice(5), r = resolvePart(ctx, f, part, chain);
    return { ...r, why: "inherit", from: f };
  }
  const d = ((ctx.defaults || {})[ctx.light(name) ? "light" : "dark"] || {})[part];
  if (d && d !== name) { const r = resolvePart(ctx, d, part, chain); return { ...r, why: "default", from: d }; }
  return { value: null, why: "herdr", from: null, chain };
}

/** The themes whose `part` reaches `name` (inherited, or through a default), not counting itself. */
export function dependents(ctx, name, names) {
  const out = [];
  for (const n of names) if (n !== name) for (const p of PARTS) if (resolvePart(ctx, n, p).chain.slice(1).includes(name)) out.push([n, p]);
  return out;
}

/** One part as shareable JSON, and back. */
export const PART_TAG = "theme-studio-part";
export function partJson(part, value, name) { return JSON.stringify({ [PART_TAG]: 1, kind: part, name, value }, null, 2); }
export function parsePart(text) {
  let j; try { j = JSON.parse(String(text || "")); } catch { return { error: "That isn't a Theme Studio part (it's not JSON)" }; }
  if (!j || j[PART_TAG] !== 1 || !PARTS.includes(j.kind) || !j.value || typeof j.value !== "object") return { error: "That isn't a Theme Studio part" };
  return { kind: j.kind, value: j.value, name: j.name || "" };
}

// --- Updates ------------------------------------------------------------------------------------
// The Studio compares its mod.json version with the repo's latest GitHub release and can install
// that release over itself. studioUpdate runs in the Studio and, as source, in the footer clone
// (whose palette icon is always mounted), so it uses nothing but its arguments and versionNewer.
// What it found is in shared "theme-studio.update"; the auto-update switch is "theme-studio.autoupdate".
export const UPDATE_KEY = "theme-studio.update";
export const AUTO_UPDATE_KEY = "theme-studio.autoupdate";

/** a is a later version than b ("0.6.0" > "0.5.2"; a leading v is ignored). */
export function versionNewer(a, b) {
  const p = (v) => String(v || "0").replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/** Checks for a newer release (at most every 6 hours unless `force`) and installs it when asked
 *  (`install`) or when auto-update is on. Posts a toast once per new version, and after every
 *  install. `h`: { exec, shared, setShared, notify, read(path) -> text, home }. */
export async function studioUpdate(h, o = {}) {
  const KEY = "theme-studio.update", REPO = "agentic-tool-labs/herdr-theme-studio", dir = `${h.home}/mods/theme-studio`;
  const open = { name: "mod.open", args: { name: "theme-studio" } };
  const st = h.shared(KEY) || {};
  let mine = "0.0.0";
  try { mine = JSON.parse((await h.read(`${dir}/mod.json`)) || "{}").version || mine; } catch {}
  let next = { ...st, installed: mine };
  if (o.force || !st.checked || Date.now() - st.checked > 6 * 3600e3) {
    const r = await h.exec("curl", ["-fsSL", "--max-time", "15", "-H", "Accept: application/vnd.github+json", `https://api.github.com/repos/${REPO}/releases/latest`]).catch(() => null);
    let j = null;
    try { j = r && r.code === 0 ? JSON.parse(r.stdout) : null; } catch {}
    next = { ...next, checked: Date.now(), offline: !(j && j.tag_name) };
    if (j && j.tag_name) next = { ...next, latest: String(j.tag_name).replace(/^v/, ""), url: j.html_url || "", notes: String(j.body || "").slice(0, 800) };
  }
  const newer = versionNewer(next.latest, mine);
  // One install at a time, across the Studio and the footer.
  const busy = st.installing && Date.now() - st.installing < 120e3;
  // Auto-update waits while the Studio has unsaved changes: the new files reload it.
  const auto = o.auto !== false && h.shared("theme-studio.autoupdate") && !h.shared("theme-studio.editing");
  if (newer && !busy && (o.install || auto)) {
    h.setShared(KEY, { ...next, installing: Date.now(), failed: "" });
    // The release's mods/theme-studio, checked by Herdr, replaces this folder; the old one is
    // kept until the new one is in place. Herdr's generated typings are carried over.
    const sh = `set -e
tag="$1"; dest="$2"; repo="$3"; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsSL --max-time 90 "https://codeload.github.com/$repo/tar.gz/refs/tags/$tag" | tar -xz -C "$tmp"
src=$(find "$tmp" -maxdepth 3 -type d -path "*/mods/theme-studio" | head -n 1)
[ -n "$src" ] && [ -f "$src/main.js" ] && [ -f "$src/mod.json" ] || { echo "The download has no Theme Studio in it" >&2; exit 1; }
rm -f "$src/lib.test.mjs"
herdr-app check "$src" >/dev/null 2>&1 || { echo "Herdr's check refused $tag" >&2; exit 1; }
for f in gpui-kit.d.ts jsconfig.json; do [ -f "$dest/$f" ] && cp "$dest/$f" "$src/$f"; done
mv "$dest" "$tmp/old" && mv "$src" "$dest" || { [ -d "$tmp/old" ] && [ ! -d "$dest" ] && mv "$tmp/old" "$dest"; echo "Couldn't swap the files in" >&2; exit 1; }`;
    const r = await h.exec("sh", ["-c", sh, "sh", `v${next.latest}`, dir, REPO]).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code === 0) {
      next = { ...next, installed: next.latest, installing: 0, failed: "", told: next.latest };
      h.setShared(KEY, next);
      // An open Studio keeps running the old files until it's closed, so it's closed and opened
      // again, by a shell that outlives the Studio (mod.open toggles it). Only when it's open.
      const reopen = `sleep 0.5; herdr-app status 2>/dev/null | tr -d ' \\n' | grep -q '"overlays":\\[[^]]*"theme-studio"' || exit 0
herdr-app do mod.open '{"name":"theme-studio"}'; sleep 1.5; herdr-app do mod.open '{"name":"theme-studio"}'`;
      await h.exec("sh", ["-c", `(${reopen}) >/dev/null 2>&1 </dev/null &`]).catch(() => {});
      h.notify({ title: `Theme Studio updated to v${next.latest}`, body: `Was v${mine}. An open Studio reopens with it; if yours didn't, close and open it.`, level: "success", action: open });
      return { ...next, newer: false, updated: next.latest };
    }
    next = { ...next, installing: 0, failed: String(r.stderr || r.stdout || "the install failed").trim().split("\n").pop() };
    h.setShared(KEY, next);
    h.notify({ title: "Theme Studio couldn't update", body: next.failed, level: "error", action: open });
    return { ...next, newer };
  }
  if (newer && st.told !== next.latest && !o.quiet) {
    next.told = next.latest;
    h.notify({ title: `Theme Studio v${next.latest} is available`, body: `You have v${mine}. Open the Studio to update.`, level: "info", action: open });
  }
  if (JSON.stringify(next) !== JSON.stringify(st)) h.setShared(KEY, next);
  return { ...next, newer };
}

// --- Card designer ------------------------------------------------------------------------------
// A card is rows of items, laid out like CSS flexbox:
//   { rows: [{ items: [{ kind, grow, truncate, max, role, badge, id, size, color, weight }], wrap, justify, gap, indent }] }
// An item's size, color and weight are its own; left unset, they come from its role (name, detail, time).
// A label item ({ kind: "label", id }) shows a Herdr terminal label. Its look is defined once, in
// the settings' `labels`: [{ id, key, style: "text" | "pill", prefix, color, missing: "hide" | "text", text }].
export const CARD_ITEMS = [["status", "Status"], ["icon", "Icon"], ["name", "Name"], ["title", "Title"], ["space", "Space"], ["time", "Time"], ["machine", "Machine"]];
export const isTextItem = (it) => ["name", "title", "space", "machine", "label"].includes(it.kind);

/** The card today's switches draw (lines, lead, show, statusSide, icons, time, badge). */
export function cardFrom(a) {
  const st = { kind: "status", badge: a.badge !== false };
  const left = a.statusSide === "left", icon = a.icons !== false ? [{ kind: "icon" }] : [], time = a.time !== false ? [{ kind: "time" }] : [];
  const texts = a.show === "name" ? [{ kind: "name" }] : a.show === "both" ? [{ kind: "name" }, { kind: "title" }] : [{ kind: "title" }];
  const words = a.lead === "session" ? [...texts, { kind: "space" }] : [{ kind: "space" }, ...texts];
  if (a.lines === "two") {
    const [first, ...rest] = words;
    return { rows: [
      { items: [...(left ? [st] : []), ...icon, { ...first, grow: true, truncate: true }] },
      { indent: true, justify: "end", items: [...rest.map((it, i) => ({ ...it, grow: i === 0, truncate: true })), { kind: "machine" }, ...time, ...(left ? [] : [st])] },
    ] };
  }
  const shown = words.map((it, i) => ({ ...it, grow: true, truncate: true, max: i < words.length - 1 ? 120 : 0 }));
  return { rows: [{ wrap: a.lines === "auto", items: [...(left ? [st] : []), ...icon, ...shown, { kind: "machine" }, ...time, ...(left ? [] : [st])] }] };
}

/** The starting points the designer offers, from the switches they replace. */
export const CARD_STARTS = [["one", "One line", { lines: "one" }], ["two", "Two lines", { lines: "two" }], ["auto", "Wraps", { lines: "auto" }], ["both", "Named", { lines: "two", show: "both" }]];

/** One agent card's rows. `d` is the agent: its texts, labels and the elements its list already
 *  builds (status, icon, pin, fold). Runs in the Studio's preview and, as source, in the agents clone,
 *  so it uses nothing but its arguments. */
export function studioDrawCard(card, d, S, t, ui) {
  const { div, h_flex, v_flex } = ui;
  const defs = S.labels || [];
  const gap = (r) => (r.gap != null ? r.gap : S.row < 26 ? 6 : 9);
  const weigh = (el, w) => w === "bold" ? el.font_bold() : w === "semibold" ? el.font_semibold() : w === "medium" ? el.font_medium() : el;
  // A role's look, then the item's own size, color and weight over it.
  const look = (el, role, it) => {
    const r = role === "name" ? [S.text, S.nameColor || (d.idle ? t.muted : t.foreground), S.weight]
      : role === "time" ? [S.timeText, S.timeColor || t.dim, "normal"]
      : role === "accent" ? [S.detailText, t.accent, "normal"]
      : [S.detailText, S.detailColor || t.dim, "normal"];
    return weigh(el.text_size(it.size || r[0]).text_color(it.color || r[1]), it.weight || r[2]);
  };
  const text = (it) => {
    if (it.kind === "name") return d.name() || d.title;
    if (it.kind === "title") return d.title;
    if (it.kind === "space") return d.space;
    if (it.kind === "machine") return d.machine || "";
    const def = defs.find((l) => l.id === it.id);
    if (!def) return "";
    const v = (d.labels || {})[def.key];
    return v ? (def.prefix || "") + v : def.missing === "text" ? def.text || "" : "";
  };
  // grow: takes the spare width (flex: 1, or flex: auto in a row that wraps, so it can move down).
  const size = (el, it, wrap) => {
    el = it.grow ? (wrap ? el.flex_auto() : el.flex_1()) : el;
    el = el.min_w(0);
    el = it.truncate === false ? el.whitespace_nowrap().flex_none() : el.truncate();
    return it.max > 0 ? el.max_w(it.max) : el;
  };
  const seen = new Set();
  let first = true;
  const item = (it, wrap) => {
    if (it.kind === "status") return it.badge !== false ? div().flex_none().child(d.status(true))
      : h_flex().w(16).flex_none().items_center().justify_center().child(d.status(false));
    if (it.kind === "icon") return d.icon ? d.icon(it.size || S.icon) : null;
    if (it.kind === "time") return d.hovered && d.pin ? d.pin : d.time ? look(div().flex_none().whitespace_nowrap(), "time", it).child(d.time) : null;
    const s = text(it);
    // Empty takes no room, and a text already on the card isn't said twice.
    if (!s || (it.kind !== "label" && seen.has(s))) return null;
    seen.add(s);
    const def = it.kind === "label" ? defs.find((l) => l.id === it.id) : null;
    if (def && def.style === "pill") {
      const c = it.color || t[def.color] || def.color || t.accent;
      return size(weigh(div().px(6).rounded(5).bg(c.slice(0, 7) + "26").text_color(c).text_size(it.size || S.badgeText), it.weight || "semibold"), it, wrap).child(s);
    }
    const role = it.role && it.role !== "auto" ? it.role : first ? "name" : "detail";
    first = false;
    return size(look(div(), role, it), it, wrap).child(s);
  };
  // "Under the name": row 1's status and icon, measured.
  const lead = (((card.rows || [])[0] || {}).items || []).reduce((acc, it) => acc.done || isText(it) ? { ...acc, done: true }
    : { done: false, px: acc.px + (it.kind === "icon" ? it.size || S.icon : it.kind === "status" ? 16 : 0) + gap(card.rows[0]) }, { done: false, px: 0 }).px;
  function isText(it) { return ["name", "title", "space", "machine", "label"].includes(it.kind); }
  const built = (card.rows || []).map((r) => (r.items || []).map((it) => ({ el: item(it, !!r.wrap), text: isText(it) })).filter((x) => x.el));
  // The first row always names the agent: when its texts are all empty (a Space under its own
  // header), the next text moves up.
  if (built.length > 1 && !built[0].some((x) => x.text)) {
    const from = built.findIndex((b) => b.some((x) => x.text));
    if (from > 0) { const i = built[from].findIndex((x) => x.text); built[0].push(...built[from].splice(i, 1)); }
  }
  const rows = (card.rows || []).map((r, ri) => {
    const els = built[ri].map((x) => x.el);
    if (ri === 0 && d.fold) els.push(d.fold);
    if (!els.length) return null;
    let row = h_flex().min_w(0).items_center().gap(gap(r)).min_h(ri === 0 ? Math.max(16, S.row - 6) : 18);
    if (r.wrap) row = row.flex_wrap();
    const j = { center: "justify_center", end: "justify_end", between: "justify_between" }[r.justify];
    if (j) row = row[j]();
    if (r.indent && ri > 0) row = row.pl(lead);
    return row.children(els);
  }).filter(Boolean);
  return v_flex().w_full().min_w(0).gap(1).children(rows);
}

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
// A card's own background and border, when set.
function studioCard(el) {
  const s = studioAgents();
  return (s.cardColor ? el.bg(s.cardColor) : el).when(Boolean(s.borderColor), (e) => e.border_1().border_color(s.borderColor));
}
// A card from the designer. The Studio's own preview runs this same function.
${studioDrawCard.toString()}
// The status on the left: compact, in a fixed box so names line up.
function studioLeft(status) { return h_flex().w(16).flex_none().items_center().justify_center().child(status); }
function studioWeight(el) {
  const w = studioAgents().weight;
  return w === "bold" ? el.font_bold() : w === "semibold" ? el.font_semibold() : w === "medium" ? el.font_medium() : el;
}
// One line, two, or "auto": two when the name (and its detail) wouldn't fit beside the time and status.
// ponytail: width estimated from the character count (about 0.56em a character); mods can't measure text.
function studioTwoLines(name, more) {
  const s = studioAgents();
  if (s.lines !== "auto") return s.lines === "two";
  const room = (find(layout(), "sidebar")?.size?.px ?? 268) - 32 - (s.icons ? s.icon + 9 : 0) - (s.time ? 30 : 0) - 24;
  return (String(name).length + (more ? more.length + 3 : 0)) * s.text * 0.56 > room;
}
`;
  const at = out.indexOf("\n", out.indexOf('from "herdr";')) + 1;
  return out.slice(0, at) + helper + STUDIO_NAMES + out.slice(at);
}

// Claude Code keeps each running session in ~/.claude/sessions/<pid>.json, with its /rename name
// (nameSource "user"); the process's environment says which Herdr terminal it runs in.
const STUDIO_NAMES = `import { exec as studioExec } from "herdr";
const STUDIO_NAMES_SH = 'for f in "$HOME"/.claude/sessions/*.json; do p=\${f##*/}; p=\${p%.json}; t=$(ps eww -o command= -p "$p" 2>/dev/null | tr " " "\\\\n" | sed -n "s/^HC_TERMINAL_ID=//p" | head -n 1); [ -n "$t" ] && printf "%s\\\\t%s\\\\n" "$t" "$(tr -d "\\\\n" < "$f")"; done; true';
const studioNames = new Map();
let studioNamesAt = 0;
// The /rename name of the session in a terminal, or "". ponytail: re-read every 5 s through ps; fine for dozens of sessions.
function studioName(address) {
  if (Date.now() - studioNamesAt > 5000) {
    studioNamesAt = Date.now();
    studioExec("sh", ["-c", STUDIO_NAMES_SH]).then((r) => {
      studioNames.clear();
      for (const l of r.stdout.split("\\n")) {
        const i = l.indexOf("\\t");
        try { const s = JSON.parse(l.slice(i + 1)); if (i > 0 && s.nameSource === "user" && s.name) studioNames.set(l.slice(0, i), s.name); } catch {}
      }
    }, () => {});
  }
  return studioNames.get(address) || "";
}
`;

/** The Studio's copy of one of Herdr's layouts: theme-studio for main, theme-studio-<layout> for the others. */
export const copyName = (from) => (from === "main" ? "theme-studio" : `theme-studio-${from}`);
// Names a Studio copy went by before theme-studio, besides <layout>-studio: the layout each copies.
const OLD_COPIES = { "poc-layout": "main" };
/** What an older Studio called that copy, as [old name, new name], else null. */
export const olderCopy = (name, shipped) => {
  if (Object.hasOwn(OLD_COPIES, name || "")) return [name, copyName(OLD_COPIES[name])];
  const m = /^(.+)-studio$/.exec(name || "");
  return m && shipped.includes(m[1]) ? [name, copyName(m[1])] : null;
};
/** keys.json text with a layout's own section moved to another name, or null when it has none. */
export function moveKeySection(text, from, to) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== "object" || !(`layout:${from}` in j) || `layout:${to}` in j) return null;
  const out = {};
  for (const [k, v] of Object.entries(j)) out[k === `layout:${from}` ? `layout:${to}` : k] = v;
  return JSON.stringify(out, null, 2) + "\n";
}

/** Two parts hold the same values (key order aside). */
export const sameParts = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].every((k) => JSON.stringify((a || {})[k]) === JSON.stringify((b || {})[k]));

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
  bloom: "", bloomBase: "canvas", glowA: "accent", glowB: "ansi5", glowC: "ansi6", glowIntensity: 100, glows: "" };
/** Glass fields a layout tree can't give back (the bloom's colors and spots), kept beside it in shared state. */
export const GLASS_EXTRA = ["bloomBase", "glowA", "glowB", "glowC", "glowIntensity", "glows"];

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

/** The bloom's glows as a list, each {c, x, y, s, r, a}: its color (a theme token or hex), where it
 *  sits (fractions of the window from its top left), its own strength (percent, on top of
 *  glowIntensity), its radius and its strength at 100%. Kept in the glass as `glows`, JSON text so a
 *  staged list compares by value. A bloom saved before the list (glowA/B/C) reads as its three glows. */
const LEGACY_GLOWS = [["glowA", "accent", 0.16, 0.14, 0.3, 0.55], ["glowB", "ansi5", 0.88, 0.48, 0.26, 0.45], ["glowC", "ansi6", 0.42, 0.96, 0.28, 0.4]];
export const MAX_GLOWS = 8;
/** The color a glow added (or reset) at index i starts from. */
export const glowColor = (i) => ["accent", "ansi5", "ansi6", "ansi4", "ansi2", "ansi3", "ansi1", "ansi13"][i % 8];
export function glowList(g) {
  const ok = (o) => o && typeof o.c === "string" && [o.x, o.y].every((n) => n >= 0 && n <= 1);
  try {
    const l = JSON.parse(g.glows);
    if (Array.isArray(l)) return l.filter(ok).slice(0, MAX_GLOWS).map((o) => ({ c: o.c, x: o.x, y: o.y, s: o.s ?? 100, r: o.r ?? 0.27, a: o.a ?? 0.45 }));
  } catch {}
  return LEGACY_GLOWS.map(([k, c, x, y, r, a]) => ({ c: g[k] || c, x, y, s: 100, r, a }));
}
export const glowsText = (l) => JSON.stringify(l.map((o) => ({ ...o, x: +o.x.toFixed(3), y: +o.y.toFixed(3) })));
/** A new glow: the next color, at whichever of a few spots is farthest from the glows already there. */
const GLOW_SPOTS = [[0.5, 0.5], [0.8, 0.2], [0.2, 0.8], [0.25, 0.3], [0.75, 0.75], [0.5, 0.15], [0.12, 0.5], [0.88, 0.85]];
export function newGlow(l) {
  const room = ([x, y]) => Math.min(...l.map((o) => Math.hypot(o.x - x, o.y - y)), 9);
  const [x, y] = GLOW_SPOTS.reduce((best, p) => (room(p) > room(best) ? p : best));
  return { c: glowColor(l.length), x, y, s: 100, r: 0.27, a: 0.45 };
}

/** What bloom.jxa.js draws: the base color and the glows (colors already resolved to hex), each at
 *  `intensity` (all glows) times its own strength. Positions are fractions of the picture, origin
 *  bottom left as Core Image has it. */
export function bloomSpec(base, glows, intensity) {
  return { w: 1600, h: 1000, base: normHex(base).slice(0, 7),
    glows: glows.map((o) => ({ c: normHex(o.c).slice(0, 7), x: o.x, y: 1 - o.y, r: o.r, a: Math.min(1, (o.a * intensity * o.s) / 10000) })) };
}

/** Reads the glass settings back out of a layout tree (inverse of applyGlass, best effort). */
// Auto-hide: the sidebar folded to Herdr's rail (`rail` px), or hidden outright (mode "hidden"),
// and an empty floating block (the Studio's "edge" part) that watches the pointer and opens it.
// The block's props carry the mode. Off takes the watcher away and opens the sidebar at `wide` px.
export const EDGE_ID = "studio-edge";
export const autoHideMode = (tree) => { const f = ((tree && tree.floating) || []).find((b) => b.id === EDGE_ID); return f ? f.content.props.mode || "rail" : null; };
export function withAutoHide(tree, on, rail, wide, mode = "rail") {
  const t = JSON.parse(JSON.stringify(tree)), sb = findNode(t, "sidebar");
  if (!sb) return null;
  delete sb.hidden;
  if (on && mode === "hidden") sb.hidden = true;
  sb.size = { px: on && mode === "rail" ? rail : wide };
  if (on && mode === "rail") sb.min = Math.min(sb.min ?? rail, rail); // narrower than Herdr's own rail
  t.floating = (t.floating || []).filter((f) => f.id !== EDGE_ID);
  if (on) t.floating.push({ id: EDGE_ID, content: { mod: "theme-studio", props: { part: "edge", mode } }, edge: "left", align: "end" });
  if (!t.floating.length) delete t.floating;
  return t;
}

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
export const findNode = (n, id) => (n.id === id ? n : (n.children || []).reduce((f, c) => f || findNode(c, id), null));
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
// The update dot on Settings, whatever it draws (Herdr 0.1.14 moves it on the rail), and the paren closing the row.
const SETTINGS_DOT = /(\s*\.when\(Boolean\(updates\(\)\.app\.ready\), el => el\.child\([^\n]*\)\))\)/;

export const FOOTER_PATCH = "theme-studio footer patch v4";

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
// narrow rail) that opens Theme Studio, with a dot when an update is ready.
import { exec as studioExec, notify as studioNotify, readTextFile as studioRead, appHome as studioHome } from "herdr";
const STUDIO_ROW = 28;
${versionNewer.toString()}
${studioUpdate.toString()}
// The footer is always mounted, so it looks for Studio updates while the Studio is closed.
// studioUpdate goes to the network at most every 6 hours.
let studioWatching = false;
function studioUpdates(cx) {
  if (studioWatching || !props()?.footer) return;
  studioWatching = true;
  const h = { exec: studioExec, shared, setShared, notify: studioNotify, read: studioRead, home: studioHome() };
  const tick = () => { studioUpdate(h).catch(() => {}); };
  cx.timer.after(5000, tick);
  cx.timer.every(30 * 60e3, tick);
}
function studioDot(el, t) {
  const u = shared("theme-studio.update") || {};
  const ready = versionNewer(u.latest, u.installed);
  return el.relative().tooltip(ready ? \`Theme Studio: v\${u.latest} is ready to install\` : "Theme Studio")
    .when(ready, (e) => e.child(div().absolute().top(2).right(2).size(7).rounded(4).bg(t.accent)));
}
function studioIcon(t) {
  return studioDot(div().id("theme-studio").size(26).flex_none().flex().items_center().justify_center().rounded(6)
    .text_color(t.muted).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
    .on_click(() => run("mod.open", { name: "theme-studio" }))
    .child(svg("mods/theme-studio/palette.svg").size(14)), t);
}
function studioRail(t) {
  return studioDot(h_flex().id("theme-studio-rail").h(STUDIO_ROW).px(8).items_center().rounded(8).text_color(t.muted).cursor_pointer()
    .hover(s => s.bg(t.hover).text_color(t.foreground))
    .on_click(() => run("mod.open", { name: "theme-studio" }))
    .child(svg("mods/theme-studio/palette.svg").size(14)), t);
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
  out = out.replace(/\n  render\(\) \{/, "\n  render(cx) {\n    studioFit(cx);\n    studioUpdates(cx);");
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

// --- sharing themes ------------------------------------------------------------
// A published theme is a Herdr theme file plus a "studio" block (its parts and details), with any
// picture beside it, its path relative to the file. tools/publish-theme.py writes one.

const META_KEYS = ["description", "author", "url", "ios", "android", "macos"];
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Only what a studio block may carry: part objects and string details. Comes from strangers. */
export function cleanStudio(s) {
  if (!isObj(s)) return null;
  const out = {};
  for (const p of PARTS) if (isObj(s[p])) out[p] = s[p];
  if (typeof s.preview === "string") out.preview = s.preview;
  if (isObj(s.meta)) out.meta = Object.fromEntries(META_KEYS.filter((k) => typeof s.meta[k] === "string").map((k) => [k, s.meta[k].slice(0, 2000)]));
  return out;
}

/** A studio block as a saved theme's extras: its own parts, Herdr's for the rest, details fixed. */
export function studioExtras(s) {
  const ex = { src: Object.fromEntries(PARTS.map((q) => [q, s[q] ? "own" : "default"])), meta: s.meta || {} };
  for (const q of PARTS) if (s[q]) ex[q] = s[q];
  return ex;
}

/** A repo's herdr-themes.json → its theme files: .json paths inside the repo, at most 20. */
export function manifestThemes(m) {
  return (isObj(m) && Array.isArray(m.themes) ? m.themes : []).filter((f) => typeof f === "string" && /\.json$/i.test(f) && !f.startsWith("/") && !f.split("/").includes("..")).slice(0, 20);
}
/** Browse themes lists a theme only with a preview picture, a description and an author. */
export const browsable = (s) => !!(s && isPicture(s.preview) && s.meta && s.meta.description && s.meta.author);

/** dir + a relative path, with . and .. resolved ("a/b" + "../c.jpg" = "a/c.jpg"). */
export function joinPath(dir, rel) {
  const out = [];
  for (const p of `${dir}/${rel}`.split("/")) { if (p === "..") out.pop(); else if (p !== ".") out.push(p); }
  return out.join("/");
}

export const isPicture = (p) => /\.(jpe?g|png|heic|webp|gif)$/i.test(p || "");
/** A name worth offering from a folder: theme formats, or no extension (Ghostty's), not docs. */
export const isThemeFile = (n) => /\.(json|itermcolors|toml|conf|ya?ml)$/i.test(n) || (!n.includes(".") && !/^(license|readme|copying|changelog|makefile|dockerfile|authors)$/i.test(n));

/** A GitHub link → { kind: "file", raw, name } | { kind: "dir" | "gist", api, title } | null. */
export function githubLink(link) {
  let u = String(link || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (/^(github\.com|raw\.githubusercontent\.com|gist\.github\.com)\//i.test(u)) u = `https://${u}`;
  const file = (raw) => ({ kind: "file", raw, name: decodeURIComponent(raw.split("/").pop()) });
  let m;
  if (/^https:\/\/(raw|gist)\.githubusercontent\.com\/[^/]+\/[^/]+\/.+/i.test(u)) return file(u);
  if ((m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\/(.+)$/i.exec(u))) return file(`https://raw.githubusercontent.com/${m[1]}/${m[2]}`);
  if ((m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/tree\/([^/]+)(?:\/(.+))?$/i.exec(u))) return { kind: "dir", api: `https://api.github.com/repos/${m[1]}/contents/${m[3] || ""}?ref=${m[2]}`, title: [m[1], m[3]].filter(Boolean).join("/") };
  if ((m = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i.exec(u))) return { kind: "dir", api: `https://api.github.com/repos/${m[1]}/contents/`, title: m[1] };
  if ((m = /^https:\/\/gist\.github\.com\/(?:[^/]+\/)?([0-9a-f]+)$/i.exec(u))) return { kind: "gist", api: `https://api.github.com/gists/${m[1]}`, title: "gist" };
  return null;
}

/** GitHub's API answer for a folder or gist → { dirs: [{name, api}], files: [{name, raw}] }. */
export function githubEntries(j) {
  if (isObj(j) && isObj(j.files)) return { dirs: [], files: Object.values(j.files).filter((f) => isObj(f) && f.raw_url && isThemeFile(f.filename || "")).map((f) => ({ name: f.filename, raw: f.raw_url })) };
  const l = Array.isArray(j) ? j : [];
  const by = (a, b) => a.name.localeCompare(b.name);
  return {
    dirs: l.filter((e) => e.type === "dir" && !e.name.startsWith(".") && e.name !== "backgrounds").map((e) => ({ name: e.name, api: e.url })).sort(by),
    files: l.filter((e) => e.type === "file" && e.download_url && isThemeFile(e.name)).map((e) => ({ name: e.name, raw: e.download_url })).sort(by),
  };
}
