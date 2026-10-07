/* ==================================================================
 * BFF data visuals: vector export (SVG and PDF), version 1
 *
 * Loaded on demand by design mode ("Download image"), never by the published
 * graphics. It turns the graphic as laid out on the page into ONE SVG drawing:
 *   - chart and map shapes (<svg>) are copied, with their computed styles written in;
 *   - HTML text (titles, legends, footers…) becomes <text>, line by line, at its exact place;
 *   - HTML boxes (legend dots, backgrounds, borders, gradient bars) become rectangles.
 * The PDF is then written with jsPDF + svg2pdf.js (pinned, from jsDelivr), with static
 * Inter embedded under its own name (shared/vendor/fonts, SIL Open Font Licence), so the
 * text stays editable in Illustrator. Alfabet can't be embedded (desktop licence): titles
 * are exported in Inter Bold, and design mode lays the graphic out in Inter while exporting.
 *
 *   DV.exportSVG(root, { controls, bg, width, height })  -> SVG element (not attached)
 *   DV.exportPDF(root, opts)                              -> Promise<Blob>
 * ================================================================== */
(function () {
  "use strict";
  var DV = window.DV, NS = "http://www.w3.org/2000/svg";
  var LIB_PDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
  var LIB_SVG2PDF = "https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.4/dist/svg2pdf.umd.min.js";
  var FONTS = [["Inter-Regular.ttf", "Inter", "normal"], ["Inter-Bold.ttf", "Inter", "bold"], ["Inter-SemiBold.ttf", "Inter SemiBold", "normal"]];
  // Inter's vertical metrics (units per em 2048: ascender 1984, descender 494)
  var ASC = 1984 / 2048, DESC = 494 / 2048;

  function n(v) { return parseFloat(v) || 0; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" -> { hex, a }
  function color(c) {
    var m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/.exec(c || "");
    if (!m) return null;
    var a = m[4] == null ? 1 : /%$/.test(m[4]) ? n(m[4]) / 100 : n(m[4]);
    var hex = "#" + [m[1], m[2], m[3]].map(function (v) { return ("0" + Math.round(+v).toString(16)).slice(-2); }).join("");
    return { hex: hex, a: a };
  }
  // CSS weight -> the embedded font: 600 = SemiBold, 700+ = Bold
  function font(weight) {
    var w = +weight || (weight === "bold" ? 700 : 400);
    if (w >= 650) return { family: "Inter", weight: "bold" };
    if (w >= 550) return { family: "Inter SemiBold", weight: "normal" };
    return { family: "Inter", weight: "normal" };
  }
  function skip(node, opts) {
    var cl = node.classList;
    if (!cl) return false;
    return cl.contains("dv-tooltip") || cl.contains("sr-only") || (!opts.controls && cl.contains("dv-control")) ||
      node.tagName === "SCRIPT" || node.tagName === "STYLE" || node.tagName === "TABLE";
  }

  /* ---------- chart and map shapes: copied, with computed styles written in ---------- */
  var SVG_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
    "opacity", "fill-opacity", "stroke-opacity", "font-size", "text-anchor", "letter-spacing"];
  var clipId = 0;
  function copySvg(svg, out, ox, oy, defs) {
    var r = svg.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    var vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
    var w = vb ? vb.width : n(svg.getAttribute("width")) || r.width;
    var s = r.width / w;
    var g = el("g", { transform: "translate(" + (r.left - ox - (vb ? vb.x * s : 0)) + "," + (r.top - oy - (vb ? vb.y * s : 0)) + ") scale(" + s + ")" }, out);
    var orig = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll("*")));
    var clone = svg.cloneNode(true);
    var copy = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*")));
    var drop = [];
    orig.forEach(function (o, i) {
      var c = copy[i], cs = getComputedStyle(o);
      if (cs.display === "none" || cs.visibility === "hidden") { drop.push(c); return; }
      if (i > 0 && o.tagName !== "defs" && !o.closest("defs")) {
        var alpha = {}, none = {};
        SVG_PROPS.forEach(function (p) {
          var v = cs.getPropertyValue(p);
          if (!v || v === "normal") return;
          if (p === "fill" || p === "stroke") {
            var col = color(v);
            if (col) { c.setAttribute(p, col.hex); alpha[p] = col.a; return; }
            if (v === "none") { c.setAttribute(p, "none"); none[p] = true; return; }
            return;   // url(#…) gradients and patterns: keep the attribute as written
          }
          c.setAttribute(p, v);
        });
        // a colour's own transparency (rgba) combines with fill-opacity / stroke-opacity
        ["fill", "stroke"].forEach(function (p) {
          if (alpha[p] != null && alpha[p] < 1) c.setAttribute(p + "-opacity", alpha[p] * (n(c.getAttribute(p + "-opacity")) || 1));
          // no paint: no opacity either (svg2pdf would otherwise apply a 0 to the whole shape)
          if (none[p]) c.removeAttribute(p + "-opacity");
        });
        if (o.tagName === "line") { c.setAttribute("fill", "none"); c.removeAttribute("fill-opacity"); }
        // invisible shapes (hover areas, hidden guides) are left out
        var shape = /^(rect|circle|path|line|polygon|polyline|ellipse)$/.test(o.tagName);
        var noFill = none.fill || alpha.fill === 0 || (c.hasAttribute("fill-opacity") && n(c.getAttribute("fill-opacity")) === 0);
        var noStroke = none.stroke || alpha.stroke == null || alpha.stroke === 0 || n(cs.strokeWidth) === 0 ||
          (c.hasAttribute("stroke-opacity") && n(c.getAttribute("stroke-opacity")) === 0);
        if ((shape && noFill && noStroke) || n(cs.opacity) === 0) { drop.push(c); return; }
      }
      if (o.tagName === "text" || o.tagName === "tspan") {
        var f = font(cs.fontWeight);
        c.setAttribute("font-family", f.family);
        c.setAttribute("font-weight", f.weight);
      }
      // text centred vertically (dominant-baseline): move it onto a plain baseline,
      // measured on the page, since PDF readers only know baselines
      if (o.tagName === "text" && cs.dominantBaseline && cs.dominantBaseline !== "auto" && o.getNumberOfChars && o.getNumberOfChars() > 0) {
        try {
          var ext = o.getExtentOfChar(0), fs = n(cs.fontSize);
          var base = ext.y + (ext.height - (ASC + DESC) * fs) / 2 + ASC * fs;
          var first = c.querySelector("tspan[y]") || c;
          var delta = base - n(first.getAttribute("y"));
          [c].concat(Array.prototype.slice.call(c.querySelectorAll("tspan"))).forEach(function (t) {
            if (t.hasAttribute("y")) t.setAttribute("y", n(t.getAttribute("y")) + delta);
          });
        } catch (e) {}
      }
      c.removeAttribute("dominant-baseline");
      c.removeAttribute("class");
      c.removeAttribute("style");
    });
    drop.forEach(function (c) { if (c !== clone && c.parentNode) c.parentNode.removeChild(c); });
    // drawings the page clips to their box (maps) are clipped in the export too
    var target = g, ov = getComputedStyle(svg).overflow;
    if (ov && ov !== "visible" && defs) {
      var id = "dvc" + (++clipId);
      var cp = el("clipPath", { id: id }, defs);
      el("rect", { x: r.left - ox, y: r.top - oy, width: r.width, height: r.height }, cp);   // the drawing's box on the page
      target = el("g", { "clip-path": "url(#" + id + ")" }, out);
      out.removeChild(g); target.appendChild(g);
    }
    while (clone.firstChild) g.appendChild(clone.firstChild);
  }

  /* ---------- HTML: boxes and text ---------- */
  var gradId = 0;
  function box(node, cs, out, defs, ox, oy) {
    var r = node.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return;
    var bg = color(cs.backgroundColor), bw = n(cs.borderTopWidth), bc = color(cs.borderTopColor);
    var grad = /linear-gradient\((.*)\)/.exec(cs.backgroundImage || "");
    var rx = Math.min(n(cs.borderTopLeftRadius), r.width / 2, r.height / 2);
    var fill = bg && bg.a > 0 ? bg : null, stroke = bw > 0 && cs.borderTopStyle !== "none" && bc && bc.a > 0 ? bc : null;
    var gid = null;
    if (grad) {
      // linear-gradient(to right | 90deg, colour [stop], …)
      var parts = grad[1].split(/,(?![^(]*\))/).map(function (s) { return s.trim(); });
      var dir = /^(to |[\d.]+deg)/.test(parts[0]) ? parts.shift() : "to bottom";
      var vertical = /bottom|top|180deg|0deg/.test(dir) && !/right|left|90deg|270deg/.test(dir);
      gid = "dvg" + (++gradId);
      var lg = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, defs);
      parts.forEach(function (p, i) {
        var col = color(p), stop = /([\d.]+)%\s*$/.exec(p);
        if (col) el("stop", { offset: stop ? n(stop[1]) / 100 : i / Math.max(1, parts.length - 1), "stop-color": col.hex, "stop-opacity": col.a }, lg);
      });
    }
    if (!fill && !stroke && !gid) return;
    el("rect", { x: r.left - ox + (stroke ? bw / 2 : 0), y: r.top - oy + (stroke ? bw / 2 : 0),
      width: r.width - (stroke ? bw : 0), height: r.height - (stroke ? bw : 0), rx: rx || null,
      fill: gid ? "url(#" + gid + ")" : fill ? fill.hex : "none", "fill-opacity": fill && fill.a < 1 ? fill.a : null,
      stroke: stroke ? stroke.hex : null, "stroke-width": stroke ? bw : null }, out);
  }
  // A text node -> one <text> per line, at the place the browser drew it
  function text(tn, cs, out, ox, oy) {
    var str = tn.nodeValue;
    if (!/\S/.test(str)) return;
    var range = document.createRange(), words = [], re = /\S+/g, m;
    while ((m = re.exec(str))) {
      range.setStart(tn, m.index); range.setEnd(tn, m.index + m[0].length);
      var rects = range.getClientRects();
      if (!rects.length) continue;
      var rr = rects[0];
      words.push({ t: m[0], x: rr.left, r: rr.right, top: rr.top, h: rr.height });
    }
    if (!words.length) return;
    var fs = n(cs.fontSize), f = font(cs.fontWeight), col = color(cs.color) || { hex: "#000000", a: 1 };
    var transform = cs.textTransform, under = /underline/.test(cs.textDecorationLine || cs.textDecoration || "");
    var lines = [];
    words.forEach(function (w) {
      var line = lines.length && Math.abs(lines[lines.length - 1].top - w.top) < fs * 0.4 ? lines[lines.length - 1] : null;
      if (!line) { line = { top: w.top, h: w.h, x: w.x, r: w.r, words: [] }; lines.push(line); }
      line.words.push(w); line.r = Math.max(line.r, w.r); line.x = Math.min(line.x, w.x);
    });
    lines.forEach(function (L) {
      var base = L.top + (L.h - (ASC + DESC) * fs) / 2 + ASC * fs - oy;
      // one line = one piece of text with ordinary spaces (editable as a line in Illustrator),
      // starting where the browser drew its first word; same font as on the page, so the same width
      var line = L.words.map(function (w) { return w.t; }).join(" ");
      el("text", { x: L.x - ox, y: base, "font-family": f.family, "font-weight": f.weight, "font-size": fs, fill: col.hex,
        "fill-opacity": col.a < 1 ? col.a : null }, out).textContent = transform === "uppercase" ? line.toUpperCase() : line;
      if (under) el("line", { x1: L.x - ox, x2: L.r - ox, y1: base + fs * 0.12, y2: base + fs * 0.12, stroke: col.hex, "stroke-width": Math.max(0.5, fs * 0.06) }, out);
    });
  }
  function walk(node, out, defs, ox, oy, opts) {
    if (node.nodeType === 3) { text(node, getComputedStyle(node.parentNode), out, ox, oy); return; }
    if (node.nodeType !== 1 || skip(node, opts)) return;
    var cs = getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden" || n(cs.opacity) < 0.02) return;
    if (node.tagName.toLowerCase() === "svg") { copySvg(node, out, ox, oy, defs); return; }
    if (node.tagName === "IMG" || node.tagName === "INPUT" || node.tagName === "SELECT" || node.tagName === "TEXTAREA") return;
    box(node, cs, out, defs, ox, oy);
    Array.prototype.forEach.call(node.childNodes, function (c) { walk(c, out, defs, ox, oy, opts); });
  }

  DV.exportSVG = function (root, opts) {
    opts = opts || {};
    var r = root.getBoundingClientRect(), W = Math.ceil(opts.width || r.width), H = Math.ceil(opts.height || r.height);
    var svg = el("svg", { xmlns: NS, width: W, height: H, viewBox: "0 0 " + W + " " + H });
    var defs = el("defs", {}, svg);
    if (opts.bg && opts.bg !== "transparent") el("rect", { x: 0, y: 0, width: W, height: H, fill: (color(opts.bg) || { hex: opts.bg }).hex }, svg);
    var g = el("g", { transform: H > r.height ? "translate(0," + Math.floor((H - r.height) / 2) + ")" : null }, svg);
    Array.prototype.forEach.call(root.childNodes, function (c) { walk(c, g, defs, r.left, r.top, opts); });
    return svg;
  };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var sc = document.createElement("script"); sc.src = src; sc.onload = res;
      sc.onerror = function () { rej(new Error("couldn't load " + src)); };
      document.head.appendChild(sc);
    });
  }
  function base64(buf) {
    var bin = "", bytes = new Uint8Array(buf), CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  var fontData = null;
  DV.exportPDF = function (root, opts) {
    opts = opts || {};
    var fontsUrl = (DV.sharedUrl || opts.sharedUrl || "../shared/") + "vendor/fonts/";
    return (window.jspdf ? Promise.resolve() : loadScript(LIB_PDF))
      .then(function () { return window.svg2pdf ? null : loadScript(LIB_SVG2PDF); })
      .then(function () {
        return fontData || Promise.all(FONTS.map(function (f) {
          return fetch(fontsUrl + f[0]).then(function (r) { if (!r.ok) throw new Error("font " + f[0]); return r.arrayBuffer(); });
        })).then(function (bufs) { fontData = bufs.map(base64); return fontData; });
      })
      .then(function () {
        var svg = DV.exportSVG(root, opts);
        var W = +svg.getAttribute("width"), H = +svg.getAttribute("height"), PT = 0.75;   // 1 px = 0.75 pt (96 px per inch)
        var doc = new window.jspdf.jsPDF({ orientation: W >= H ? "landscape" : "portrait", unit: "pt", format: [W * PT, H * PT], compress: true });
        FONTS.forEach(function (f, i) { doc.addFileToVFS(f[0], fontData[i]); doc.addFont(f[0], f[1], f[2]); });
        doc.setProperties({ title: opts.title || document.title, creator: "BFF data visuals" });
        // svg2pdf reads the drawing from the page: attach it out of sight while it works
        var holder = document.createElement("div");
        holder.style.cssText = "position:fixed;left:-99999px;top:0;width:" + W + "px;height:" + H + "px;overflow:hidden";
        holder.appendChild(svg); document.body.appendChild(holder);
        return doc.svg(svg, { x: 0, y: 0, width: W * PT, height: H * PT }).then(function () {
          holder.remove();
          return doc.output("blob");
        }, function (e) { holder.remove(); throw e; });
      });
  };
})();
