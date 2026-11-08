#!/usr/bin/env python3
"""Turns saved Theme Studio themes into bundled presets.

    tools/make-preset.py <name>... [--meta details.json]

For each name it writes mods/theme-studio/presets/<name>.json: the theme's Herdr colors from
~/.config/herdr-app/themes/<name>.json, plus a "studio" block with its parts (type, cursor, glass,
agents, as saved in shared.json) and its details. Herdr skips a theme file with fields it doesn't
know, so the Studio strips the block before writing a preset into themes/.

A glass picture is copied into mods/theme-studio/backgrounds/ and the preset points there (inside
Herdr's home, so Herdr can show it). Rendered pictures (bloom, frost) are dropped: they're redrawn.
Details come from the theme's saved details, else from --meta ({"<name>": {"description": ...}}).
"""
import json, os, shutil, sys

HOME = os.path.expanduser(os.environ.get("HERDR_APP_HOME", "~/.config/herdr-app"))
MOD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mods", "theme-studio")
PARTS = ["type", "cursor", "glass", "agents"]


def preset(name, metas):
    with open(os.path.join(HOME, "themes", f"{name}.json")) as f:
        theme = json.load(f)
    with open(os.path.join(HOME, "shared.json")) as f:
        ex = (json.load(f).get("theme-studio.themes") or {}).get(name) or {}
    src = ex.get("src") or {}
    studio = {}
    for p in PARTS:
        # A part taken from another theme or the defaults isn't this theme's to ship.
        if ex.get(p) and src.get(p, "own") == "own":
            studio[p] = ex[p]
    g = studio.get("glass")
    if g:
        studio["glass"] = g = {**g, "bloom": "", "frost": ""}
        if g.get("bg") == "image" and g.get("image"):
            pic = os.path.basename(g["image"])
            os.makedirs(os.path.join(MOD, "backgrounds"), exist_ok=True)
            shutil.copyfile(os.path.join(HOME, g["image"]), os.path.join(MOD, "backgrounds", pic))
            g["image"] = f"mods/theme-studio/backgrounds/{pic}"
    meta = ex.get("meta") or metas.get(name)
    if meta:
        studio["meta"] = meta
    out = os.path.join(MOD, "presets", f"{name}.json")
    with open(out, "w") as f:
        json.dump({**theme, "studio": studio}, f, indent=2)
        f.write("\n")
    print(f"{name}: {', '.join(studio) or 'colors only'}")


if __name__ == "__main__":
    args, metas = sys.argv[1:], {}
    if "--meta" in args:
        i = args.index("--meta")
        with open(args[i + 1]) as f:
            metas = json.load(f)
        del args[i : i + 2]
    if not args:
        sys.exit(__doc__)
    for n in args:
        preset(n, metas)
