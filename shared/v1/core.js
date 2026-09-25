/* ==================================================================
 * BFF data visuals: shared core, version 1
 *
 * Used by every graphic in this repository. It handles:
 *   - loading data from the public Google Sheet (with built-in fallback data)
 *   - merging brand settings (shared/brand.js) with each graphic's SETTINGS
 *   - fonts (Google Fonts, plus an optional Adobe Fonts web project)
 *   - responsive re-rendering and iframe auto-height
 *   - reusable chart pieces: stacked area chart, legend, tooltip, arrow
 *   - design mode (open a graphic with ?design): live settings panel + export
 *
 * Published graphics depend on this exact file. Don't make breaking changes
 * here: copy it to shared/v2/ and move graphics over one at a time instead.
 * ================================================================== */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var DV = window.DV = { version: 1 };

  /* ------------------------------------------------------------------
   * BRAND FIELDS: defaults, help text and design-mode controls.
   * The values themselves live in shared/brand.js.
   * ------------------------------------------------------------------ */
  var WEIGHTS = [300, 400, 500, 600, 700, 800, 900];
  var BRAND_GROUPS = [
    { name: "Fonts", fields: [
      { key: "font",          type: "font", def: "Inter", help: "Main font (a Google Fonts name, or an Adobe Fonts name when adobeKitId is set)" },
      { key: "titleFont",     type: "font", def: "", help: "Font for main titles only (empty = same as main font)" },
      { key: "adobeKitId",    type: "text", def: "", help: "Adobe Fonts web project ID, e.g. abc1def (empty = not used)" },
      { key: "titleSize",     type: "range", min: 16, max: 72, step: 1, def: 46, help: "Main title size in px (shrinks on small screens)" },
      { key: "titleWeight",   type: "select", options: WEIGHTS, def: 800, help: "Main title boldness" },
      { key: "headingSize",   type: "range", min: 11, max: 32, step: 0.5, def: 21, help: "Chart heading size in px" },
      { key: "headingWeight", type: "select", options: WEIGHTS, def: 700, help: "Chart heading boldness" },
      { key: "legendSize",    type: "range", min: 10, max: 22, step: 0.5, def: 14.5, help: "Legend text size in px" },
      { key: "axisSize",      type: "range", min: 9, max: 22, step: 0.5, def: 15, help: "Axis label size in px" },
      { key: "tooltipSize",   type: "range", min: 10, max: 18, step: 0.5, def: 13, help: "Tooltip text size in px" },
      { key: "footerSize",    type: "range", min: 10, max: 32, step: 0.5, def: 24, help: "Footer text size in px" }
    ]},
    { name: "Colours", fields: [
      { key: "background",   type: "color", def: "#ffffff", help: "Page background" },
      { key: "textColor",    type: "color", def: "#000000", help: "Title and footer text" },
      { key: "headingColor", type: "color", def: "#000000", help: "Chart headings and legend text" },
      { key: "axisColor",    type: "color", def: "#000000", help: "Axis numbers and labels" },
      { key: "gridColor",    type: "color", def: "#eceef0", help: "Horizontal grid lines" }
    ]},
    { name: "Layout", fields: [
      { key: "titleAlign",  type: "select", options: ["left", "center", "right"], def: "center", help: "Main title alignment" },
      { key: "legendAlign", type: "select", options: ["left", "right"], def: "right", help: "Legend alignment when charts sit side by side" },
      { key: "maxWidth",    type: "range", min: 600, max: 1600, step: 10, def: 1100, help: "Widest a graphic gets, in px" },
      { key: "stackBelow",  type: "range", min: 360, max: 1000, step: 10, def: 640, help: "Below this width (px) charts stack vertically" }
    ]},
    { name: "Chart style", fields: [
      { key: "areaOpacity", type: "range", min: 0, max: 1, step: 0.05, def: 0.85, help: "How solid coloured areas are (0 = invisible, 1 = solid)" },
      { key: "lineWidth",   type: "range", min: 0, max: 6, step: 0.5, def: 2, help: "Line along the top of each area, in px (0 = none)" },
      { key: "showDots",    type: "check", def: true, help: "Show a dot at every data point" },
      { key: "dotSize",     type: "range", min: 1, max: 10, step: 0.5, def: 4.5, help: "Dot radius in px" },
      { key: "showGrid",    type: "check", def: true, help: "Show horizontal grid lines" }
    ]},
    { name: "Arrow style", fields: [
      { key: "arrowColor",     type: "color", def: "#000000", help: "Arrow colour" },
      { key: "arrowThickness", type: "range", min: 1, max: 16, step: 0.5, def: 8, help: "Line thickness in px" },
      { key: "arrowHeadSize",  type: "range", min: 4, max: 40, step: 1, def: 18, help: "Arrowhead size in px" },
      { key: "arrowHeadStyle", type: "select", options: ["open", "filled"], def: "open", help: "Arrowhead: open chevron or filled triangle" },
      { key: "arrowLineStyle", type: "select", options: ["solid", "dashed", "dotted"], def: "solid", help: "Line style" }
    ]}
  ];

  var SETTINGS_HEADER = [
    "/* ================================================================",
    " * DESIGN SETTINGS FOR THIS GRAPHIC",
    " * Change any value below to restyle this graphic. Colours are hex",
    " * codes, sizes are in pixels. Keep the quotes and the comma on each line.",
    " * Fonts, text colours and palette colours are shared by all graphics:",
    " * they live in shared/brand.js.",
    " * Easier: open this page with ?design at the end of its address to",
    " * adjust everything with sliders, then download the result.",
    " * ================================================================ */"
  ].join("\n");
  var BRAND_HEADER = [
    "/* ================================================================",
    " * BFF BRAND SETTINGS: shared by every graphic in this repository.",
    " * Change a value here and every graphic follows once it's published.",
    " * A graphic can still override any of these in its own SETTINGS block.",
    " * Easier: open any graphic with ?design, adjust the Brand sections,",
    " * then use \"Download brand.js\" and replace this file with it.",
    " * ================================================================ */"
  ].join("\n");
  var MARK_START = "// ==== SETTINGS " + "START ====";
  var MARK_END = "// ==== SETTINGS " + "END ====";

  /* ------------------------------------------------------------------
   * SMALL HELPERS (also available to graphics as DV.*)
   * ------------------------------------------------------------------ */
  DV.el = function (tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  DV.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  DV.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // Number formatting, e.g. DV.fmt(12.345, "GW", 1) -> "12.3 GW"
  DV.fmt = function (v, unit, decimals) {
    var s = (+v).toLocaleString("en-GB", { maximumFractionDigits: decimals == null ? 1 : decimals });
    return unit ? s + " " + unit : s;
  };
  // "24Q1" -> "Q1 2024" (tooltips); "24Q1" -> "2024 Q1" (footer)
  DV.prettyPeriod = function (p) {
    var m = /^(\d{2})Q([1-4])$/.exec(p);
    return m ? "Q" + m[2] + " 20" + m[1] : p;
  };
  DV.footerPeriod = function (p) {
    var m = /^(\d{2})Q([1-4])$/.exec(p);
    return m ? "20" + m[1] + " Q" + m[2] : p;
  };
  // A "round" tick step (1, 2, 5, 10, 20, 50 ...) close to x
  DV.niceStep = function (x) {
    if (!(x > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), f = x / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  };
  // y-axis for a data maximum; roundUp extends the axis to the next tick
  DV.scale = function (dataMax, roundUp) {
    var step = DV.niceStep(dataMax / 2.5);
    var top = dataMax * 1.04;
    if (roundUp) top = Math.max(top, Math.ceil(dataMax / step - 1e-9) * step);
    return { max: top || 1, step: step };
  };
  // Largest stacked total across rows
  DV.stackMax = function (data, series) {
    return data.reduce(function (mx, d) {
      return Math.max(mx, series.reduce(function (a, s) { return a + d[s.key]; }, 0));
    }, 0);
  };

  // Sorts column names by their position in the data (left to right); names not found go last.
  // Convention: a sheet lists each chart's columns top of the stack first, which is also
  // the legend and tooltip order. Stacks are drawn bottom first, so reverse for DV.stackedArea.
  DV.byColumns = function (headers, keys) {
    function pos(k) { var i = headers.indexOf(k); return i < 0 ? 1e9 : i; }
    return keys.slice().sort(function (a, b) { return pos(a) - pos(b); });
  };

  /* ------------------------------------------------------------------
   * DATA: Google Sheet (gviz CSV) with a built-in fallback
   * ------------------------------------------------------------------ */
  function parseTable(text) {
    text = text.replace(/^﻿/, "").trim();
    var sep = text.split(/\r?\n/)[0].indexOf("\t") > -1 ? "\t" : ",";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    row.push(cell); rows.push(row);

    var headers = rows[0].map(function (h) { return h.trim(); });
    var data = rows.slice(1)
      .filter(function (r) { return (r[0] || "").trim() !== ""; })   // skip blank rows
      .map(function (r) {
        var o = {};
        headers.forEach(function (h, i) {
          var v = (r[i] || "").trim();
          o[h] = i === 0 ? v : (v === "" ? 0 : +v.replace(/,/g, ""));
        });
        return o;
      });
    return { headers: headers, data: data };
  }
  DV.parseTable = parseTable;

  function isValid(t, columns) {
    return t.data.length > 0 && (columns || []).every(function (k) {
      return t.headers.indexOf(k) > -1 && t.data.every(function (d) { return isFinite(d[k]); });
    });
  }

  function loadData(cfg) {
    var fallback = parseTable(cfg.fallback);
    if (!cfg.sheetId || !window.fetch) return Promise.resolve(fallback);
    var url = "https://docs.google.com/spreadsheets/d/" + cfg.sheetId +
      "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(cfg.sheetTab);
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (text) {
        var t = parseTable(text);
        if (!isValid(t, cfg.columns)) throw new Error("the sheet's columns don't match the expected headers");
        return t;
      })
      .catch(function (err) {
        console.warn("Data visual: using fallback data (" + err.message + ")");
        return fallback;
      });
  }

  /* ------------------------------------------------------------------
   * FONTS: Adobe Fonts web project (optional) + Google Fonts on demand
   * ------------------------------------------------------------------ */
  var googleRequested = {}, kits = {};
  function hasFace(family) {
    var f = family.toLowerCase(), found = false;
    if (document.fonts && document.fonts.forEach) {
      document.fonts.forEach(function (ff) { if (ff.family.replace(/["']/g, "").toLowerCase() === f) found = true; });
    }
    return found;
  }
  function loadGoogleFont(family, done) {
    family = (family || "").trim();
    if (!family || googleRequested[family] || hasFace(family)) return;
    googleRequested[family] = true;
    var fam = encodeURIComponent(family).replace(/%20/g, "+");
    // Not every family has every weight; fall back to fewer weights if Google rejects the request
    var variants = [":wght@300;400;500;600;700;800;900", ":wght@400;600;700;800", ":wght@400;700", ""];
    (function attempt(i) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + fam + variants[i] + "&display=swap";
      link.onload = function () {
        if (document.fonts && document.fonts.load) document.fonts.load('700 16px "' + family + '"').then(done, done);
        else done();
      };
      link.onerror = function () {
        link.parentNode.removeChild(link);
        if (i + 1 < variants.length) attempt(i + 1);
        else console.warn('Data visual: font "' + family + '" was not found on Google Fonts or in the Adobe kit');
      };
      document.head.appendChild(link);
    })(0);
  }
  function loadAdobeKit(id, cb) {
    var kit = kits[id];
    if (kit) { if (kit.loaded) cb(); else kit.cbs.push(cb); return; }
    kit = kits[id] = { loaded: false, cbs: [cb] };
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://use.typekit.net/" + encodeURIComponent(id) + ".css";
    link.onload = link.onerror = function () {
      kit.loaded = true;
      kit.cbs.forEach(function (f) { f(); });
    };
    document.head.appendChild(link);
  }
  function loadFonts(S, done) {
    function google() { [S.font, S.titleFont].forEach(function (f) { loadGoogleFont(f, done); }); }
    if (S.adobeKitId) loadAdobeKit(S.adobeKitId, function () { done(); google(); });
    else google();
  }
  function fontStack(f) { return '"' + f + '", "Inter", Helvetica, Arial, sans-serif'; }

  /* ------------------------------------------------------------------
   * CHART PIECES
   * ------------------------------------------------------------------ */

  // Heading + legend + svg + tooltip inside a chart container
  DV.chartBox = function (box, title, legendItems) {
    DV.clear(box);
    var head = document.createElement("div"); head.className = "dv-head"; box.appendChild(head);
    var h = document.createElement("h2"); h.textContent = title; head.appendChild(h);
    if (legendItems && legendItems.length) {
      var lg = document.createElement("div"); lg.className = "dv-legend";
      legendItems.forEach(function (it) {
        var item = document.createElement("span"), dot = document.createElement("i");
        dot.style.background = it.color;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(it.label));
        lg.appendChild(item);
      });
      head.appendChild(lg);
    }
    var svg = DV.el("svg", { role: "img", "aria-label": title + ": stacked area chart" }, box);
    var tip = document.createElement("div"); tip.className = "dv-tooltip"; box.appendChild(tip);
    return { box: box, head: head, svg: svg, tip: tip };
  };

  // Give headings the same height so side-by-side plots line up
  DV.alignHeads = function (heads, on) {
    heads.forEach(function (h) { h.style.minHeight = ""; });
    if (!on) return;
    var hMax = Math.max.apply(null, heads.map(function (h) { return h.offsetHeight; }));
    heads.forEach(function (h) { h.style.minHeight = hMax + "px"; });
  };

  /* Stacked area chart with dots, axes, hover guide and tooltip.
   * o = { S, svg, tip, width, height, data, period, series: [{key, label, color, fill, lineOpacity}],
   *       yMax, tickStep, unit, decimals, totals: fn(row) -> [[label, value]],
   *       label: {text, size, weight, color, width} (optional, drawn inside the bottom series) }
   * Returns { x, y, m, iw, ih } so graphics can position arrows. */
  DV.stackedArea = function (o) {
    var S = o.S, svg = o.svg, width = o.width, height = o.height, data = o.data, n = data.length;
    var el = DV.el, fmt = function (v) { return DV.fmt(v, o.unit, o.decimals); };
    o.tip.classList.remove("on");
    DV.clear(svg);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);

    var fs = S.axisSize * DV.clamp(width / 520, 0.8, 1);
    var ticks = [];
    for (var t = 0; t * o.tickStep <= o.yMax + 1e-9; t++) ticks.push(t * o.tickStep);
    var tickText = ticks.map(fmt);
    var longest = Math.max.apply(null, tickText.map(function (s) { return s.length; }));
    var m = { top: 8, right: 14, bottom: fs + 14, left: fs * 0.58 * longest + 14 };
    var iw = Math.max(1, width - m.left - m.right), ih = Math.max(1, height - m.top - m.bottom);
    var pad = Math.min(24, iw * 0.04);            // inset so first/last dots aren't on the edge
    var step = (iw - pad * 2) / Math.max(1, n - 1);
    var x = function (i) { return m.left + pad + i * step; };
    var y = function (v) { return m.top + ih - (v / o.yMax) * ih; };

    // grid + y labels
    var g = el("g", {}, svg);
    ticks.forEach(function (v, i) {
      if (v > 0 && S.showGrid) el("line", { x1: m.left, x2: width - m.right, y1: y(v), y2: y(v), stroke: S.gridColor }, g);
      el("text", { x: m.left - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle", "font-size": fs, fill: S.axisColor }, g)
        .textContent = tickText[i];
    });
    el("line", { x1: m.left, x2: width - m.right, y1: y(0), y2: y(0), stroke: S.axisColor, "stroke-opacity": 0.3 }, g);

    // x labels: always the first period, then every 4th counting back from the latest, avoiding collisions
    var minGap = fs * 3, picks = [0], placed = [];
    for (var i = n - 1; i > 0; i -= 4) picks.push(i);
    picks.forEach(function (i) {
      var px = x(i);
      if (placed.some(function (q) { return Math.abs(q - px) < minGap; })) return;
      placed.push(px);
      el("line", { x1: px, x2: px, y1: y(0), y2: y(0) + 5, stroke: S.axisColor, "stroke-opacity": 0.3 }, g);
      el("text", { x: px, y: y(0) + fs + 6, "text-anchor": "middle", "font-size": fs, fill: S.axisColor }, g)
        .textContent = data[i][o.period];
    });

    // stack
    var base = data.map(function () { return 0; });
    var layers = o.series.map(function (s) {
      var pts = data.map(function (d, i) {
        var y0 = base[i], y1 = y0 + d[s.key];
        base[i] = y1;
        return { y0: y0, y1: y1 };
      });
      return { s: s, pts: pts };
    });

    var areas = el("g", {}, svg);
    layers.forEach(function (L) {
      var top = L.pts.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.y1).toFixed(1); });
      var bot = L.pts.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.y0).toFixed(1); }).reverse();
      el("path", { d: "M" + top.join("L") + "L" + bot.join("L") + "Z", fill: L.s.fill || L.s.color, "fill-opacity": S.areaOpacity }, areas);
      if (S.lineWidth > 0) {
        el("path", { d: "M" + top.join("L"), fill: "none", stroke: L.s.color, "stroke-width": S.lineWidth,
          "stroke-linejoin": "round", "stroke-opacity": L.s.lineOpacity == null ? 1 : L.s.lineOpacity }, areas);
      }
    });

    if (o.label && o.label.text) areaLabel(svg, o.label, x(0), x(n - 1), y(0));

    var r = S.dotSize * (width < 420 ? 0.7 : 1);
    var baseR = S.showDots ? r : 0;
    var guide = el("line", { y1: m.top, y2: y(0), stroke: "#888", "stroke-dasharray": "3 3", opacity: 0 }, svg);
    var dots = el("g", {}, svg);
    var dotEls = layers.map(function (L) {
      return L.pts.map(function (p, i) {
        return el("circle", { cx: x(i), cy: y(p.y1), r: baseR, fill: L.s.color }, dots);
      });
    });

    // interaction
    var hit = el("rect", { x: m.left, y: m.top, width: iw, height: ih, fill: "transparent", "class": "dv-hit" }, svg);
    var active = -1, tip = o.tip;
    function tooltipHTML(i) {
      var d = data[i], h = "<b>" + DV.prettyPeriod(d[o.period]) + "</b>";
      o.series.slice().reverse().forEach(function (s) {
        h += '<div class="r"><i style="background:' + s.color + '"></i><span>' + (s.label || s.key) + "</span><em>" + fmt(d[s.key]) + "</em></div>";
      });
      (o.totals ? o.totals(d) : []).forEach(function (t, k) {
        h += '<div class="r' + (k === 0 ? " t" : "") + '"><span>' + t[0] + "</span><em>" + fmt(t[1]) + "</em></div>";
      });
      return h;
    }
    function show(evt) {
      var rect = svg.getBoundingClientRect();
      var mx = (evt.clientX - rect.left) * (width / rect.width);
      var idx = DV.clamp(Math.round((mx - m.left - pad) / step), 0, n - 1);
      if (idx !== active) {
        if (active > -1) dotEls.forEach(function (row) { row[active].setAttribute("r", baseR); });
        dotEls.forEach(function (row) { row[idx].setAttribute("r", Math.max(r, 3) * 1.55); });
        active = idx;
        guide.setAttribute("x1", x(idx)); guide.setAttribute("x2", x(idx));
        guide.setAttribute("opacity", 1);
        tip.innerHTML = tooltipHTML(idx);
      }
      tip.classList.add("on");
      var tipW = tip.offsetWidth, tipH = tip.offsetHeight;
      var box = svg.parentNode, boxW = box.clientWidth, pr = box.getBoundingClientRect();
      var ox = rect.left - pr.left, oy = rect.top - pr.top;
      var left = ox + x(idx) + 14;
      if (left + tipW > boxW) left = ox + x(idx) - tipW - 14;
      if (left < 0) left = Math.max(0, (boxW - tipW) / 2);
      var ty = oy + Math.max(m.top, Math.min(y(layers[layers.length - 1].pts[idx].y1) - tipH / 2, y(0) - tipH));
      tip.style.left = left + "px";
      tip.style.top = ty + "px";
    }
    function hide() {
      tip.classList.remove("on");
      guide.setAttribute("opacity", 0);
      if (active > -1) dotEls.forEach(function (row) { row[active].setAttribute("r", baseR); });
      active = -1;
    }
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);

    return { x: x, y: y, m: m, iw: iw, ih: ih };
  };

  // Text inside the bottom area, right-aligned; "|" forces a line break, long lines wrap
  function areaLabel(svg, L, xStart, xEnd, yBase) {
    var maxW = (xEnd - xStart) * L.width, pad = L.size * 0.5;
    var text = DV.el("text", { "text-anchor": "end", "font-size": L.size, "font-weight": L.weight, fill: L.color }, svg);
    var lines = [];
    String(L.text).split("|").forEach(function (part) {
      var words = part.trim().split(/\s+/), line = "";
      words.forEach(function (w) {
        var tryLine = line ? line + " " + w : w;
        text.textContent = tryLine;
        if (line && text.getComputedTextLength() > maxW) { lines.push(line); line = w; }
        else line = tryLine;
      });
      if (line) lines.push(line);
    });
    text.textContent = "";
    var lh = L.size * 1.12;
    lines.forEach(function (ln, i) {
      DV.el("tspan", { x: xEnd - pad, y: yBase - pad - (lines.length - 1 - i) * lh }, text).textContent = ln;
    });
  }

  /* Arrow from (x1,y1) to (x2,y2), styled by the brand arrow settings.
   * curve bends it sideways (+ = up for a left-to-right arrow); scale shrinks it on small screens. */
  DV.arrow = function (svg, x1, y1, x2, y2, S, curve, scale) {
    var sw = S.arrowThickness * scale;
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    if (len < 1) return;
    var head = Math.min(S.arrowHeadSize * scale, len * 0.4);
    var nx = (y1 - y2) / len, ny = (x2 - x1) / len;
    var cx = (x1 + x2) / 2 - nx * (curve || 0), cy = (y1 + y2) / 2 - ny * (curve || 0);
    var ang = Math.atan2(y2 - cy, x2 - cx), ux = Math.cos(ang), uy = Math.sin(ang);
    var px = -uy, py = ux;
    var filled = S.arrowHeadStyle === "filled";
    var tx = x2 - (filled ? 0 : ux * sw / 2), ty = y2 - (filled ? 0 : uy * sw / 2);
    var back = filled ? head * 0.8 : sw * 0.8;
    var sx = tx - ux * back, sy = ty - uy * back;

    var shaft = { d: "M" + x1 + " " + y1 + " Q" + cx + " " + cy + " " + sx + " " + sy,
      fill: "none", stroke: S.arrowColor, "stroke-width": sw, "stroke-linecap": "butt" };
    if (S.arrowLineStyle === "dashed") shaft["stroke-dasharray"] = sw * 2.2 + " " + sw * 1.4;
    if (S.arrowLineStyle === "dotted") { shaft["stroke-dasharray"] = "0 " + sw * 1.9; shaft["stroke-linecap"] = "round"; }
    DV.el("path", shaft, svg);

    var bx = tx - ux * head, by = ty - uy * head;
    if (filled) {
      var wH = head * 0.62;
      DV.el("path", { d: "M" + tx + " " + ty + " L" + (bx + px * wH) + " " + (by + py * wH) + " L" + (bx - px * wH) + " " + (by - py * wH) + "Z",
        fill: S.arrowColor }, svg);
    } else {
      var wO = head * 0.75;
      DV.el("path", { d: "M" + (bx + px * wO) + " " + (by + py * wO) + " L" + tx + " " + ty + " L" + (bx - px * wO) + " " + (by - py * wO),
        fill: "none", stroke: S.arrowColor, "stroke-width": sw, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    }
  };

  /* Sizes an overlay svg to its container and returns at(chartSvg, x, y):
   * converts a point inside a chart's svg to overlay coordinates. */
  DV.overlay = function (overlay, container) {
    var r = container.getBoundingClientRect();
    DV.clear(overlay);
    overlay.setAttribute("width", r.width);
    overlay.setAttribute("height", r.height);
    return function (svg, x, y) {
      var s = svg.getBoundingClientRect(), k = s.width / (+svg.getAttribute("width") || s.width);
      return { x: s.left - r.left + x * k, y: s.top - r.top + y * k };
    };
  };

  /* ------------------------------------------------------------------
   * DV.create: sets up a graphic.
   * cfg = { root: "dv" (element id), sheetId, sheetTab, fallback (text), columns (required),
   *         groups (this graphic's settings schema), build(ctx), render(ctx) }
   * ctx = { S (all settings), data, headers, P (period column), root, W (width),
   *         k (scale 0-1), stacked, sz(size, min) }
   * ------------------------------------------------------------------ */
  DV.create = function (cfg) {
    var root = document.getElementById(cfg.root || "dv");
    var brandFields = fieldMap(BRAND_GROUPS), graphicFields = fieldMap(cfg.groups);
    var FILE_BRAND = window.BRAND || {}, FILE_SETTINGS = window.SETTINGS || {};
    var design = /[?&]design\b/i.test(location.search);
    var storeB = "dv-brand", storeG = "dv-graphic:" + location.pathname;

    // B = brand values, PAL = palette sections, G = this graphic's values (+ brand overrides)
    var B, PAL, G, overrides;
    function fromFiles() {
      B = {};
      Object.keys(brandFields).forEach(function (k) { B[k] = k in FILE_BRAND ? FILE_BRAND[k] : brandFields[k].def; });
      PAL = JSON.parse(JSON.stringify(FILE_BRAND.palette || {}));
      G = {};
      Object.keys(graphicFields).forEach(function (k) { G[k] = k in FILE_SETTINGS ? FILE_SETTINGS[k] : graphicFields[k].def; });
      overrides = Object.keys(FILE_SETTINGS).filter(function (k) { return k in brandFields; });
      overrides.forEach(function (k) { G[k] = FILE_SETTINGS[k]; });
    }
    fromFiles();
    if (design) {
      try {
        var sb = JSON.parse(localStorage.getItem(storeB) || "null");
        if (sb) {
          Object.keys(sb.B || {}).forEach(function (k) { if (k in brandFields) B[k] = sb.B[k]; });
          Object.keys(sb.PAL || {}).forEach(function (sec) {
            if (!PAL[sec]) return;
            Object.keys(sb.PAL[sec]).forEach(function (k) { if (k in PAL[sec]) PAL[sec][k] = sb.PAL[sec][k]; });
          });
        }
        var sg = JSON.parse(localStorage.getItem(storeG) || "null");
        if (sg) Object.keys(sg).forEach(function (k) { if (k in G) G[k] = sg[k]; });
      } catch (e) {}
    }
    function merged() {
      var S = {};
      Object.keys(B).forEach(function (k) { S[k] = B[k]; });
      Object.keys(PAL).forEach(function (sec) { Object.keys(PAL[sec]).forEach(function (k) { S[k] = PAL[sec][k]; }); });
      Object.keys(G).forEach(function (k) { S[k] = G[k]; });
      return S;
    }

    var ctx = { root: root, S: merged() };
    loadData(cfg).then(function (table) {
      ctx.data = table.data;
      ctx.headers = table.headers;
      ctx.P = table.headers[0];
      buildTable(root, table);

      var lastW = -1;
      function render(force) {
        var W = root.clientWidth;
        if (!W || (!force && W === lastW)) return;
        lastW = W;
        var S = ctx.S;
        ctx.W = W;
        ctx.k = Math.min(1, W / S.maxWidth);
        ctx.stacked = W < S.stackBelow;
        root.classList.toggle("dv-stacked", ctx.stacked);
        ctx.sz = function (size, min) { return Math.max(Math.min(min, size), size * ctx.k); };
        var st = root.style;
        st.setProperty("--dv-title-size", ctx.sz(S.titleSize, 22) + "px");
        st.setProperty("--dv-title-gap", ctx.sz(36, 16) + "px");
        st.setProperty("--dv-heading-size", ctx.sz(S.headingSize, 15) + "px");
        st.setProperty("--dv-legend-size", ctx.sz(S.legendSize, 12) + "px");
        st.setProperty("--dv-footer-size", ctx.sz(S.footerSize, 15) + "px");
        cfg.render(ctx);
        postHeight();
      }
      function rerender() { render(true); }

      function apply() {
        var S = ctx.S = merged();
        var de = document.documentElement.style;
        de.setProperty("--dv-font", fontStack(S.font));
        de.setProperty("--dv-title-font", fontStack(S.titleFont || S.font));
        de.setProperty("--dv-title-weight", S.titleWeight);
        de.setProperty("--dv-title-align", S.titleAlign);
        de.setProperty("--dv-heading-weight", S.headingWeight);
        de.setProperty("--dv-tooltip-size", S.tooltipSize + "px");
        de.setProperty("--dv-legend-align", S.legendAlign === "left" ? "flex-start" : "flex-end");
        de.setProperty("--dv-bg", S.background);
        de.setProperty("--dv-text", S.textColor);
        de.setProperty("--dv-heading", S.headingColor);
        root.style.maxWidth = S.maxWidth + "px";
        loadFonts(S, rerender);

        var title = document.getElementById("dv-title");
        if (title) title.textContent = S.title || "";
        var footer = document.getElementById("dv-footer");
        if (footer) footer.textContent = (S.footer || "")
          .replace(/\{first\}/g, ctx.data[0][ctx.P])
          .replace(/\{last\}/g, DV.footerPeriod(ctx.data[ctx.data.length - 1][ctx.P]));

        cfg.build(ctx);
        render(true);
      }

      apply();
      if (window.ResizeObserver) new ResizeObserver(function () { render(); }).observe(root);
      else window.addEventListener("resize", function () { render(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(rerender);
      if (design) initDesignMode();

      /* ---------------- design mode ---------------- */
      function initDesignMode() {
        document.documentElement.classList.add("gd-html");
        document.body.classList.add("gd-on");
        var frame = document.createElement("div");
        frame.className = "gd-frame";
        root.parentNode.insertBefore(frame, root);
        frame.appendChild(root);

        var FONT_SUGGESTIONS = ["Inter", "Lexend", "Roboto", "Nunito", "Source Sans 3", "Open Sans", "Lato", "Montserrat",
          "Poppins", "Work Sans", "IBM Plex Sans", "Noto Sans", "Barlow", "DM Sans", "Fira Sans", "Libre Franklin",
          "Public Sans", "Manrope", "Space Grotesk", "Merriweather", "Lora", "Playfair Display", "Roboto Slab", "Oswald"];

        var panel = document.createElement("aside");
        panel.className = "gd-panel";
        panel.innerHTML =
          '<div class="gd-head">' +
            "<h3>Design mode</h3>" +
            "<p>Changes show live and are kept in this browser only. When you're done, download the result.</p>" +
            '<div class="gd-width"><span>Preview width</span><input type="range" min="320" max="1600" step="10" id="gd-w"><span id="gd-wv">Fit</span></div>' +
            '<div class="gd-btns"><button data-w="375">Phone</button><button data-w="768">Tablet</button><button data-w="0">Fit window</button></div>' +
            '<div class="gd-btns"><b>This graphic</b><button class="gd-primary" id="gd-dl">Download index.html</button><button id="gd-copy">Copy settings</button></div>' +
            '<div class="gd-btns"><b>Brand</b><button class="gd-primary" id="gd-dlb">Download brand.js</button><button id="gd-copyb">Copy</button></div>' +
            '<div class="gd-btns"><button id="gd-reset">Reset all changes</button></div>' +
            '<div class="gd-msg" id="gd-msg"></div>' +
            '<textarea class="gd-out" id="gd-out" readonly wrap="off"></textarea>' +
          "</div>";
        var dl = document.createElement("datalist");
        dl.id = "gd-fonts";
        FONT_SUGGESTIONS.forEach(function (f) { var op = document.createElement("option"); op.value = f; dl.appendChild(op); });
        panel.appendChild(dl);

        var pending = false;
        function save() {
          try {
            localStorage.setItem(storeB, JSON.stringify({ B: B, PAL: PAL }));
            localStorage.setItem(storeG, JSON.stringify(G));
          } catch (e) {}
          if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; apply(); }); }
        }

        function section(title, note) {
          var d = document.createElement("div"); d.className = "gd-section";
          d.textContent = title;
          if (note) { var s = document.createElement("small"); s.textContent = note; d.appendChild(s); }
          panel.appendChild(d);
        }
        function group(name, fields, get, set, open, noteFor) {
          var det = document.createElement("details");
          det.open = !!open;
          var sum = document.createElement("summary"); sum.textContent = name; det.appendChild(sum);
          fields.forEach(function (f) { det.appendChild(control(f, get, set, noteFor && noteFor(f))); });
          panel.appendChild(det);
        }

        section("This graphic");
        cfg.groups.forEach(function (g, i) {
          group(g.name, g.fields,
            function (k) { return G[k]; },
            function (k, v) { G[k] = v; save(); },
            i === 0 || /arrow/i.test(g.name));
        });

        section("Brand: shared by all graphics", "Changes here apply to every graphic once brand.js is replaced. They're remembered in this browser, so you can check them on the other graphics before downloading.");
        BRAND_GROUPS.forEach(function (g) {
          group(g.name, g.fields,
            function (k) { return overrides.indexOf(k) > -1 ? G[k] : B[k]; },
            function (k, v) { if (overrides.indexOf(k) > -1) G[k] = v; else B[k] = v; save(); },
            false,
            function (f) { return overrides.indexOf(f.key) > -1 ? "Overridden in this graphic's SETTINGS, so changes here only affect this graphic" : ""; });
        });
        Object.keys(PAL).forEach(function (sec) {
          var fields = Object.keys(PAL[sec]).map(function (k) { return { key: k, type: "color", help: humanize(k) }; });
          group("Palette: " + sec, fields,
            function (k) { return PAL[sec][k]; },
            function (k, v) { PAL[sec][k] = v; save(); },
            false);
        });
        document.body.appendChild(panel);

        function control(f, get, set, warn) {
          var row = document.createElement("div"); row.className = "gd-row";
          var id = "gd-" + f.key;
          var labelText = f.help.split(/[,(;]/)[0].trim();
          var rest = f.help.slice(labelText.length).replace(/^[\s,;]+/, "");
          var lab = document.createElement("label"); lab.htmlFor = id; lab.textContent = labelText;
          row.appendChild(lab);
          var ctl = document.createElement("div"); ctl.className = "gd-ctl"; row.appendChild(ctl);
          var input, val = get(f.key);
          if (f.type === "range") {
            input = document.createElement("input"); input.type = "range";
            input.min = f.min; input.max = f.max; input.step = f.step; input.value = val;
            var num = document.createElement("input"); num.type = "number";
            num.min = f.min; num.max = f.max; num.step = f.step; num.value = val;
            input.addEventListener("input", function () { num.value = input.value; set(f.key, +input.value); });
            num.addEventListener("input", function () { if (num.value !== "") { input.value = num.value; set(f.key, +num.value); } });
            ctl.appendChild(input); ctl.appendChild(num);
          } else if (f.type === "color") {
            input = document.createElement("input"); input.type = "color";
            var hex = document.createElement("input"); hex.type = "text";
            input.value = /^#[0-9a-f]{6}$/i.test(val) ? val : "#000000";
            hex.value = val;
            input.addEventListener("input", function () { hex.value = input.value; set(f.key, input.value); });
            hex.addEventListener("change", function () {
              if (/^#[0-9a-f]{6}$/i.test(hex.value)) input.value = hex.value;
              set(f.key, hex.value.trim());
            });
            ctl.appendChild(input); ctl.appendChild(hex);
          } else if (f.type === "select") {
            input = document.createElement("select");
            f.options.forEach(function (o) { var op = document.createElement("option"); op.value = o; op.textContent = o; input.appendChild(op); });
            input.value = val;
            input.addEventListener("change", function () { set(f.key, typeof f.def === "number" ? +input.value : input.value); });
            ctl.appendChild(input);
          } else if (f.type === "check") {
            input = document.createElement("input"); input.type = "checkbox"; input.checked = !!val;
            input.addEventListener("change", function () { set(f.key, input.checked); });
            ctl.appendChild(input);
          } else {
            input = document.createElement("input"); input.type = "text"; input.value = val;
            if (f.type === "font") {
              input.setAttribute("list", "gd-fonts");
              input.placeholder = f.key === "titleFont" ? "(same as main font)" : "e.g. Inter";
              input.addEventListener("change", function () { set(f.key, input.value.trim()); });
            } else if (f.key === "adobeKitId") {
              input.addEventListener("change", function () { set(f.key, input.value.trim()); });
            } else {
              input.addEventListener("input", function () { set(f.key, input.value); });
            }
            ctl.appendChild(input);
          }
          input.id = id;
          var help = document.createElement("small");
          help.textContent = (rest ? rest + "  ·  " : "") + "setting: " + f.key;
          row.appendChild(help);
          if (warn) { var w = document.createElement("small"); w.className = "gd-warn"; w.textContent = warn; row.appendChild(w); }
          return row;
        }

        // Preview width
        var wr = panel.querySelector("#gd-w"), wv = panel.querySelector("#gd-wv");
        function setWidth(w) {
          if (!w) { frame.style.width = ""; wv.textContent = "Fit"; wr.value = Math.min(1600, frame.clientWidth); return; }
          frame.style.width = w + "px"; wv.textContent = w + "px"; wr.value = w;
        }
        wr.addEventListener("input", function () { setWidth(+wr.value); });
        Array.prototype.forEach.call(panel.querySelectorAll("[data-w]"), function (b) {
          b.addEventListener("click", function () { setWidth(+b.getAttribute("data-w")); });
        });
        setWidth(0);

        // Output
        var msg = panel.querySelector("#gd-msg"), out = panel.querySelector("#gd-out");
        function say(text, isErr) { msg.textContent = text; msg.className = "gd-msg" + (isErr ? " err" : ""); }
        function copy(text, okText) {
          out.value = text; out.style.display = "block"; out.focus(); out.select();
          var ok = function () { say(okText); };
          if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, function () { document.execCommand("copy"); ok(); });
          else { document.execCommand("copy"); ok(); }
        }
        function download(name, text) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([text], { type: name.slice(-3) === ".js" ? "text/javascript" : "text/html" }));
          a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
        }

        panel.querySelector("#gd-copy").addEventListener("click", function () {
          copy(graphicSource(), "Copied. Paste it over the settings block in this graphic's index.html (between the SETTINGS START and END lines).");
        });
        panel.querySelector("#gd-copyb").addEventListener("click", function () {
          copy(brandSource(), "Copied. Replace everything in shared/brand.js with it.");
        });
        panel.querySelector("#gd-dlb").addEventListener("click", function () {
          download("brand.js", brandSource() + "\n");
          say("Downloaded brand.js. It replaces shared/brand.js and affects every graphic.");
        });
        panel.querySelector("#gd-dl").addEventListener("click", function () {
          fetch(location.href.split(/[?#]/)[0], { cache: "no-store" })
            .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
            .then(function (src) {
              var a = src.indexOf(MARK_START), b = src.indexOf(MARK_END);
              if (a < 0 || b < 0) throw new Error();
              download("index.html", src.slice(0, a + MARK_START.length) + "\n" + graphicSource() + "\n" + src.slice(b));
              say("Downloaded index.html with this graphic's settings built in. Brand changes need brand.js too.");
            })
            .catch(function () { say("Download only works on the published page or a local preview server. Use Copy settings instead.", true); });
        });
        panel.querySelector("#gd-reset").addEventListener("click", function () {
          if (!confirm("Discard all your design-mode changes (this graphic and brand) and go back to the saved files?")) return;
          try { localStorage.removeItem(storeB); localStorage.removeItem(storeG); } catch (e) {}
          location.reload();
        });
      }
    });

    /* ---------- export: settings blocks in the same format as the files ---------- */
    function line(indent, key, value, help) {
      var s = indent + key + ": " + JSON.stringify(value) + ",";
      if (!help) return s;
      while (s.length < 46) s += " ";
      return s + " // " + help;
    }
    function graphicSource() {
      var lines = [SETTINGS_HEADER, "var SETTINGS = {"];
      cfg.groups.forEach(function (g, gi) {
        if (gi) lines.push("");
        lines.push("  // ---- " + g.name + " ----");
        g.fields.forEach(function (f) { lines.push(line("  ", f.key, G[f.key], f.help)); });
      });
      if (overrides.length) {
        lines.push("", "  // ---- Brand overrides (this graphic only) ----");
        overrides.forEach(function (k) { lines.push(line("  ", k, G[k], brandFields[k].help)); });
      }
      lines.push("};");
      return lines.join("\n");
    }
    function brandSource() {
      var lines = [BRAND_HEADER, "var BRAND = {"];
      BRAND_GROUPS.forEach(function (g) {
        lines.push("  // ---- " + g.name + " ----");
        g.fields.forEach(function (f) { lines.push(line("  ", f.key, B[f.key], f.help)); });
        lines.push("");
      });
      lines.push("  // ---- Palette: colours graphics refer to by name, e.g. S.gasOperating ----");
      lines.push("  palette: {");
      Object.keys(PAL).forEach(function (sec) {
        lines.push("    " + JSON.stringify(sec) + ": {");
        Object.keys(PAL[sec]).forEach(function (k) { lines.push(line("      ", k, PAL[sec][k])); });
        lines.push("    },");
      });
      lines.push("  },");
      lines.push("};");
      return lines.join("\n");
    }
  };

  function fieldMap(groups) {
    var m = {};
    groups.forEach(function (g) { g.fields.forEach(function (f) { m[f.key] = f; }); });
    return m;
  }
  function humanize(k) {
    return k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, function (c) { return c.toUpperCase(); });
  }

  // Screen-reader table with the full dataset
  function buildTable(root, table) {
    var t = document.createElement("table");
    t.className = "sr-only";
    var html = "<tr>" + table.headers.map(function (h) { return "<th scope='col'>" + h + "</th>"; }).join("") + "</tr>";
    table.data.forEach(function (d) {
      html += "<tr>" + table.headers.map(function (h, i) {
        return i ? "<td>" + d[h] + "</td>" : "<th scope='row'>" + d[h] + "</th>";
      }).join("") + "</tr>";
    });
    t.innerHTML = html;
    root.appendChild(t);
  }

  // Lets the host page auto-size the iframe (see the embed snippet in README.md)
  function postHeight() {
    if (window.parent === window) return;
    // body height (not the page's scrollHeight) so the iframe can shrink as well as grow
    var h = Math.ceil(document.body.getBoundingClientRect().height);
    window.parent.postMessage({ type: "dv-height", height: h }, "*");
  }
})();
