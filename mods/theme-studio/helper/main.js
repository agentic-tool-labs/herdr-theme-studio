// Installed by Theme Studio and opened by its "apply to this layout" key (ctrl-shift-a). A key can
// only open a mod, and Herdr refuses commands to a closed one, so this asks the Studio through
// shared state, opens it when it isn't open, and closes itself.
import { View, div } from "gpui-kit";
import { setShared, run, exec, props, closeOverlay } from "herdr";

export default class ApplyTheme extends View {
  init(_props, cx) {
    setShared("theme-studio.apply", Date.now());
    cx.spawn(async () => {
      const s = await exec("herdr-app", ["status"]).catch(() => null);
      let open = false;
      try { open = JSON.parse(s.stdout).overlays.includes("theme-studio"); } catch {}
      if (!open) run("mod.open", { name: "theme-studio" });
      closeOverlay(props().overlay);
    });
  }
  render() { return div(); }
}
