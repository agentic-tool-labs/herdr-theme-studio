// node mods/theme-studio/lib.test.mjs — exits nonzero on the first failure.
import assert from "node:assert/strict";
import { liftContrast, breakLigatures, patchFooter, FOOTER_PATCH, withFooterIcon, hasFooterIcon, FOOTER_MOD, patchHeader, ROUNDED_HEADER, withButton, hasButton, contrast, withAlpha, normHex, mergeSettings, themeFileFrom, setToken, parseTheme, applyGlass, readGlass, sortFonts, hexToHsla, hslaToHex, bloomSpec, GLASS_DEFAULT, cursorCode } from "./lib.js";

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
const spec = bloomSpec("#000000", ["#ff0000", "#00ff00", "#0000ff80"], 200);
assert.equal(spec.glows.length, 3); assert.equal(spec.glows[2].c, "#0000ff"); assert.equal(spec.glows[0].a, 1);

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
