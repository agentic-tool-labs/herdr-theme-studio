// node mods/theme-studio/lib.test.mjs — exits nonzero on the first failure.
import assert from "node:assert/strict";
import { liftContrast, breakLigatures, patchFooter, FOOTER_PATCH, withFooterIcon, hasFooterIcon, FOOTER_MOD, patchHeader, ROUNDED_HEADER, withButton, hasButton, contrast, withAlpha, normHex, mergeSettings, themeFileFrom, setToken, parseTheme, applyGlass, readGlass, sortFonts, hexToHsla, hslaToHex, bloomSpec, glowList, glowsText, newGlow, MAX_GLOWS, GLASS_DEFAULT, cursorCode, patchAgents, withAgentsMod, AGENTS_MOD, withAutoHide, EDGE_ID, autoHideMode, cardFrom, studioDrawCard, AGENTS_DEFAULT, versionNewer, studioUpdate, resolvePart, partSource, dependents, partJson, parsePart, sameParts, copyName, olderCopy, moveKeySection } from "./lib.js";
import { readFileSync, existsSync } from "node:fs";

// contrast
assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
assert.equal(contrast("#777777", "#777777"), 1);
assert.ok(Math.abs(contrast("#767676", "#ffffff") - 4.54) < 0.01);
assert.equal(contrast("#ffffff00", "#000000"), 1, "fully transparent fg is the bg");

// hex
assert.equal(normHex("ABC"), "#aabbcc");
assert.equal(normHex("0x1a1b26"), "#1a1b26");
assert.equal(normHex("#12345"), null);
assert.equal(withAlpha("#101114", 0.5), "#10111480");
assert.equal(withAlpha("#10111499", 1), "#101114");

// settings merge keeps foreign keys, deletes on null, merges colors
const s = mergeSettings({ zoom: 1, sounds: { enabled: false }, colors: { accent: "#111111" } }, { font: "Menlo", zoom: null, colors: { accent: null, border: "#222222" } });
assert.deepEqual(s, { sounds: { enabled: false }, font: "Menlo", colors: { border: "#222222" } });
assert.deepEqual(mergeSettings({ colors: { a: "#000000" } }, { colors: { a: null } }), {});

// theme files
const c = { background: "#17191d", terminal_foreground: "#d2d4d9", foreground: "#eeeeef", selection: "#394454", cursor: "#d2d4d9" };
for (let i = 0; i < 16; i++) c["ansi" + i] = "#0000" + i.toString(16).padStart(2, "0");
const f = themeFileFrom(c);
assert.equal(f.foreground, "#d2d4d9");
assert.equal(f.ansi[15], "#00000f");
let g = setToken(f, "accent", "#ff8800");
assert.equal(g.colors.accent, "#ff8800");
assert.equal(f.colors, undefined, "setToken does not mutate");
g = setToken(g, "terminal_foreground", "#ffffff");
assert.equal(g.foreground, "#ffffff");
g = setToken(g, "ansi3", "#333333");
assert.equal(g.ansi[3], "#333333");
g = setToken(g, "accent", null);
assert.equal(g.colors, undefined);

// importers
const ghostty = `# Tokyo Night
palette = 0=#15161e
palette = 1=#f7768e
palette = 2=#9ece6a
palette = 3=#e0af68
palette = 4=#7aa2f7
palette = 5=#bb9af7
palette = 6=#7dcfff
palette = 7=#a9b1d6
palette = 8=#414868
palette = 9=#f7768e
palette = 10=#9ece6a
palette = 11=#e0af68
palette = 12=#7aa2f7
palette = 13=#bb9af7
palette = 14=#7dcfff
palette = 15=#c0caf5
background = #1a1b26
foreground = #c0caf5
cursor-color = #c0caf5
selection-background = #283457`;
const gt = parseTheme(ghostty);
assert.equal(gt.background, "#1a1b26");
assert.equal(gt.selection, "#283457");
assert.equal(gt.ansi[15], "#c0caf5");

const kitty = ["background #282828", "foreground #ebdbb2", "cursor #ebdbb2", "selection_background #504945"]
  .concat(Array.from({ length: 16 }, (_, i) => `color${i} #10101${i.toString(16)}`)).join("\n");
const kt = parseTheme(kitty);
assert.equal(kt.foreground, "#ebdbb2");
assert.equal(kt.ansi[10], "#10101a");

const alacritty = `[colors.primary]
background = '#2e3440'
foreground = '#d8dee9'
[colors.normal]
black = '#3b4252'
red = '#bf616a'
green = '#a3be8c'
yellow = '#ebcb8b'
blue = '#81a1c1'
magenta = '#b48ead'
cyan = '#88c0d0'
white = '#e5e9f0'
[colors.bright]
black = '#4c566a'
red = '#bf616a'
green = '#a3be8c'
yellow = '#ebcb8b'
blue = '#81a1c1'
magenta = '#b48ead'
cyan = '#8fbcbb'
white = '#eceff4'
[colors.selection]
background = '#434c5e'`;
const at = parseTheme(alacritty);
assert.equal(at.background, "#2e3440");
assert.equal(at.ansi[8], "#4c566a");
assert.equal(at.ansi[14], "#8fbcbb");
assert.equal(at.selection, "#434c5e");
assert.equal(at.cursor, "#d8dee9", "cursor falls back to foreground");
assert.throws(() => parseTheme("background = #000000\nforeground = #ffffff"), /of 16/);

// iTerm2 plist: components are 0..1 reals
const comp = (r, g, b) => `<dict><key>Alpha Component</key><real>1</real><key>Blue Component</key><real>${b}</real><key>Color Space</key><string>sRGB</string><key>Green Component</key><real>${g}</real><key>Red Component</key><real>${r}</real></dict>`;
const iterm = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>\n`
  + Array.from({ length: 16 }, (_, i) => `<key>Ansi ${i} Color</key>\n${comp(i / 15, 0, 1)}\n`).join("")
  + `<key>Background Color</key>${comp(0.10196, 0.10588, 0.14902)}<key>Foreground Color</key>${comp(0.75294, 0.79216, 0.96078)}`
  + `<key>Selection Color</key>${comp(0.15686, 0.20392, 0.34118)}</dict></plist>`;
const it = parseTheme(iterm);
assert.equal(it.background, "#1a1b26");
assert.equal(it.foreground, "#c0caf5");
assert.equal(it.selection, "#283457");
assert.equal(it.cursor, "#c0caf5", "no Cursor Color falls back to foreground");
assert.equal(it.ansi[0], "#0000ff");
assert.equal(it.ansi[15], "#ff00ff");
assert.throws(() => parseTheme(iterm.replace(/<key>Ansi 7 Color<\/key>/, "<key>Nope</key>")), /15 of 16/);
// themes with only (Dark)/(Light) variants: Dark wins, plain keys win over both
const dual = iterm.replace(/<key>([^<]+ Color)<\/key>/g, "<key>$1 (Dark)</key>") + iterm.replace(/<key>Background Color<\/key>[\s\S]*?<\/dict>/, `<key>Background Color (Light)</key>${comp(1, 1, 1)}`).replace(/<key>([^<]+ Color)<\/key>/g, (m, k) => k.endsWith(")") ? m : `<key>${k} (Light)</key>`);
assert.equal(parseTheme(dual).background, "#1a1b26");
assert.equal(parseTheme(dual).ansi[15], "#ff00ff");
assert.throws(() => parseTheme("bplist00\u0000\u0001"), /binary plist/);
assert.throws(() => parseTheme("/Users/jim/Downloads/coolnight.itermcolors"), /file path/);

// glass round-trips through a layout tree and leaves the source alone
const tree = { id: "root", type: "row", background: "canvas", children: [{ id: "body", type: "row", children: [{ id: "main", type: "block", content: { tab: "active", pane: { gap: 6, radius: 6, border: { width: 1, color: "border" } } } }] }] };
const glass = { bg: "frost", angle: 165, image: "", frost: "backgrounds/studio-frost-1.jpg", opacity: 0.8, chrome: 0.6, radius: 12, gap: 8, behind: "#0b0c1080" };
const out = applyGlass(tree, glass, { chrome: "#101114", background: "#1a1b26" });
assert.equal(tree.background, "canvas");
assert.deepEqual(out.background, { image: "backgrounds/studio-frost-1.jpg", fit: "cover" });
assert.equal(out.colors.chrome, "#10111499");
assert.equal(out.children[0].children[0].content.pane.background, "#1a1b26cc", "the card carries the opacity");
assert.equal(out.terminal_opacity, 0, "the terminal itself paints no background");
assert.deepEqual(out.children[0].children[0].content.pane.border, { width: 1, color: "border" });
assert.equal(out.children[0].background, "#0b0c1080", "behind paints the tab block's parent");
assert.equal(out.children[0].padding, glass.margin ?? GLASS_DEFAULT.margin, "the margin is the host's padding");
assert.equal(out.children[0].gap, glass.gap);
assert.equal(out.children[0].children[0].background, undefined);
assert.deepEqual(readGlass(out), { ...GLASS_DEFAULT, ...glass });
const solid = applyGlass(out, { ...glass, bg: "theme", opacity: 1, chrome: 1, behind: "" }, "#101114");
assert.equal(solid.children[0].background, undefined);
assert.equal(solid.background, "canvas");
assert.equal(solid.terminal_opacity, undefined);
assert.equal(solid.colors, undefined);
assert.equal(solid.children[0].children[0].content.pane.background, undefined);

assert.deepEqual(sortFonts(["Zapfino", "Menlo", "Arial", "JetBrains Mono"]), ["JetBrains Mono", "Menlo", "Arial", "Zapfino"]);

// the header swaps to the rounded clone while there's a radius, and back at 0
const hdr = { id: "root", type: "row", children: [{ id: "main", type: "block", content: { tab: "active", pane: { radius: 6, header: { content: { mod: "pane" }, height: 30 } } } }] };
assert.equal(applyGlass(hdr, { ...glass, radius: 10 }, "#101114").children[0].content.pane.header.content.mod, ROUNDED_HEADER);
assert.equal(applyGlass(hdr, { ...glass, radius: 0 }, "#101114").children[0].content.pane.header.content.mod, "pane");
const custom = { ...hdr, children: [{ ...hdr.children[0], content: { tab: "active", pane: { header: { content: { mod: "mine" } } } } }] };
assert.equal(applyGlass(custom, glass, "#101114").children[0].content.pane.header.content.mod, "mine", "someone else's header is left alone");

// header patch: inserts the helper once and rounds the root
const src = 'import { panes } from "herdr";\nexport default class P { render() { return h_flex()\n      .size_full()\n      .px(10)\n      .gap(8); } }\n';
const patched = patchHeader(src);
assert.ok(patched.includes(".size_full()\n      .rounded_t(studioRadius())\n      .px(10)"));
assert.equal(patchHeader(patched), patched);
assert.equal(patchHeader("no herdr here"), null);

// sidebar button goes above the footer, once, and comes back out
const side = { id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "brand" }, { id: "lists" }, { id: "sidebar-footer" }] }] };
const withB = withButton(withButton(side, true), true);
assert.deepEqual(withB.children[0].children.map((n) => n.id), ["brand", "lists", "theme-studio-button", "sidebar-footer"]);
assert.ok(hasButton(withB) && !hasButton(side));
assert.deepEqual(withButton(withB, false), side);
assert.equal(withButton({ id: "root", type: "row", children: [] }, true), null);

// palette icon: the footer block points at the patched clone, the old row goes, and back
const foot = { id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "brand" }, { id: "theme-studio-button" }, { id: "sidebar-footer", content: { mod: "workspace-chrome", props: { footer: true } } }] }] };
const iconOn = withFooterIcon(foot, true);
assert.deepEqual(iconOn.children[0].children.map((n) => n.id), ["brand", "sidebar-footer"]);
assert.deepEqual(iconOn.children[0].children[1].content, { mod: FOOTER_MOD, props: { footer: true } });
assert.ok(hasFooterIcon(iconOn) && !hasFooterIcon(foot));
assert.equal(withFooterIcon(iconOn, false).children[0].children[1].content.mod, "workspace-chrome");
assert.equal(withFooterIcon({ id: "root", type: "row" }, true), null);

// footer patch: marks itself, grows on the rail, and refuses an older patch
const chrome = 'import { run, props } from "herdr";\nexport default class W {\n  render() {\n    return v_flex()\n      .child(row("settings", "settings", "Settings", false, () => run("app.settings"))\n          .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent))))\n      .child(row("machine"));\n  }\n}\n';
const pf = patchFooter(chrome);
assert.ok(pf.includes(FOOTER_PATCH) && pf.includes("render(cx) {\n    studioFit(cx);"));
assert.ok(pf.includes(".when(collapsed, el => el.child(studioRail(t)))\n      .child(row(\"machine\"))"), "the rail row sits between Settings and Add machine");
assert.equal(patchFooter(pf), pf);
assert.equal(patchFooter(pf.replace(FOOTER_PATCH, "old")), null);
// Herdr 0.1.14's dot, placed apart on the rail
const pf14 = patchFooter(chrome.replace("el.child(div().size(6).rounded_full().bg(t.accent))))", "el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))"));
assert.ok(pf14 && pf14.includes(": ready))).when(!collapsed, el => el.child(studioIcon(t))))\n        .when(collapsed, el => el.child(studioRail(t)))"));

// contrast preview lift and the ligature breaker
assert.equal(liftContrast("#ffffff", "#000000", 7), "#ffffff");
const lifted = liftContrast("#333333", "#111111", 4.5);
assert.ok(contrast(lifted, "#111111") >= 4.5 && lifted !== "#333333");
assert.ok(contrast(liftContrast("#dddddd", "#ffffff", 3), "#ffffff") >= 3);
assert.equal(liftContrast("#333333", "#111111", 1), "#333333");
assert.equal(breakLigatures("a -> b != c"), "a -\u200c> b !\u200c= c");

// glass: chosen gradient colors, bloom picture
const gtree = { id: "root", type: "row", children: [{ id: "work", type: "column", children: [{ id: "main", type: "block", content: { tab: "active", pane: {} } }] }] };
const grad = applyGlass(gtree, { ...GLASS_DEFAULT, bg: "gradient", from: "#112233", to: "ansi4", angle: 90 }, { chrome: "#000000", background: "#101010" });
assert.deepEqual(grad.background, { gradient: ["#112233", "ansi4"], angle: 90 });
assert.equal(readGlass(grad).from, "#112233");
const bl = applyGlass(gtree, { ...GLASS_DEFAULT, bg: "bloom", bloom: "backgrounds/studio-bloom-1.jpg" }, { chrome: "#000000", background: "#101010" });
assert.deepEqual(bl.background, { image: "backgrounds/studio-bloom-1.jpg", fit: "cover" });
assert.equal(readGlass(bl).bg, "bloom");
const spec = bloomSpec("#000000", [{ c: "#ff0000", x: 0.16, y: 0.14, s: 100, r: 0.3, a: 0.55 }, { c: "#0000ff80", x: 0.5, y: 0.5, s: 0, r: 0.3, a: 0.5 }], 200);
assert.equal(spec.glows.length, 2); assert.equal(spec.glows[1].c, "#0000ff"); assert.equal(spec.glows[0].a, 1); assert.equal(spec.glows[1].a, 0);
// stored from the top left, drawn from the bottom left
assert.deepEqual([spec.glows[0].x, spec.glows[0].y], [0.16, 0.86]);
// glows: a bloom saved before the list reads as its three glows, colors kept; a list is read as is
const legacy = glowList({ glowA: "#112233" });
assert.equal(legacy.length, 3); assert.equal(legacy[0].c, "#112233"); assert.equal(legacy[1].c, "ansi5"); assert.deepEqual([legacy[2].x, legacy[2].y], [0.42, 0.96]);
assert.deepEqual(glowList({ glows: "[]" }), []);
assert.equal(glowList({ glows: "not json" }).length, 3);
const two = glowList({ glows: glowsText([...legacy.slice(0, 1), newGlow(legacy.slice(0, 1))]) });
assert.equal(two.length, 2); assert.equal(two[1].c, "ansi5"); assert.equal(two[1].s, 100);
assert.deepEqual([newGlow([]).x, newGlow([]).y], [0.5, 0.5]); // the first goes in the middle
assert.notDeepEqual([newGlow([{ x: 0.5, y: 0.5 }]).x, newGlow([{ x: 0.5, y: 0.5 }]).y], [0.5, 0.5]); // the next goes elsewhere
assert.equal(glowList({ glows: JSON.stringify([{ c: "accent", x: 2, y: 0 }, { c: "accent", x: 0.5, y: 0.5 }]) }).length, 1); // off the window: dropped
assert.equal(glowList({ glows: JSON.stringify(Array.from({ length: 12 }, () => ({ c: "accent", x: 0.5, y: 0.5 }))) }).length, MAX_GLOWS);
assert.equal(glowsText([{ c: "accent", x: 0.12345, y: 0.5, s: 100, r: 0.27, a: 0.45 }]), '[{"c":"accent","x":0.123,"y":0.5,"s":100,"r":0.27,"a":0.45}]');

// cursor shape codes
assert.equal(cursorCode("bar", false), 6); assert.equal(cursorCode("bar", true), 5);
assert.equal(cursorCode("underline", true), 3); assert.equal(cursorCode("nonsense", false), 2);

// picker HSL round trip
assert.deepEqual(hexToHsla("#ff0000"), [0, 100, 50, 100]);
assert.deepEqual(hexToHsla("#3366cc80"), [220, 60, 50, 50]);
assert.equal(hslaToHex(220, 60, 50), "#3366cc");
assert.equal(hslaToHex(0, 0, 100, 50), "#ffffff80");
for (const hex of ["#1a1b26", "#7aa2f7", "#e0af68", "#000000"]) assert.equal(hslaToHex(...hexToHsla(hex)).length, 7);

console.log("lib.test: all passed");

// agents patch: against Herdr's shipped agents mod when it's installed here
const shippedAgents = `${process.env.HOME}/.config/herdr-app/mods/agents/main.js`;
if (existsSync(shippedAgents)) {
  const pa = patchAgents(readFileSync(shippedAgents, "utf8"));
  assert.ok(pa && pa.includes("function studioAgents()") && pa.includes(".h(studioAgents().row)"), "the shipped agents mod patches");
  assert.ok(pa.includes("[name, studioMore] = [studioMore, name]") && pa.includes("\\u00b7 ${studioMore}"), "the session can lead on both layouts");
  assert.ok(["studioCard)", "studioWeight)", "selectedColor ||", "detailColor ||", "studioLeft(this.status(t, a, true))"].every((k) => pa.split(k).length >= 3), "cards and the status side reach both layouts");
  assert.ok(pa.includes("studioName(a.address)") && pa.includes("function studioName(") && pa.includes('import { exec as studioExec } from "herdr";'), "a session's /rename name can show");
  assert.ok(pa.includes(".when(Boolean(studioMore), el =>"), "a detail shows under a space header too");
  assert.equal(patchAgents(pa), pa);
}
assert.equal(patchAgents('import { shared } from "herdr";\nnothing to patch'), null, "a changed agents mod is refused");
const agTree = { id: "root", children: [{ id: "sidebar", children: [{ id: "agents", type: "block", content: { mod: "agents" } }] }] };
assert.equal(withAgentsMod(agTree, true).children[0].children[0].content.mod, AGENTS_MOD);
assert.equal(withAgentsMod(withAgentsMod(agTree, true), false).children[0].children[0].content.mod, "agents");
assert.equal(agTree.children[0].children[0].content.mod, "agents", "the input tree is left alone");
console.log("lib.test: agents patch passed");


// Auto-hide: on folds the sidebar to the rail and adds one watcher; off unfolds it and keeps other floating blocks.
const ahTree = { id: "root", children: [{ id: "sidebar", hidden: true, size: { px: 240 }, children: [] }, { id: "work" }], floating: [{ id: "board" }] };
const ahOn = withAutoHide(withAutoHide(ahTree, true, 76, 240), true, 76, 240);
assert.deepEqual(ahOn.children[0].size, { px: 76 });
assert.equal(ahOn.children[0].hidden, undefined, "folded, never hidden");
assert.deepEqual(ahOn.floating.map((f) => f.id), ["board", EDGE_ID], "one watcher, even when turned on twice");
const ahOff = withAutoHide(ahOn, false, 76, 240);
assert.deepEqual(ahOff.children[0].size, { px: 240 });
assert.deepEqual(ahOff.floating.map((f) => f.id), ["board"]);
assert.equal(withAutoHide({ id: "root", children: [{ id: "sidebar" }] }, false, 76, 240).floating, undefined);
assert.equal(withAutoHide({ id: "root", children: [] }, true, 76, 240), null, "no sidebar, nothing to fold");
assert.equal(ahTree.children[0].hidden, true, "the input tree is left alone");
assert.equal(autoHideMode(ahOn), "rail");
assert.equal(autoHideMode(ahOff), null);
const ahGone = withAutoHide(ahOn, true, 76, 240, "hidden");
assert.equal(ahGone.children[0].hidden, true);
assert.deepEqual(ahGone.children[0].size, { px: 240 }, "hidden keeps its open width");
assert.equal(autoHideMode(ahGone), "hidden");
assert.equal(ahGone.floating.length, 2, "switching mode keeps one watcher");
console.log("lib.test: auto-hide passed");

// card designer: a fake gpui that keeps each row's texts, so a card can be read back
// Proxies return themselves: bind p per element.
function node() { const o = { kids: [], calls: [] }; const pr = new Proxy(o, { get(t, k) {
  if (k === "kids" || k === "calls") return t[k];
  if (k === "child") return (c) => (t.kids.push(c), pr);
  if (k === "children") return (cs) => (t.kids.push(...cs), pr);
  if (k === "when") return (c, f) => (c ? f(pr) : pr);
  return (...args) => (t.calls.push([k, ...args]), pr);
} }); return pr; }
const fake = { div: node, h_flex: node, v_flex: node };
const texts = (n) => typeof n === "string" ? [n] : n && n.kids ? n.kids.flatMap(texts) : [];
const rowsOf = (card, d, S) => studioDrawCard(card, d, { ...AGENTS_DEFAULT, ...S }, { foreground: "#ffffff", muted: "#999999", dim: "#777777", accent: "#7aa2f7" }, fake).kids.map(texts);
const D = { title: "Herdr theming plugin design", space: "herdr-app-theming", name: () => "theme-studio", labels: { ticket: "HT-42" }, time: "3m",
  status: (badge) => (badge ? "Needs you" : "!"), icon: () => "ICON", idle: false };
assert.deepEqual(rowsOf(cardFrom({ ...AGENTS_DEFAULT }), D), [["ICON", "herdr-app-theming", "Herdr theming plugin design", "3m", "Needs you"]], "One line keeps today's order");
assert.deepEqual(rowsOf(cardFrom({ ...AGENTS_DEFAULT, lines: "two", show: "both", statusSide: "left", badge: false }), { ...D, space: "" }),
  [["!", "ICON", "theme-studio"], ["Herdr theming plugin design", "3m"]], "Name + title: the name leads, the title goes under it; the space hides under its header");
assert.deepEqual(rowsOf(cardFrom({ ...AGENTS_DEFAULT, show: "name" }), { ...D, space: "", name: () => "" }), [["ICON", "Herdr theming plugin design", "3m", "Needs you"]], "no name: the title stands in");
assert.deepEqual(rowsOf(cardFrom({ ...AGENTS_DEFAULT, show: "both" }), { ...D, space: "", name: () => "" }), [["ICON", "Herdr theming plugin design", "3m", "Needs you"]], "a text isn't said twice");
const labelled = { rows: [{ items: [{ kind: "title" }, { kind: "label", id: "t" }, { kind: "label", id: "e" }] }] };
const defs = [{ id: "t", key: "ticket", style: "pill", prefix: "#" }, { id: "e", key: "env", missing: "text", text: "local" }];
assert.deepEqual(rowsOf(labelled, D, { labels: defs }), [["Herdr theming plugin design", "#HT-42", "local"]], "label items: prefix, and the text for a missing label");
assert.deepEqual(rowsOf(labelled, { ...D, labels: {} }, { labels: [defs[0]] }), [["Herdr theming plugin design"]], "a missing label hides");
assert.ok(rowsOf(cardFrom({ ...AGENTS_DEFAULT, lines: "auto" }), D) && cardFrom({ ...AGENTS_DEFAULT, lines: "auto" }).rows[0].wrap, "Wraps is one row that wraps");
// an item's own size, color and weight win over its role's
const findText = (n, txt) => n && n.kids ? (n.kids.includes(txt) ? n : n.kids.map((k) => findText(k, txt)).find(Boolean)) : null;
const own = studioDrawCard({ rows: [{ items: [{ kind: "title", size: 15, color: "#ff0000", weight: "bold" }, { kind: "space" }] }] }, D, { ...AGENTS_DEFAULT }, { foreground: "#ffffff", muted: "#999999", dim: "#777777" }, fake);
const tc = findText(own, D.title).calls, sc = findText(own, D.space).calls;
assert.ok(tc.some((c) => c[0] === "text_size" && c[1] === 15) && tc.some((c) => c[0] === "text_color" && c[1] === "#ff0000") && tc.some((c) => c[0] === "font_bold"), "the item's own look");
assert.ok(sc.some((c) => c[0] === "text_size" && c[1] === AGENTS_DEFAULT.detailText) && sc.some((c) => c[0] === "text_color" && c[1] === "#777777"), "unset: the role's look (detail)");
console.log("lib.test: card designer passed");

// updates: version order, the once-per-version notice, installs, and the wait while editing
assert.ok(versionNewer("0.6.0", "0.5.9") && versionNewer("v0.10.0", "0.9.0") && !versionNewer("0.5.0", "v0.5.0") && !versionNewer(undefined, "0.1.0"));
const host = (over = {}) => {
  const store = { ...(over.store || {}) }, toasts = [], runs = [];
  return { toasts, runs, store, shared: (k) => store[k], setShared: (k, v) => { store[k] = v; }, notify: (n) => toasts.push(n.title), home: "/h",
    read: async () => JSON.stringify({ version: over.mine || "0.5.0" }),
    exec: async (cmd, args) => { runs.push(cmd); return cmd === "curl" ? { code: 0, stdout: JSON.stringify({ tag_name: over.tag || "v0.6.0", html_url: "u" }) } : { code: over.fail ? 1 : 0, stdout: "", stderr: "boom" }; } };
};
{
  const h = host();
  const r = await studioUpdate(h);
  assert.ok(r.newer && h.toasts.length === 1 && /available/.test(h.toasts[0]) && !h.runs.includes("sh"), "a newer release: one notice, no install");
  await studioUpdate(h);
  assert.equal(h.toasts.length, 1, "the notice comes once per version, and the 6-hour wait skips the network");
  assert.equal(h.runs.filter((x) => x === "curl").length, 1);
  const i = await studioUpdate(h, { install: true });
  assert.ok(i.updated === "0.6.0" && h.runs.includes("sh") && /updated to v0.6.0/.test(h.toasts.at(-1)), "an install posts its toast");
}
{
  const h = host({ store: { "theme-studio.autoupdate": true, "theme-studio.editing": true } });
  await studioUpdate(h);
  assert.ok(!h.runs.includes("sh"), "auto-update waits while the Studio has unsaved changes");
  h.store["theme-studio.editing"] = false;
  await studioUpdate(h, { force: true });
  assert.ok(h.runs.includes("sh") && /updated/.test(h.toasts.at(-1)), "then installs by itself");
}
{
  const h = host({ fail: true });
  const r = await studioUpdate(h, { install: true });
  assert.ok(r.failed === "boom" && /couldn't update/.test(h.toasts.at(-1)), "a failed install says why");
}
{
  const h = host({ tag: "v0.5.0" });
  const r = await studioUpdate(h);
  assert.ok(!r.newer && h.toasts.length === 0, "up to date: quiet");
}
console.log("lib.test: updates passed");

// parts: own, inherited, defaults per mode, loops, and who depends on a theme
{
  const all = {
    dune: { type: { font: "Meslo" }, agents: { card: 1 }, cursor: { shape: "bar" } }, // an older save: no src, so its own
    cool: { src: { glass: "from:green" } },
    green: { glass: { bg: "bloom" }, src: { glass: "own", agents: "default" } },
    loopA: { src: { glass: "from:loopB" } }, loopB: { src: { glass: "from:loopA" } },
    paper: {},
  };
  const ctx = { all, defaults: { dark: { agents: "dune", type: "dune" }, light: { agents: "dune" } }, light: (n) => n === "paper" };
  assert.equal(partSource(all.dune, "type"), "own"); assert.equal(partSource(all.dune, "glass"), "default");
  assert.deepEqual(resolvePart(ctx, "dune", "type").value, { font: "Meslo" });
  const g = resolvePart(ctx, "cool", "glass");
  assert.ok(g.why === "inherit" && g.from === "green" && g.value.bg === "bloom", "inherits live");
  const a = resolvePart(ctx, "green", "agents");
  assert.ok(a.why === "default" && a.from === "dune" && a.value.card === 1, "a default reaches the default theme's part");
  assert.equal(resolvePart(ctx, "paper", "type").why, "herdr", "light themes use the light defaults");
  assert.equal(resolvePart(ctx, "paper", "agents").from, "dune");
  assert.equal(resolvePart(ctx, "dune", "glass").why, "herdr", "the default theme without its own falls to Herdr's");
  assert.equal(resolvePart(ctx, "loopA", "glass").value, null, "a loop ends at Herdr's");
  const d = dependents(ctx, "dune", Object.keys(all)).map((x) => x.join("."));
  assert.ok(d.includes("cool.agents") && d.includes("paper.agents") && d.includes("cool.type") && !d.includes("paper.type"), d.join(","));
  assert.deepEqual(dependents(ctx, "green", Object.keys(all)), [["cool", "glass"]]);
  const j = parsePart(partJson("glass", { bg: "image" }, "Dune glass"));
  assert.ok(j.kind === "glass" && j.value.bg === "image" && j.name === "Dune glass");
  assert.ok(parsePart("{}").error && parsePart("nope").error);
}
console.log("lib.test: parts passed");

// --- sharing themes
{
  const { githubLink, githubEntries, cleanStudio, studioExtras, joinPath, isThemeFile, manifestThemes, browsable } = await import("./lib.js");
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  eq(githubLink("https://github.com/o/r/blob/main/ghostty/Dracula%2B"), { kind: "file", raw: "https://raw.githubusercontent.com/o/r/main/ghostty/Dracula%2B", name: "Dracula+" }, "blob");
  eq(githubLink("github.com/o/r/tree/main/ghostty").api, "https://api.github.com/repos/o/r/contents/ghostty?ref=main", "tree");
  eq(githubLink("https://github.com/o/r.git").api, "https://api.github.com/repos/o/r/contents/", "repo");
  eq(githubLink("https://gist.github.com/me/abc123").api, "https://api.github.com/gists/abc123", "gist");
  eq(githubLink("https://raw.githubusercontent.com/o/r/main/x.json?token=1").raw, "https://raw.githubusercontent.com/o/r/main/x.json", "raw");
  eq(githubLink("https://example.com/x.json"), null, "not github");
  eq(githubEntries([{ type: "file", name: "README.md", download_url: "u" }, { type: "file", name: "Nord", download_url: "n" }, { type: "dir", name: "kitty", url: "k" }, { type: "dir", name: ".github", url: "g" }]),
    { dirs: [{ name: "kitty", api: "k" }], files: [{ name: "Nord", raw: "n" }] }, "folder");
  eq(githubEntries({ files: { "a.json": { filename: "a.json", raw_url: "r" }, "b.png": { filename: "b.png", raw_url: "p" } } }).files, [{ name: "a.json", raw: "r" }], "gist files");
  eq(cleanStudio({ glass: { bg: "image" }, agents: "x", evil: {}, preview: "p.png", meta: { author: "A", ios: 3, url: "u" } }), { glass: { bg: "image" }, preview: "p.png", meta: { author: "A", url: "u" } }, "clean");
  eq(studioExtras({ cursor: { shape: "bar" }, meta: {} }).src, { type: "default", cursor: "own", glass: "default", agents: "default" }, "extras src");
  eq(joinPath("mods/theme-studio/presets", "../backgrounds/a.jpg"), "mods/theme-studio/backgrounds/a.jpg", "join ..");
  eq(joinPath("https://raw.githubusercontent.com/o/r/main", "./backgrounds/a.jpg"), "https://raw.githubusercontent.com/o/r/main/backgrounds/a.jpg", "join url");
  eq([isThemeFile("LICENSE"), isThemeFile("x.itermcolors"), isThemeFile("shot.png")], [false, true, false], "theme files");
  eq(manifestThemes({ format: 1, themes: ["a.json", "themes/b.json", "../x.json", "/etc/y.json", "c.png", 3] }), ["a.json", "themes/b.json"], "manifest");
  eq([browsable({ preview: "p.png", meta: { description: "d", author: "a" } }), browsable({ preview: "p.png", meta: { description: "d" } }), browsable({ meta: { description: "d", author: "a" } })], [true, false, false], "browsable");
  console.log("lib.test: sharing passed");
}

// sameParts: key order doesn't matter, nested values do
assert.ok(sameParts({ row: 20, card: { rows: [1] } }, { card: { rows: [1] }, row: 20 }));
assert.ok(!sameParts({ row: 20 }, { row: 24 }) && !sameParts({ row: 20 }, { row: 20, lines: "auto" }) && sameParts(null, {}));

// layout copy names, and moving an older Studio's copy
const SHIPPED = ["main", "terminals", "win98"];
assert.equal(copyName("main"), "theme-studio"); assert.equal(copyName("win98"), "theme-studio-win98");
assert.deepEqual(olderCopy("main-studio", SHIPPED), ["main-studio", "theme-studio"]);
assert.deepEqual(olderCopy("win98-studio", SHIPPED), ["win98-studio", "theme-studio-win98"]);
assert.deepEqual(olderCopy("poc-layout", SHIPPED), ["poc-layout", "theme-studio"]);
assert.equal(olderCopy("theme-studio", SHIPPED), null); assert.equal(olderCopy("mine-studio", SHIPPED), null); assert.equal(olderCopy("main", SHIPPED), null);
assert.deepEqual(Object.keys(JSON.parse(moveKeySection('{"global":{},"layout:main-studio":{"a":"b"},"x":1}', "main-studio", "theme-studio"))), ["global", "layout:theme-studio", "x"]);
assert.equal(moveKeySection('{"global":{}}', "main-studio", "theme-studio"), null);
assert.equal(moveKeySection("not json", "a", "b"), null);
