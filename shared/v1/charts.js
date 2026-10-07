/* ==================================================================
 * BFF data visuals: shared chart pieces, version 1
 *
 * Loaded only by bar, line and pictogram graphics, after core.js
 * (and charts.css after core.css). The first graphics (gas trackers, maps)
 * don't load it, so nothing here can change them.
 *
 *   DV.bars(o)        vertical bars: stacked, 100%, floating (waterfall), small multiples
 *   DV.hbars(o)       horizontal stacked bars, with labels inside and totals at the end
 *   DV.lines(o)       lines or stacked areas on a year scale, end labels, reference lines
 *   DV.chartLegend(o) legend, optionally clickable to hide and show series
 *   DV.viewButtons(o) a row of buttons to switch views (units / capacity, filters)
 *   DV.notes(el, text) paragraphs under the footer, one per line, [links](https://…) allowed
 *   DV.placeTip(tip, svg, x, y, html), DV.hideTip(tip)
 *   DV.textColorOn(bg)  black or white, whichever reads better on that colour
 *   DV.sigFig(v, n)    rounds to n significant figures
 * ================================================================== */
(function () {
  "use strict";
  var DV = window.DV, el = DV.el;

  function ticks(max, step) {
    var t = [];
    for (var i = 0; i * step <= max + 1e-9; i++) t.push(+(i * step).toFixed(10));
    return t;
  }
  DV.ticks = ticks;
  // Axis text size: set by the whole graphic's width (DV.chartSizes), so every panel of a graphic uses the same size
  DV.axisFs = function (S, width) { return S.axisSize * DV.clamp((DV.graphicWidth || width) / 700, 0.8, 1); };
  // Axis for a data maximum: about n ticks; fixedStep > 0 forces the step; roundUp ends on a tick
  DV.niceAxis = function (dataMax, n, roundUp, fixedStep) {
    var step = fixedStep > 0 ? fixedStep : DV.niceStep((dataMax || 1) / (n || 4));
    var max = roundUp === false ? Math.max(dataMax * 1.05, step) : Math.max(step, Math.ceil(dataMax / step - 1e-9) * step);
    return { max: max, step: step };
  };
  // Subtitle (one paragraph per line) and notes under the footer, from S.subtitle and S.notes
  DV.chartText = function (S) {
    var sub = document.getElementById("sub");
    if (sub) sub.innerHTML = String(S.subtitle || "").split(/\n/).filter(function (s) { return s.trim(); })
      .map(function (s) { return "<p>" + DV.linkify(s) + "</p>"; }).join("");
    DV.notes(document.getElementById("notes"), S.notes);
  };
  // Call at the start of render: sizes that shrink on small screens
  DV.chartSizes = function (ctx) {
    var S = ctx.S, st = ctx.root.style;
    DV.graphicWidth = ctx.W;
    st.setProperty("--dvc-sub-size", ctx.sz(S.subtitleSize || 18, 14) + "px");
    if (S.buttonsAlign) st.setProperty("--dvc-buttons-align", { left: "flex-start", right: "flex-end" }[S.buttonsAlign] || "center");
    if (S.smallHeadingSize) st.setProperty("--dvc-small-heading", ctx.sz(S.smallHeadingSize, 12) + "px");
  };
  // Heading text where {words in braces} are coloured (e.g. to match a series)
  DV.colorWords = function (text, color) {
    return DV.linkify(text).replace(/\{([^}]+)\}/g, '<span style="color:' + color + '">$1</span>');
  };

  // Measures text with the page's font (falls back to an estimate before fonts load)
  var measureCanvas;
  DV.textWidth = function (s, fs, weight) {
    try {
      measureCanvas = measureCanvas || document.createElement("canvas");
      var g = measureCanvas.getContext("2d");
      var fam = getComputedStyle(document.documentElement).getPropertyValue("--dv-font") || "Inter, sans-serif";
      g.font = (weight || 400) + " " + fs + "px " + fam;
      return g.measureText(String(s)).width;
    } catch (e) { return String(s).length * fs * 0.56; }
  };

  DV.sigFig = function (v, n) {
    if (!v) return 0;
    var p = Math.pow(10, n - Math.ceil(Math.log(Math.abs(v)) / Math.LN10));
    return Math.round(v * p) / p;
  };

  // Black or white text on a background colour
  DV.textColorOn = function (hex) {
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    var c = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return L > 0.33 ? "#000000" : "#ffffff";
  };

  /* ------------------------------------------------------------------
   * TOOLTIP: the .dv-tooltip element sits inside a positioned container
   * ------------------------------------------------------------------ */
  DV.placeTip = function (tip, svg, px, py, html) {
    if (html != null) tip.innerHTML = html;
    tip.classList.add("on");
    var box = tip.offsetParent || svg.parentNode;
    var rect = svg.getBoundingClientRect(), pr = box.getBoundingClientRect();
    var k = rect.width / (+svg.getAttribute("width") || rect.width);
    var x = rect.left - pr.left + px * k, y = rect.top - pr.top + py * k;
    var tw = tip.offsetWidth, th = tip.offsetHeight, bw = box.clientWidth;
    var left = x + 14;
    if (left + tw > bw) left = x - tw - 14;
    if (left < 0) left = DV.clamp(x - tw / 2, 0, Math.max(0, bw - tw));
    var top = Math.max(0, y - th / 2);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  };
  DV.hideTip = function (tip) { if (tip) tip.classList.remove("on"); };
  // One tooltip row: colour dot, label, value
  DV.tipRow = function (color, label, value, cls) {
    return '<div class="r' + (cls ? " " + cls : "") + '">' + (color ? '<i style="background:' + color + '"></i>' : "") +
      "<span>" + label + "</span><em>" + value + "</em></div>";
  };

  /* ------------------------------------------------------------------
   * LEGEND: items [{ key, label, color }]; toggle: true makes each item a
   * button that hides/shows its series (hidden = { key: true }), onToggle(hidden)
   * shape: "circle" or "square"
   * ------------------------------------------------------------------ */
  DV.chartLegend = function (o) {
    var lg = document.createElement("div");
    lg.className = "dv-legend dvc-legend" + (o.toggle ? " dvc-toggle" : "") + (o.shape === "square" ? " dvc-square" : "");
    var hidden = o.hidden || {};
    o.items.forEach(function (it) {
      var b = document.createElement(o.toggle ? "button" : "span");
      if (o.toggle) { b.type = "button"; b.setAttribute("aria-pressed", String(!hidden[it.key])); }
      var dot = document.createElement("i"); dot.style.background = it.color; b.appendChild(dot);
      b.appendChild(document.createTextNode(it.label));
      if (hidden[it.key]) b.classList.add("off");
      if (o.toggle) b.addEventListener("click", function () {
        hidden[it.key] = !hidden[it.key];
        // never hide everything
        if (o.items.every(function (x) { return hidden[x.key]; })) hidden[it.key] = false;
        b.classList.toggle("off", !!hidden[it.key]);
        b.setAttribute("aria-pressed", String(!hidden[it.key]));
        o.onToggle(hidden);
      });
      lg.appendChild(b);
    });
    lg.hidden_ = hidden;
    return lg;
  };

  /* ------------------------------------------------------------------
   * VIEW BUTTONS: { el, items: [{ key, label }], value, style: "pill" or "tabs", onChange(key) }
   * ------------------------------------------------------------------ */
  DV.viewButtons = function (o) {
    var wrap = o.el;
    DV.clear(wrap);
    wrap.className = "dvc-views dv-control dvc-views-" + (o.style || "pill");
    var grp = document.createElement("div"); grp.className = "dvc-seg"; grp.setAttribute("role", "group");
    if (o.ariaLabel) grp.setAttribute("aria-label", o.ariaLabel);
    o.items.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = it.label;
      b.setAttribute("aria-pressed", String(it.key === o.value));
      b.addEventListener("click", function () {
        if (it.key === o.value) return;
        o.value = it.key;
        Array.prototype.forEach.call(grp.children, function (c, i) { c.setAttribute("aria-pressed", String(o.items[i].key === o.value)); });
        o.onChange(it.key);
      });
      grp.appendChild(b);
    });
    wrap.appendChild(grp);
    return wrap;
  };

  // Paragraphs under the footer: one per line, links as [text](https://…)
  DV.notes = function (node, text) {
    if (!node) return;
    node.innerHTML = String(text || "").split(/\n/).filter(function (s) { return s.trim(); })
      .map(function (s) { return "<p>" + DV.linkify(s) + "</p>"; }).join("");
  };

  // Text with "|" line breaks and wrapping to maxW, as tspans; returns the number of lines
  function multiline(textEl, str, x, y, lh, maxW, fs, weight, valign) {
    var lines = [];
    String(str).split("|").forEach(function (part) {
      var words = part.trim().split(/\s+/), line = "";
      words.forEach(function (w) {
        var t = line ? line + " " + w : w;
        if (line && maxW && DV.textWidth(t, fs, weight) > maxW) { lines.push(line); line = w; } else line = t;
      });
      if (line) lines.push(line);
    });
    var y0 = valign === "middle" ? y - (lines.length - 1) * lh / 2 : valign === "bottom" ? y - (lines.length - 1) * lh : y;
    lines.forEach(function (ln, i) { el("tspan", { x: x, y: y0 + i * lh }, textEl).textContent = ln; });
    return lines.length;
  }
  DV.multiline = multiline;

  function sizeSvg(svg, w, h) {
    DV.clear(svg);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
  }

  /* ------------------------------------------------------------------
   * VERTICAL BARS
   * o = { S, svg, tip, width, height, rows, label: fn(row, i) -> x label text,
   *       series: [{ key, label, color }] bottom of the stack first,
   *       yMax, tickStep, fmtY(v), percent (each bar = 100%), gap (0-1 of the band),
   *       base: fn(row, i) -> value the bar starts from (waterfall),
   *       topLabel: fn(row, i) -> text above the bar, topLabelSize,
   *       highlight: { index, color } band behind one bar, from the top of the chart,
   *       xEvery (label every n bars; default: as many as fit, first bar first),
   *       xLabelAt: fn(i) -> true to show (overrides xEvery),
   *       yAxis (default true), yTickCount (small multiples), sep (colour between segments),
   *       tooltip: fn(i) -> html, compact (smaller margins for small multiples) }
   * Returns { x(i) left edge, bw, band, y(v), m, iw, ih }.
   * ------------------------------------------------------------------ */
  DV.bars = function (o) {
    var S = o.S, svg = o.svg, W = o.width, H = o.height, rows = o.rows, n = rows.length;
    sizeSvg(svg, W, H);
    var fs = o.fs || DV.axisFs(S, W);
    var fmtY = o.fmtY || function (v) { return DV.fmt(v, o.unit, o.decimals); };
    var yt = ticks(o.yMax, o.tickStep);
    var tickText = yt.map(fmtY);
    var longest = o.yAxis === false ? 0 : Math.max.apply(null, tickText.map(function (s) { return DV.textWidth(s, fs); }));
    var m = { top: o.top != null ? o.top : (o.topLabel ? (o.topLabelSize || fs) * 1.6 : 8), right: o.right != null ? o.right : 4,
      bottom: o.xAxis === false ? 2 : fs + 10, left: o.yAxis === false ? 2 : longest + 8 };
    var iw = Math.max(1, W - m.left - m.right);
    var band = iw / Math.max(1, n), gap = o.gap == null ? 0.2 : o.gap, bw = band * (1 - gap);
    // every label shown (xEvery: 1) but they don't fit side by side: slant them
    var widest = 0;
    if (o.xAxis !== false) rows.forEach(function (d, i) { widest = Math.max(widest, DV.textWidth(o.label(d, i), fs)); });
    var slant = o.xAxis !== false && o.xEvery === 1 && widest + fs * 0.4 > band;
    if (slant) m.bottom = widest * 0.71 + fs + 8;
    var ih = Math.max(1, H - m.top - m.bottom);
    var x = function (i) { return m.left + band * i + (band - bw) / 2; };
    var y = function (v) { return m.top + ih - (DV.clamp(v, 0, o.yMax) / o.yMax) * ih; };

    var g = el("g", {}, svg);
    if (o.highlight && o.highlight.index != null && o.highlight.index < n) {
      el("rect", { x: m.left + band * o.highlight.index, y: 0, width: band, height: y(0), fill: o.highlight.color }, g);
    }
    yt.forEach(function (v, i) {
      if (v > 0 && S.showGrid && o.grid !== false) el("line", { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), stroke: S.gridColor }, g);
      if (o.yAxis !== false) el("text", { x: m.left - 6, y: y(v), "text-anchor": "end", "dominant-baseline": "middle", "font-size": fs, fill: S.axisColor }, g)
        .textContent = tickText[i];
    });
    el("line", { x1: m.left, x2: W - m.right, y1: y(0), y2: y(0), stroke: S.axisColor, "stroke-opacity": 0.3 }, g);

    // x labels
    if (o.xAxis !== false) {
      var every = o.xEvery || Math.max(1, Math.ceil((widest + fs * 0.8) / band));
      rows.forEach(function (d, i) {
        var show = o.xLabelAt ? o.xLabelAt(i, n) : i % every === 0;
        if (!show) return;
        var cx = x(i) + bw / 2, lw = DV.textWidth(o.label(d, i), fs);
        // skip a label that would run past the chart's right edge (e.g. into the next panel)
        if (!slant && o.xAlign !== "start" && cx + lw / 2 > W + 10 && i > 0) return;
        el("line", { x1: cx, x2: cx, y1: y(0), y2: y(0) + 4, stroke: S.axisColor, "stroke-opacity": 0.3 }, g);
        if (slant) {
          el("text", { x: cx, y: y(0) + fs * 0.9, "text-anchor": "end", "font-size": fs, fill: S.axisColor,
            transform: "rotate(-45 " + cx + " " + (y(0) + fs * 0.9) + ")" }, g).textContent = o.label(d, i);
          return;
        }
        var anchor = o.xAlign === "start" ? "start" : "middle";
        el("text", { x: anchor === "start" ? x(i) : cx, y: y(0) + fs + 4, "text-anchor": anchor, "font-size": fs, fill: S.axisColor }, g)
          .textContent = o.label(d, i);
      });
    }

    // bars
    var bars = el("g", {}, svg), tops = [];
    rows.forEach(function (d, i) {
      var base = o.base ? o.base(d, i) : 0, total = 0;
      if (o.percent) o.series.forEach(function (s) { total += +d[s.key] || 0; });
      o.series.forEach(function (s) {
        var v = +d[s.key] || 0;
        if (o.percent) v = total ? v / total * 100 : 0;
        if (v <= 0) return;
        var y0 = y(base), y1 = y(base + v);
        base += v;
        var r = el("rect", { x: x(i), y: y1, width: bw, height: Math.max(0, y0 - y1), fill: s.color }, bars);
        if (o.opacity != null) r.setAttribute("fill-opacity", o.opacity);
        if (o.sep) { r.setAttribute("stroke", o.sep); r.setAttribute("stroke-width", o.sepWidth || 0.75); }
      });
      tops.push(y(base));
      if (o.topLabel) {
        var tl = o.topLabel(d, i);
        if (tl !== "" && tl != null) el("text", { x: x(i) + bw / 2, y: y(base) - (o.topLabelSize || fs) * 0.45, "text-anchor": "middle",
          "font-size": o.topLabelSize || fs, fill: o.topLabelColor || S.headingColor, "font-weight": o.topLabelWeight || 400 }, svg).textContent = tl;
      }
    });

    // hover: one column at a time
    if (o.tooltip && o.tip) {
      var hl = el("rect", { y: m.top, height: ih, width: band, fill: "#000", "fill-opacity": 0, "pointer-events": "none" }, g);
      var hit = el("rect", { x: m.left, y: 0, width: iw, height: y(0), fill: "transparent", "class": "dvc-hit" }, svg);
      var show = function (e) {
        var r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * (W / r.width);
        var i = DV.clamp(Math.floor((mx - m.left) / band), 0, n - 1);
        hl.setAttribute("x", m.left + band * i); hl.setAttribute("fill-opacity", 0.05);
        DV.placeTip(o.tip, svg, x(i) + bw / 2, Math.max(m.top, tops[i]), o.tooltip(i));
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", function () { hl.setAttribute("fill-opacity", 0); DV.hideTip(o.tip); });
    }
    return { x: x, bw: bw, band: band, y: y, m: m, iw: iw, ih: ih };
  };

  /* ------------------------------------------------------------------
   * HORIZONTAL BARS (rows top to bottom)
   * o = { S, svg, tip, width, rows, label: fn(row, i) -> category text (or null for no labels),
   *       series: [{ key, label, color }] left first, xMax, tickStep (0 = no axis), fmtX(v),
   *       rowH, gap (0-1 of the row), labelW (px for category labels), labelSize, labelWeight,
   *       percent, bg (panel background colour), inside: fn(v, pct, s) -> text in the segment (shown if it fits),
   *       insideSize, total: fn(row, i, sum) -> text after the bar, totalSize, totalWeight,
   *       tooltip: fn(i) -> html, grid (dashed vertical lines), gridValues ([numbers]: solid lines there), gridColor, tickValues ([numbers]: axis numbers there instead of every tickStep), top, bottom }
   * Sets the svg height; returns { height, x(v), m }.
   * ------------------------------------------------------------------ */
  DV.hbars = function (o) {
    var S = o.S, svg = o.svg, W = o.width, rows = o.rows, n = rows.length;
    var fs = o.fs || DV.axisFs(S, W);
    var fmtX = o.fmtX || function (v) { return DV.fmt(v); };
    var showAxis = o.tickStep > 0 || !!(o.tickValues && o.tickValues.length);
    var xt = o.tickValues && o.tickValues.length ? o.tickValues.filter(function (v) { return v >= 0 && v <= o.xMax + 1e-9; }) :
      showAxis ? ticks(o.xMax, o.tickStep) : [];
    var totalW = 0;
    if (o.total) rows.forEach(function (d, i) { totalW = Math.max(totalW, DV.textWidth(o.total(d, i, 0), o.totalSize || fs, o.totalWeight || 700)); });
    var lastTick = showAxis ? DV.textWidth(fmtX(xt[xt.length - 1]), fs) / 2 : 0;
    var m = { top: o.top != null ? o.top : 4, bottom: showAxis ? fs + 12 : (o.bottom != null ? o.bottom : 2),
      left: o.label ? o.labelW : 0, right: Math.max(o.total ? totalW + 10 : 0, lastTick, o.right || 0) };
    var rowH = o.rowH, H = m.top + n * rowH + m.bottom;
    sizeSvg(svg, W, H);
    var iw = Math.max(1, W - m.left - m.right);
    var x = function (v) { return m.left + DV.clamp(v, 0, o.xMax) / o.xMax * iw; };
    var bh = rowH * (1 - (o.gap == null ? 0.25 : o.gap));
    var yRow = function (i) { return m.top + i * rowH + (rowH - bh) / 2; };

    var g = el("g", {}, svg);
    if (o.bg) el("rect", { x: m.left, y: m.top, width: iw, height: n * rowH, fill: o.bg }, g);
    // gridValues: solid lines at chosen values (e.g. [0, 20, 40, 60])
    (o.gridValues || []).forEach(function (v) {
      if (v >= 0 && v <= o.xMax) el("line", { x1: x(v), x2: x(v), y1: m.top, y2: m.top + n * rowH, stroke: o.gridColor || S.gridColor, "stroke-width": 1 }, g);
    });
    xt.forEach(function (v) {
      if (o.grid && v > 0) el("line", { x1: x(v), x2: x(v), y1: m.top, y2: m.top + n * rowH, stroke: S.gridColor, "stroke-dasharray": "4 4" }, g);
      el("text", { x: x(v), y: m.top + n * rowH + fs + 6, "text-anchor": "middle", "font-size": fs, fill: S.axisColor }, g).textContent = fmtX(v);
    });
    if (o.axisLine !== false) el("line", { x1: m.left, x2: m.left, y1: m.top, y2: m.top + n * rowH, stroke: S.axisColor, "stroke-opacity": 0.35 }, g);

    var bars = el("g", {}, svg), ends = [];
    rows.forEach(function (d, i) {
      var yy = yRow(i);
      if (o.label) {
        var lt = el("text", { x: m.left - 8, y: yy + bh / 2, "text-anchor": "end", "dominant-baseline": "middle",
          "font-size": o.labelSize || fs, "font-weight": o.labelWeight || 400, fill: S.headingColor }, g);
        lt.textContent = o.label(d, i);
      }
      var total = 0;
      o.series.forEach(function (s) { total += +d[s.key] || 0; });
      var acc = 0;
      o.series.forEach(function (s) {
        var v = +d[s.key] || 0;
        if (v <= 0) return;
        var val = o.percent ? (total ? v / total * 100 : 0) : v;
        var x0 = x(acc), x1 = x(acc + val);
        acc += val;
        el("rect", { x: x0, y: yy, width: Math.max(0, x1 - x0), height: bh, fill: s.color,
          stroke: o.sep || "none", "stroke-width": o.sep ? (o.sepWidth || 1) : 0 }, bars);
        if (o.inside) {
          var txt = o.inside(v, total ? v / total * 100 : 0, s), isz = o.insideSize || fs * 0.9;
          if (txt && DV.textWidth(txt, isz) + 8 <= x1 - x0) {
            var mid = o.insideAlign === "center";   // insideAlign: "left" (default) or "center" of the segment
            el("text", { x: mid ? (x0 + x1) / 2 : x0 + 4, y: yy + bh / 2, "text-anchor": mid ? "middle" : "start",
              "dominant-baseline": "middle", "font-size": isz, fill: DV.textColorOn(s.color) }, bars).textContent = txt;
          }
        }
      });
      ends.push(x(acc));
      if (o.total && (total > 0 || o.totalZero)) {
        el("text", { x: x(acc) + 6, y: yy + bh / 2, "dominant-baseline": "middle", "font-size": o.totalSize || fs,
          "font-weight": o.totalWeight || 700, fill: S.headingColor }, bars).textContent = o.total(d, i, total);
      }
    });

    if (o.tooltip && o.tip) {
      var hit = el("rect", { x: 0, y: m.top, width: W, height: n * rowH, fill: "transparent", "class": "dvc-hit dvc-hit-h" }, svg);
      var hl = el("rect", { x: m.left, height: rowH, width: iw, fill: "#000", "fill-opacity": 0, "pointer-events": "none" }, g);
      var show = function (e) {
        var r = svg.getBoundingClientRect(), my = (e.clientY - r.top) * (H / r.height);
        var i = DV.clamp(Math.floor((my - m.top) / rowH), 0, n - 1);
        hl.setAttribute("y", m.top + i * rowH); hl.setAttribute("fill-opacity", 0.05);
        var mx = (e.clientX - r.left) * (W / r.width);
        DV.placeTip(o.tip, svg, Math.min(Math.max(mx, m.left), ends[i]), yRow(i) + bh / 2, o.tooltip(i));
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", function () { hl.setAttribute("fill-opacity", 0); DV.hideTip(o.tip); });
    }
    return { height: H, x: x, m: m };
  };

  /* ------------------------------------------------------------------
   * LINES / STACKED AREAS on a numeric x scale (years placed in proportion)
   * o = { S, svg, tip, width, height, xs: [numbers], xLabel: fn(x) -> text, xTicks: [numbers] (default: every x that fits),
   *       series: [{ key, label, color, values: [...] }] (stacked: bottom first),
   *       stacked, area (fill under each line), areaOpacity, smooth, lineWidth, dotSize (0 = none),
   *       yMax, tickStep, fmtY(v), endLabels: { width, size, weight }, refs: [{ y, label, size, weight }],
   *       vlines: [{ x, label, size }], tooltip: fn(i) -> html, padX (px inset at the ends) }
   * ------------------------------------------------------------------ */
  DV.lines = function (o) {
    var S = o.S, svg = o.svg, W = o.width, H = o.height, xs = o.xs, n = xs.length;
    sizeSvg(svg, W, H);
    var fs = o.fs || DV.axisFs(S, W);
    var fmtY = o.fmtY || function (v) { return DV.fmt(v); };
    var yt = ticks(o.yMax, o.tickStep), tickText = yt.map(fmtY);
    var longest = Math.max.apply(null, tickText.map(function (s) { return DV.textWidth(s, fs); }));
    var EL = o.endLabels;
    var m = { top: o.top != null ? o.top : 10, right: EL ? EL.width + 12 : (o.right != null ? o.right : 12), bottom: fs + 12, left: longest + 10 };
    var iw = Math.max(1, W - m.left - m.right), ih = Math.max(1, H - m.top - m.bottom);
    var padX = o.padX || 0, x0 = xs[0], x1 = xs[n - 1];
    var x = function (v) { return m.left + padX + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (iw - padX * 2); };
    var y = function (v) { return m.top + ih - (DV.clamp(v, 0, o.yMax) / o.yMax) * ih; };

    var g = el("g", {}, svg);
    yt.forEach(function (v, i) {
      if (v > 0 && S.showGrid) el("line", { x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v), stroke: S.gridColor }, g);
      el("text", { x: m.left - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle", "font-size": fs, fill: S.axisColor }, g)
        .textContent = tickText[i];
    });
    el("line", { x1: m.left, x2: m.left + iw, y1: y(0), y2: y(0), stroke: S.axisColor, "stroke-opacity": 0.35 }, g);
    var xLabel = o.xLabel || function (v) { return String(v); };
    var xTicks = o.xTicks;
    if (!xTicks) {
      var wMax = Math.max.apply(null, xs.map(function (v) { return DV.textWidth(xLabel(v), fs); }));
      var minGap = wMax + fs, last = -1e9;
      xTicks = [];
      xs.forEach(function (v) { if (x(v) - last >= minGap) { xTicks.push(v); last = x(v); } });
    }
    xTicks.forEach(function (v) {
      el("line", { x1: x(v), x2: x(v), y1: y(0), y2: y(0) + 5, stroke: S.axisColor, "stroke-opacity": 0.35 }, g);
      el("text", { x: x(v), y: y(0) + fs + 6, "text-anchor": "middle", "font-size": fs, fill: S.axisColor }, g).textContent = xLabel(v);
    });

    // values (stacked or not)
    var base = xs.map(function () { return 0; });
    var layers = o.series.map(function (s) {
      var pts = s.values.map(function (v, i) {
        v = +v || 0;
        var y0 = o.stacked ? base[i] : 0, y1 = y0 + v;
        if (o.stacked) base[i] = y1;
        return { x: x(xs[i]), y0: y(y0), y1: y(y1), v: v };
      });
      return { s: s, pts: pts };
    });

    function path(pts, key) {
      var p = pts.map(function (q) { return [q.x, q[key]]; });
      if (!o.smooth || p.length < 3) return "M" + p.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L");
      return monotone(p);
    }
    var areas = el("g", {}, svg), linesG = el("g", {}, svg);
    if (o.vlines) o.vlines.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (v, k, list) {
      if (!(v.x >= x0 && v.x <= x1)) return;
      var room = x(v.x) - (k ? x(list[k - 1].x) : m.left) - 12;
      el("line", { x1: x(v.x), x2: x(v.x), y1: 2, y2: y(0), stroke: v.color || "#777", "stroke-width": 1.5, "stroke-dasharray": "3 4" }, g);
      if (v.label) {
        var t = el("text", { "text-anchor": "end", "font-size": v.size || fs, fill: S.headingColor }, svg);
        var parts = String(v.label).split("|"), fits = parts.every(function (p) { return DV.textWidth(p.trim(), v.size || fs) <= room; });
        multiline(t, fits ? v.label : parts.join(" "), x(v.x) - 8, (v.size || fs) * 1.05, (v.size || fs) * 1.2, fits ? 0 : room, v.size || fs);
      }
    });
    layers.forEach(function (L) {
      if (o.area) {
        var bottom = L.pts.slice().reverse();
        var d = path(L.pts, "y1") + "L" + (o.smooth && bottom.length > 2 ? monotone(bottom.map(function (q) { return [q.x, q.y0]; })).slice(1) :
          bottom.map(function (q) { return q.x.toFixed(1) + "," + q.y0.toFixed(1); }).join("L")) + "Z";
        el("path", { d: d, fill: L.s.fill || L.s.color, "fill-opacity": o.areaOpacity == null ? S.areaOpacity : o.areaOpacity }, areas);
      }
      if ((L.s.width || o.lineWidth) > 0) el("path", { d: path(L.pts, "y1"), fill: "none", stroke: L.s.color, "stroke-width": L.s.width || o.lineWidth,
        "stroke-linejoin": "round", "stroke-linecap": "round" }, linesG);
    });
    if (o.refs) o.refs.forEach(function (r) {
      el("line", { x1: m.left, x2: m.left + iw, y1: y(r.y), y2: y(r.y), stroke: r.color || "#000", "stroke-width": 1, "stroke-dasharray": "4 3" }, svg);
      if (r.label) el("text", { x: m.left + iw - 4, y: y(r.y) + (r.size || fs) * 1.25, "text-anchor": "end", "font-size": r.size || fs,
        "font-weight": r.weight || 700, fill: r.color || S.headingColor }, svg).textContent = r.label;
    });
    var dotR = o.dotSize || 0, dotEls = [];
    var dots = el("g", {}, svg);
    layers.forEach(function (L) {
      dotEls.push(L.pts.map(function (q) { return el("circle", { cx: q.x, cy: q.y1, r: dotR, fill: L.s.color }, dots); }));
    });

    // labels at the end of each line, pushed apart so they don't overlap
    if (EL) {
      var lsz = EL.size || fs, lh = lsz * 1.1;
      var labs = layers.map(function (L) {
        var t = el("text", { "font-size": lsz, "font-weight": EL.weight || 700, fill: L.s.color }, svg);
        var nl = multiline(t, L.s.label || L.s.key, 0, 0, lh, EL.width, lsz, EL.weight || 700);
        return { t: t, h: nl * lh, y: L.pts[n - 1].y1, want: L.pts[n - 1].y1 };
      });
      var order = labs.slice().sort(function (a, b) { return a.want - b.want; });
      for (var it = 0; it < 30; it++) {
        var moved = false;
        for (var k = 1; k < order.length; k++) {
          var a = order[k - 1], b = order[k], need = (a.h + b.h) / 2 + 2;
          if (b.y - a.y < need) { var d = (need - (b.y - a.y)) / 2; a.y -= d; b.y += d; moved = true; }
        }
        if (!moved) break;
      }
      labs.forEach(function (L) {
        var top = L.y - L.h / 2 + lh * 0.8;
        Array.prototype.forEach.call(L.t.childNodes, function (ts, i) { ts.setAttribute("x", x(x1) + 10); ts.setAttribute("y", top + i * lh); });
      });
    }

    if (o.tooltip && o.tip) {
      var guide = el("line", { y1: m.top, y2: y(0), stroke: "#888", "stroke-dasharray": "3 3", opacity: 0, "pointer-events": "none" }, svg);
      var hit = el("rect", { x: m.left, y: m.top, width: iw, height: ih, fill: "transparent", "class": "dvc-hit" }, svg);
      var active = -1, big = Math.max(dotR, 3) * 1.6;
      var show = function (e) {
        var r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) * (W / r.width), best = 0;
        for (var i = 1; i < n; i++) if (Math.abs(x(xs[i]) - mx) < Math.abs(x(xs[best]) - mx)) best = i;
        if (active > -1) dotEls.forEach(function (row) { row[active].setAttribute("r", dotR); });
        dotEls.forEach(function (row) { row[best].setAttribute("r", big); });
        active = best;
        guide.setAttribute("x1", x(xs[best])); guide.setAttribute("x2", x(xs[best])); guide.setAttribute("opacity", 1);
        var topY = Math.min.apply(null, layers.map(function (L) { return L.pts[best].y1; }));
        DV.placeTip(o.tip, svg, x(xs[best]), Math.max(m.top + 20, topY), o.tooltip(best));
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", function () {
        guide.setAttribute("opacity", 0); DV.hideTip(o.tip);
        if (active > -1) dotEls.forEach(function (row) { row[active].setAttribute("r", dotR); });
        active = -1;
      });
    }
    return { x: x, y: y, m: m, iw: iw, ih: ih };
  };

  // Smooth curve through points that never overshoots (monotone cubic, like d3.curveMonotoneX)
  function monotone(p) {
    var n = p.length, dx = [], dy = [], s = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx.push(p[i + 1][0] - p[i][0]); dy.push(p[i + 1][1] - p[i][1]); s.push(dx[i] ? dy[i] / dx[i] : 0); }
    t[0] = s[0]; t[n - 1] = s[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = s[i - 1] * s[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / s[i - 1] + (dx[i] + 2 * dx[i - 1]) / s[i]);
    var d = "M" + p[0][0].toFixed(1) + "," + p[0][1].toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += "C" + (p[i][0] + h).toFixed(1) + "," + (p[i][1] + t[i] * h).toFixed(1) + " " + (p[i + 1][0] - h).toFixed(1) + "," +
        (p[i + 1][1] - t[i + 1] * h).toFixed(1) + " " + p[i + 1][0].toFixed(1) + "," + p[i + 1][1].toFixed(1);
    }
    return d;
  }

  /* ------------------------------------------------------------------
   * STANDARD SETTINGS used by several chart graphics
   * ------------------------------------------------------------------ */
  DV.chartTextGroup = function (defs) {
    return { name: "Text", fields: [
      { key: "title",    type: "text", def: defs.title || "", help: "Main title" },
      { key: "subtitle", type: "textarea", rows: 3, def: defs.subtitle || "", help: "Subtitle under the title, one paragraph per line (empty = none)" },
      { key: "subtitleSize", type: "range", min: 11, max: 32, step: 0.5, def: defs.subtitleSize || 18, help: "Subtitle size in px (shrinks on small screens)" }
    ].concat(defs.extra || []).concat([
      { key: "footer",   type: "text", def: defs.footer || "", help: "Footer; links as [text](https://…). Leave empty to hide" },
      { key: "notes",    type: "textarea", rows: 3, def: defs.notes || "", help: "Notes under the footer, one paragraph per line; links as [text](https://…)" }
    ]) };
  };
})();
