// Bloom background: osascript -l JavaScript bloom.jxa.js <out.jpg> '<spec json>'
// The spec comes from lib.js bloomSpec: {w, h, base, glows: [{c, x, y, r, a}]}, colors as #rrggbb,
// positions and radius as fractions of the picture (origin bottom left). Prints {ok, out} or {ok:false, error}.
ObjC.import("AppKit"); ObjC.import("CoreImage");
function run(argv) {
  const [out, json] = argv;
  try {
    const s = JSON.parse(json), W = s.w, H = s.h, rect = $.CGRectMake(0, 0, W, H);
    const col = (hex, a) => { const n = (i) => parseInt(hex.slice(i, i + 2), 16) / 255; return $.CIColor.colorWithRedGreenBlueAlpha(n(1), n(3), n(5), a); };
    const f = (name, params) => { const x = $.CIFilter.filterWithName(name); x.setDefaults; for (const k in params) x.setValueForKey(params[k], k); return x.outputImage; };
    let img = f("CIConstantColorGenerator", { inputColor: col(s.base, 1) }).imageByCroppingToRect(rect);
    for (const g of s.glows) {
      if (!(g.a > 0)) continue; // a glow turned off: Core Image gives nothing back for an invisible gradient
      const glow = f("CIRadialGradient", { inputCenter: $.CIVector.vectorWithXY(g.x * W, g.y * H), inputRadius0: $(0), inputRadius1: $(g.r * W), inputColor0: col(g.c, g.a), inputColor1: col(g.c, 0) });
      img = f("CISourceOverCompositing", { inputImage: glow, inputBackgroundImage: img }).imageByCroppingToRect(rect);
    }
    // A radial gradient falls off in a straight line, which shows as a cone; a wide blur rounds it.
    img = f("CIGaussianBlur", { inputImage: img.imageByClampingToExtent, inputRadius: $(90) }).imageByCroppingToRect(rect);
    const ctx = $.CIContext.contextWithOptions($());
    const rep = $.NSBitmapImageRep.alloc.initWithCGImage(ctx.createCGImageFromRect(img, rect));
    const data = rep.representationUsingTypeProperties($.NSBitmapImageFileTypeJPEG, $({ NSImageCompressionFactor: 0.92 }));
    if (!data.writeToFileAtomically(out, true)) return JSON.stringify({ ok: false, error: "could not write " + out });
    return JSON.stringify({ ok: true, out });
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
}
