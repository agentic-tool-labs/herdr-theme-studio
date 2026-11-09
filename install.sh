#!/bin/sh
# Installs Theme Studio into the Herdr app: copies the mod folder and binds ctrl-shift-y.
# Re-running is safe. Uninstall: ./install.sh --remove
set -e
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
SRC="$(cd "$(dirname "$0")" && pwd)/mods/theme-studio"
DEST="$HOME_DIR/mods/theme-studio"
KEY="ctrl-shift-y"

if [ "$1" = "--remove" ]; then
  rm -rf "$DEST" "$HOME_DIR/mods/theme-studio-apply"
  node -e '
    const fs=require("fs"),f=process.argv[1];
    const j=JSON.parse(fs.readFileSync(f,"utf8")), g=j.global||{};
    const ours=Object.keys(g).filter((k) => g[k]==="mod.open:theme-studio" || g[k]==="mod.open:theme-studio-apply");
    ours.forEach((k) => delete g[k]);
    if (ours.length) fs.writeFileSync(f, JSON.stringify(j,null,2)+"\n");
  ' "$HOME_DIR/keys.json"
  echo "Removed Theme Studio. Your themes, settings and layouts are untouched."
  exit 0
fi

# A copy, not a link: Herdr's hot reload doesn't follow symlinked mod folders. Re-run after editing.
[ -L "$DEST" ] && rm "$DEST"
mkdir -p "$DEST"
rsync -a --delete --exclude lib.test.mjs --exclude "*.d.ts" --exclude jsconfig.json "$SRC/" "$DEST/"
node -e '
  const fs=require("fs"),f=process.argv[1],k=process.argv[2];
  const j=JSON.parse(fs.readFileSync(f,"utf8")); j.global=j.global||{};
  if (j.global[k] && j.global[k]!=="mod.open:theme-studio") { console.error(k+" is already bound to "+j.global[k]+"; bind mod.open:theme-studio yourself"); process.exit(0); }
  j.global[k]="mod.open:theme-studio"; fs.writeFileSync(f, JSON.stringify(j,null,2)+"\n");
' "$HOME_DIR/keys.json" "$KEY"
herdr-app check "$DEST"
echo "Installed. Press ctrl-shift-y in Herdr to open Theme Studio."
