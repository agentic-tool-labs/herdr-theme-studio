#!/usr/bin/env python3
"""Publishes Theme Studio themes as files anyone can import, from a link or from Browse themes.

    publish-theme.py <name>... [--out DIR] [--preview PICTURE] [--description TEXT] [--author TEXT]
                     [--url URL] [--ios URL] [--android URL] [--macos URL]
                     [--pictures DIR] [--meta details.json] [--manifest no]

For each theme you saved in the Studio it writes <out>/<name>.json (default out: the current
folder), copies its glass picture to <out>/backgrounds/ (or --pictures) and its preview to
<out>/previews/, and lists it in <out>/herdr-themes.json. Push the folder to a GitHub repo and give
the repo the topic herdr-mod-theme-studio so Browse themes finds it.

Browse themes shows a theme only when the repo's root has herdr-themes.json listing it,
    { "format": 1, "themes": ["my-theme.json"] }
and the theme has a preview picture (--preview: a screenshot of Herdr wearing it, about 16:10,
900 px wide is plenty), a description and an author. A link imports any theme file.

The file (format 1) is a Herdr theme file plus one "studio" block:

    { "background": ..., "foreground": ..., "selection": ..., "cursor": ..., "ansi": [16 colors],
      "studio": { "format": 1, "preview": "previews/my-theme.png",
                  "type": {...}, "cursor": {...}, "glass": {...}, "agents": {...},
                  "meta": { "description": "", "author": "", "url": "https://...",
                            "ios": "https://apps.apple.com/...", "android": "https://play.google.com/...",
                            "macos": "https://apps.apple.com/..." } } }

Parts are as the Studio saves them; a part left out is Herdr's. glass.image is relative to the file.
Details are fixed once imported. Any store link (ios, android, macos) makes it a branded theme: the
Studio shows the official store badges, lists it under Branded and welcomes people the first time
they pick it. Details come from the theme's saved details, then --meta ({"<name>": {...}}), then
the flags.
"""
import json, os, shutil, sys

HOME = os.path.expanduser(os.environ.get("HERDR_APP_HOME", "~/.config/herdr-app"))
PARTS = ["type", "cursor", "glass", "agents"]
STORES = {"ios": "apps.apple.com", "android": "play.google.com", "macos": "apps.apple.com"}
FLAGS = ["description", "author", "url", *STORES]


def publish(name, out, pics, meta_in, preview, manifest):
    with open(os.path.join(HOME, "themes", f"{name}.json")) as f:
        theme = json.load(f)
    with open(os.path.join(HOME, "shared.json")) as f:
        ex = (json.load(f).get("theme-studio.themes") or {}).get(name) or {}
    src, studio = ex.get("src") or {}, {"format": 1}
    for p in PARTS:
        s = src.get(p, "own" if ex.get(p) else "default")
        if s == "own" and ex.get(p):
            studio[p] = ex[p]
        elif s.startswith("from:"):
            print(f"  {name}: its {p} is inherited from {s[5:]}, so it ships with Herdr's. Make it its own in the Studio (Copy from) to ship it.")
    g = studio.get("glass")
    if g:
        studio["glass"] = g = {**g, "bloom": "", "frost": ""}  # rendered on import
        if g.get("bg") == "image" and g.get("image"):
            os.makedirs(pics, exist_ok=True)
            pic = os.path.join(pics, os.path.basename(g["image"]))
            shutil.copyfile(os.path.join(HOME, g["image"]), pic)
            g["image"] = os.path.relpath(pic, out)
    meta = {**(ex.get("meta") or {}), **meta_in}
    for k, host in STORES.items():
        u = meta.get(k, "")
        if u and not (u.startswith("https://") and u.split("/")[2].lower() == host):
            sys.exit(f"--{k} must be an https://{host}/... link")
    meta = {k: v for k, v in meta.items() if k in FLAGS and v}
    if meta:
        studio["meta"] = meta
    target = os.path.join(out, f"{name}.json")
    if preview:
        os.makedirs(os.path.join(out, "previews"), exist_ok=True)
        dest = os.path.join(out, "previews", name + os.path.splitext(preview)[1].lower())
        shutil.copyfile(os.path.expanduser(preview), dest)
        studio["preview"] = os.path.relpath(dest, out)
    elif os.path.exists(target):  # publishing again keeps the preview it had
        with open(target) as f:
            old = (json.load(f).get("studio") or {}).get("preview")
        if old:
            studio["preview"] = old
    missing = [w for w, ok in (("--preview", studio.get("preview")), ("--description", meta.get("description")), ("--author", meta.get("author"))) if not ok]
    if missing:
        print(f"  {name}: Browse themes won't show it without {', '.join(missing)} (a link still imports it).")
    os.makedirs(out, exist_ok=True)
    with open(target, "w") as f:
        json.dump({**{k: v for k, v in theme.items() if k != "studio"}, "studio": studio}, f, indent=2)
        f.write("\n")
    if manifest:
        mf = os.path.join(out, "herdr-themes.json")
        m = json.load(open(mf)) if os.path.exists(mf) else {}
        themes = [t for t in m.get("themes", []) if t != f"{name}.json"] + [f"{name}.json"]
        with open(mf, "w") as f:
            json.dump({"format": 1, "themes": themes}, f, indent=2)
            f.write("\n")
    brand = " (branded)" if any(k in meta for k in STORES) else ""
    print(f"{name}{brand}: {', '.join(k for k in studio if k != 'format') or 'colors only'} -> {os.path.join(out, name + '.json')}")


if __name__ == "__main__":
    args, opts = sys.argv[1:], {}
    while any(a.startswith("--") for a in args):
        i = next(i for i, a in enumerate(args) if a.startswith("--"))
        if i + 1 >= len(args):
            sys.exit(f"{args[i]} needs a value")
        opts[args[i][2:]] = args[i + 1]
        del args[i : i + 2]
    bad = set(opts) - {"out", "pictures", "meta", "preview", "manifest", *FLAGS}
    if not args or bad:
        sys.exit((f"Unknown option: --{bad.pop()}\n" if bad else "") + __doc__)
    out = opts.get("out", ".")
    pics = opts.get("pictures", os.path.join(out, "backgrounds"))
    metas = json.load(open(opts["meta"])) if "meta" in opts else {}
    if "preview" in opts and len(args) > 1:
        sys.exit("--preview is for one theme at a time")
    for n in args:
        publish(n, out, pics, {**metas.get(n, {}), **{k: opts[k] for k in FLAGS if k in opts}}, opts.get("preview"), opts.get("manifest") != "no")
    print("Next: push the folder to GitHub, and give the repo the topic herdr-mod-theme-studio (gh repo edit --add-topic herdr-mod-theme-studio).")
