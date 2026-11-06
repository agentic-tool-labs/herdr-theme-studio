// Frosted wallpaper: osascript -l JavaScript frost.jxa.js <out.jpg> <blur> <brightness> <saturation>
// Prints JSON: {ok, wallpaper, out} or {ok:false, error}. No permission prompt: uses NSWorkspace, not System Events.
ObjC.import("AppKit"); ObjC.import("CoreImage");
function run(argv) {
  const [out, blur = "40", bright = "-0.15", sat = "1.2"] = argv;
  try {
    const url = $.NSWorkspace.sharedWorkspace.desktopImageURLForScreen($.NSScreen.mainScreen);
    const path = url.path.js;
    let img = $.CIImage.imageWithContentsOfURL(url);
    if (!img || img.isNil()) return JSON.stringify({ ok: false, wallpaper: path, error: "wallpaper is not a still image" });
    const ext = img.extent;
    const scale = Math.min(1, 1600 / ext.size.width);
    const f = (name, params) => { const x = $.CIFilter.filterWithName(name); x.setDefaults; for (const k in params) x.setValueForKey(params[k], k); return x.outputImage; };
    img = f("CILanczosScaleTransform", { inputImage: img, inputScale: $(scale), inputAspectRatio: $(1) });
    const box = img.extent;
    img = f("CIGaussianBlur", { inputImage: img.imageByClampingToExtent, inputRadius: $(Number(blur)) }).imageByCroppingToRect(box);
    img = f("CIColorControls", { inputImage: img, inputBrightness: $(Number(bright)), inputSaturation: $(Number(sat)), inputContrast: $(1) });
    const ctx = $.CIContext.contextWithOptions($());
    const cg = ctx.createCGImageFromRect(img, box);
    const rep = $.NSBitmapImageRep.alloc.initWithCGImage(cg);
    const data = rep.representationUsingTypeProperties($.NSBitmapImageFileTypeJPEG, $({ NSImageCompressionFactor: 0.85 }));
    if (!data.writeToFileAtomically(out, true)) return JSON.stringify({ ok: false, wallpaper: path, error: "could not write " + out });
    return JSON.stringify({ ok: true, wallpaper: path, out });
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
}
