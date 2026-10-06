/* ==================================================================
 * BFF data visuals: shared map pieces, version 1
 *
 * Loaded only by map graphics, after core.js, shared/bff-countries.js and
 * the libraries in shared/vendor/ (d3-array, d3-geo, topojson-client,
 * topojson-simplify). Charts don't load it, so nothing here can change them.
 *
 *   DV.loadGeo(name)            country shapes from shared/geo/ (cached)
 *   DV.mapShapes(topo, S)       simplified shapes, small islands removed
 *   DV.mapProjection(S, w, h)   projection fitted to the view box
 *   DV.mapLayout(el, root)      slots around, on top of and beside the map for the widgets
 *   DV.mapView(stage)           draws countries and bubbles; hover, tap, select
 *   DV.mapLegend / gradientLegend / bubbleLegend, DV.mapSearch, DV.timeSlider
 *   DV.mapGroups(defaults), DV.sliderGroup(defaults), DV.bubbleGroup(defaults)   standard design-mode settings
 *   DV.bubbleRadius(S, maxValue, mapWidth)   bubble sizes
 *   DV.parseDate, DV.colorRamp, DV.sizeScale, DV.isBFF, DV.isoCode
 *
 * Every map uses the same shapes (shared/geo/, Natural Earth, one feature
 * per country, id = ISO alpha-2 code: GB, GR, XK for Kosovo).
 * ================================================================== */
(function () {
  "use strict";
  var DV = window.DV, d3 = window.d3, topojson = window.topojson;
  var SHARED = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/v1\/map\.js(\?.*)?$/, "") : "../shared/";
  })();
  DV.sharedUrl = SHARED;
  var EARTH_KM2 = 6371.0088 * 6371.0088;

  /* ------------------------------------------------------------------
   * CHOICES offered in design mode (the names are what SETTINGS stores)
   * ------------------------------------------------------------------ */
  DV.GEOMETRY = {
    "Simple (Natural Earth 110m)": "europe-ne-110m.json",
    "Medium (Natural Earth 50m)": "europe-ne-50m.json",
    "Detailed (Natural Earth 10m, as in Flourish)": "europe-ne-10m.json"
  };
  DV.PROJECTIONS = ["Natural Earth", "Equal Earth", "Lambert equal-area (EU standard, Datawrapper's usual)", "Equal-area conic"];
  DV.POSITIONS = ["above map", "below map", "left of map", "right of map",
    "top-left corner", "top-right corner", "bottom-left corner", "bottom-right corner", "hidden"];
  DV.PANEL_POSITIONS = ["side panel (right)", "side panel (left)"].concat(DV.POSITIONS);

  // Common ISO codes and names people use, mapped to the codes in shared/geo
  var ALIAS = { UK: "GB", EL: "GR", KS: "XK", KOS: "XK" };
  DV.isoCode = function (v) { v = String(v || "").trim().toUpperCase(); return ALIAS[v] || v; };
  // BFF countries (shared/bff-countries.js)
  var BFF = {};
  (window.BFF_COUNTRIES || []).forEach(function (c) { BFF[DV.isoCode(c)] = true; });
  DV.isBFF = function (id) { return !!BFF[id]; };

  /* ------------------------------------------------------------------
   * SHAPES
   * ------------------------------------------------------------------ */
  var geoCache = {}, shapeCache = {};
  DV.loadGeo = function (name) {
    var file = DV.GEOMETRY[name] || DV.GEOMETRY["Medium (Natural Earth 50m)"];
    if (!geoCache[file]) {
      geoCache[file] = fetch(SHARED + "geo/" + file)
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (t) { t.file = file; return t; });
    }
    return geoCache[file];
  };

  function polyArea(rings) {
    var a = d3.geoArea({ type: "Polygon", coordinates: rings });
    return (a > 2 * Math.PI ? 4 * Math.PI - a : a) * EARTH_KM2;
  }

  /* Features with S.mapDetail (share of points kept, 1 = all) and without
   * islands smaller than S.mapMinIsland km² (a country always keeps its largest part). */
  DV.mapShapes = function (topo, S) {
    var detail = DV.clamp(+S.mapDetail || 1, 0.01, 1), minKm2 = +S.mapMinIsland || 0;
    var key = topo.file + "|" + detail + "|" + minKm2;
    if (shapeCache[key]) return shapeCache[key];
    var t = topo;
    if (detail < 1) {
      if (!topo.pre) topo.pre = topojson.presimplify(JSON.parse(JSON.stringify(topo)), topojson.sphericalTriangleArea);
      t = topojson.simplify(topo.pre, topojson.quantile(topo.pre, 1 - detail));
    }
    var feats = topojson.feature(t, t.objects.countries).features.map(function (f) {
      var g = f.geometry;
      if (g && g.type === "MultiPolygon" && minKm2 > 0) {
        var areas = g.coordinates.map(polyArea), biggest = Math.max.apply(null, areas);
        var kept = g.coordinates.filter(function (p, i) { return areas[i] >= minKm2 || areas[i] === biggest; });
        g = { type: "MultiPolygon", coordinates: kept };
      }
      return { type: "Feature", id: f.id, properties: f.properties, geometry: g };
    }).filter(function (f) { return f.geometry; });
    shapeCache[key] = feats;
    return feats;
  };

  /* ------------------------------------------------------------------
   * PROJECTION: fitted to the view box (S.viewWest/East/South/North),
   * then zoomed (S.mapZoom) and moved (S.mapShiftX/Y, % of the map size)
   * ------------------------------------------------------------------ */
  DV.mapProjection = function (S, w, h) {
    var lon0 = +S.mapCentreLon || 0, latMid = (S.viewSouth + S.viewNorth) / 2, p;
    var proj = S.projection || "";
    if (/^Lambert/.test(proj)) p = d3.geoAzimuthalEqualArea().rotate([-lon0, -latMid]);
    else if (/^Equal-area conic/.test(proj)) {
      var d = (S.viewNorth - S.viewSouth) / 6;
      p = d3.geoConicEqualArea().parallels([S.viewSouth + d, S.viewNorth - d]).rotate([-lon0, 0]);
    } else if (/^Equal Earth/.test(proj)) p = d3.geoEqualEarth().rotate([-lon0, 0]);
    else p = d3.geoNaturalEarth1().rotate([-lon0, 0]);
    // the outline of the view box, as points (avoids polygon winding issues)
    var pts = [], W = S.viewWest, E = S.viewEast, So = S.viewSouth, N = S.viewNorth, i;
    for (i = 0; i <= 20; i++) {
      var lon = W + (E - W) * i / 20, lat = So + (N - So) * i / 20;
      pts.push([lon, So], [lon, N], [W, lat], [E, lat]);
    }
    p.fitSize([w, h], { type: "MultiPoint", coordinates: pts });
    var z = +S.mapZoom || 1, t = p.translate();
    p.scale(p.scale() * z).translate([
      w / 2 + (t[0] - w / 2) * z + (S.mapShiftX || 0) / 100 * w,
      h / 2 + (t[1] - h / 2) * z + (S.mapShiftY || 0) / 100 * h
    ]);
    return p;
  };

  /* ------------------------------------------------------------------
   * LAYOUT: slots above, below, left and right of the map, four corners
   * on top of it, and side panels over the whole graphic (root).
   * place([[element, position, preferBelow], ...], narrow) moves each widget
   * into its slot, in the order given.
   * ------------------------------------------------------------------ */
  function div(cls, parent, tag) {
    var d = document.createElement(tag || "div");
    if (cls) d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }
  DV.mapLayout = function (wrap, root) {
    wrap.classList.add("dvm");
    root = root || wrap;
    root.classList.add("dvm-root");
    var top = div("dvm-slot dvm-top", wrap), mid = div("dvm-mid", wrap), bottom = div("dvm-slot dvm-bottom", wrap);
    var left = div("dvm-slot dvm-left", mid), stage = div("dvm-stage", mid), right = div("dvm-slot dvm-right", mid);
    var slots = {
      "above map": top, "below map": bottom, "left of map": left, "right of map": right,
      "top-left corner": div("dvm-corner dvm-tl", stage), "top-right corner": div("dvm-corner dvm-tr", stage),
      "bottom-left corner": div("dvm-corner dvm-bl", stage), "bottom-right corner": div("dvm-corner dvm-br", stage),
      "side panel (right)": div("dvm-side dvm-side-r", root), "side panel (left)": div("dvm-side dvm-side-l", root)
    };
    return {
      stage: stage,
      // narrow (phones): corners, sides and side panels move above the map, or below it for widgets that prefer it
      place: function (list, narrow) {
        list.forEach(function (it) {
          var el = it[0], pos = it[1], below = it[2];
          if (narrow && pos !== "hidden" && !/^(above|below) map$/.test(pos)) pos = below ? "below map" : "above map";
          el.style.display = pos === "hidden" || !slots[pos] ? "none" : "";
          if (slots[pos]) slots[pos].appendChild(el);
        });
        Object.keys(slots).forEach(function (k) {
          var s = slots[k], any = Array.prototype.some.call(s.children, function (c) { return c.style.display !== "none"; });
          s.classList.toggle("dvm-empty", !any);
        });
      }
    };
  };

  /* ------------------------------------------------------------------
   * MAP VIEW: countries (and optional bubbles) with hover, tap and select.
   * view.draw({ width, height, projection, features, S, style(f) -> {fill, on, opacity} or null })
   *   style null = no data: shown or hidden following S.noDataShow (BFF countries / all / hidden)
   *   Countries in S.smallList (e.g. "MT") get a circle or a zoomed box (S.smallMode).
   * view.restyle(style)          recolour only (time slider, legend filter)
   * view.bubbles([{ id, lon, lat, r, fill, stroke, strokeWidth, opacity }])
   * view.select(id)              outline one country (null clears)
   * view.onHover = function (id, kind) -> tooltip HTML (or "" for none)
   * view.onClick = function (id, kind)
   * ------------------------------------------------------------------ */
  DV.mapView = function (stage) {
    var svg = DV.el("svg", { "class": "dvm-svg", role: "img" }, stage);
    var gLand = DV.el("g", {}, svg), gSmall = DV.el("g", {}, svg), gBub = DV.el("g", {}, svg);
    var gTop = DV.el("g", { "pointer-events": "none" }, svg);
    var tip = div("dv-tooltip dvm-tip", stage);
    var view = { svg: svg, tip: tip, paths: {}, extra: {}, features: [], selected: null, onHover: null, onClick: null };
    var S = {}, styleFn = null, hoverKey = null, hoverEl = null;

    function clearOutline(cls) {
      Array.prototype.forEach.call(gTop.querySelectorAll("." + cls), function (o) { o.parentNode.removeChild(o); });
    }
    // copy of an element (path or circle) drawn as an outline on top
    function outline(els, cls, color, width) {
      clearOutline(cls);
      if (!(width > 0)) return;
      els.forEach(function (el) {
        if (!el) return;
        var c = el.cloneNode(false);
        c.removeAttribute("data-id"); c.removeAttribute("style");
        c.setAttribute("class", cls); c.setAttribute("fill", "none"); c.setAttribute("stroke", color);
        c.setAttribute("stroke-width", width); c.setAttribute("stroke-linejoin", "round");
        gTop.appendChild(c);
      });
    }
    function noData(f) {
      var mode = S.noDataShow || "hidden", bff = DV.isBFF(f.id);
      if (mode === "all countries") return { fill: bff ? S.noDataFill : S.otherFill };
      if (mode === "BFF countries only" && bff) return { fill: S.noDataFill };
      return { hide: true };
    }
    function applyStyle(p, f) {
      var st = styleFn(f) || noData(f);
      p.setAttribute("fill", st.fill || S.otherFill);
      p.setAttribute("fill-opacity", st.opacity == null ? 1 : st.opacity);
      p.classList.toggle("dvm-on", !!st.on);
      p.style.display = st.hide ? "none" : "";
    }
    function each(f, fn) {
      if (view.paths[f.id]) fn(view.paths[f.id]);
      (view.extra[f.id] || []).forEach(fn);
    }

    view.draw = function (o) {
      S = o.S; styleFn = o.style;
      svg.setAttribute("width", o.width); svg.setAttribute("height", o.height);
      svg.setAttribute("viewBox", "0 0 " + o.width + " " + o.height);
      svg.style.setProperty("--dvm-fade", S.fadeOpacity == null ? 0.4 : S.fadeOpacity);
      if (o.label) svg.setAttribute("aria-label", o.label);
      var path = d3.geoPath(o.projection);
      view.projection = o.projection;
      DV.clear(gLand); DV.clear(gSmall); DV.clear(gTop);
      view.paths = {}; view.extra = {}; view.features = o.features; hoverKey = null;
      // countries with data last, so their borders sit on top
      var ordered = o.features.slice().sort(function (a, b) { return !!(styleFn(a) || {}).on - !!(styleFn(b) || {}).on; });
      ordered.forEach(function (f) {
        var d = path(f);
        if (!d) return;
        var p = DV.el("path", { d: d, stroke: S.borderColor, "stroke-width": S.borderWidth, "stroke-linejoin": "round",
          "data-id": f.id, "class": "dvm-c" }, gLand);
        applyStyle(p, f);
        view.paths[f.id] = p;
      });
      drawSmall(o);
      if (view.selected) view.select(view.selected);
    };

    // Small countries: a circle on top, or a zoomed copy in a box with a line to the real place
    function drawSmall(o) {
      var mode = S.smallMode || "as they are";
      if (mode === "as they are") return;
      var ids = String(S.smallList || "").split(/[\s,;]+/).map(DV.isoCode).filter(Boolean);
      var unit = o.width / 100, size = Math.max(26, (S.smallSize || 5) * unit);
      o.features.forEach(function (f) {
        if (ids.indexOf(f.id) < 0 || !view.paths[f.id] || view.paths[f.id].style.display === "none") return;
        var at = o.projection(f.properties && f.properties.lx != null ? [f.properties.lx, f.properties.ly] : d3.geoCentroid(f));
        if (!at) return;
        var list = view.extra[f.id] = [];
        if (mode === "circle") {
          var c = DV.el("circle", { cx: at[0], cy: at[1], r: Math.max(3, size / 6), stroke: S.borderColor, "stroke-width": S.borderWidth,
            "data-id": f.id, "class": "dvm-c" }, gSmall);
          applyStyle(c, f); list.push(c);
          return;
        }
        // the box stays inside the map
        var bx = DV.clamp(at[0] + (S.smallDX || 0) * unit - size / 2, 2, o.width - size - 2);
        var by = DV.clamp(at[1] + (S.smallDY || 0) * unit - size / 2, 2, o.height - size - 2);
        var cx = bx + size / 2, cy = by + size / 2;
        // line from the real place to the nearest edge of the box
        var ex = DV.clamp(at[0], bx, bx + size), ey = DV.clamp(at[1], by, by + size);
        if (Math.abs(at[0] - cx) > size / 2 || Math.abs(at[1] - cy) > size / 2) {
          DV.el("line", { x1: at[0], y1: at[1], x2: ex, y2: ey, stroke: S.smallBoxColor, "stroke-width": 0.8 }, gSmall);
        }
        DV.el("rect", { x: bx, y: by, width: size, height: size, fill: S.pageBg && S.pageBg !== "transparent" ? S.pageBg : "#fff", stroke: S.smallBoxColor,
          "stroke-width": 0.8, rx: 2 }, gSmall);
        var c0 = d3.geoCentroid(f), pad = size * 0.14;
        var pz = d3.geoAzimuthalEqualArea().rotate([-c0[0], -c0[1]])
          .fitExtent([[bx + pad, by + pad], [bx + size - pad, by + size - pad]], f);
        var p = DV.el("path", { d: d3.geoPath(pz)(f), stroke: S.borderColor, "stroke-width": S.borderWidth,
          "data-id": f.id, "class": "dvm-c" }, gSmall);
        applyStyle(p, f); list.push(p);
      });
    }

    view.restyle = function (style) {
      if (style) styleFn = style;
      view.features.forEach(function (f) { each(f, function (p) { applyStyle(p, f); }); });
    };
    // Bubbles: largest drawn first so small ones stay on top. Hover and tap pick the nearest bubble
    // (within S.bubbleHit px of its edge), so small dots are easy to catch.
    var bubbleList = [], bubbleEls = {};
    view.bubbles = function (list) {
      DV.clear(gBub); bubbleList = []; bubbleEls = {};
      (list || []).slice().sort(function (a, b) { return b.r - a.r; }).forEach(function (b) {
        var xy = view.projection([b.lon, b.lat]);
        if (!xy || !(b.r > 0)) return;
        var c = DV.el("circle", { cx: xy[0], cy: xy[1], r: b.r, fill: b.fill, "fill-opacity": b.opacity == null ? 1 : b.opacity,
          stroke: b.stroke || "none", "stroke-width": b.strokeWidth || 0, "stroke-opacity": b.strokeOpacity == null ? 1 : b.strokeOpacity,
          "data-id": b.id, "data-kind": "bubble", "class": "dvm-b" }, gBub);
        bubbleList.push({ id: b.id, x: xy[0], y: xy[1], r: b.r, el: c });
        bubbleEls[b.id] = c;
      });
      if (view.selected && view.selectedKind === "bubble") view.select(view.selected, "bubble");
    };
    // a highlighted bubble: an outer ring and an inner ring (like Flourish's highlight)
    function rings(el, cls, inner, outer, width) {
      clearOutline(cls);
      if (!el || !(width > 0)) return;
      var cx = el.getAttribute("cx"), cy = el.getAttribute("cy"), r = +el.getAttribute("r");
      DV.el("circle", { cx: cx, cy: cy, r: r + width / 2, fill: "none", stroke: outer, "stroke-width": width, "class": cls }, gTop);
      DV.el("circle", { cx: cx, cy: cy, r: Math.max(0.5, r - width / 4), fill: "none", stroke: inner, "stroke-width": width / 2, "class": cls }, gTop);
    }
    view.select = function (id, kind) {
      view.selected = id; view.selectedKind = kind || "country";
      clearOutline("dvm-sel");
      if (!id) return;
      if (view.selectedKind === "bubble") rings(bubbleEls[id], "dvm-sel", S.highlightInner, S.highlightOuter, S.highlightWidth);
      else outline([view.paths[id]].concat(view.extra[id] || []), "dvm-sel", S.selectColor, S.selectWidth);
    };
    view.bubbleAt = function (id) { return bubbleEls[id] || null; };

    // ---- interaction ----
    function nearestBubble(evt) {
      if (!bubbleList.length) return null;
      var rect = svg.getBoundingClientRect(), k = (+svg.getAttribute("width") || rect.width) / rect.width;
      var px = (evt.clientX - rect.left) * k, py = (evt.clientY - rect.top) * k;
      var reach = S.bubbleHit == null ? 8 : +S.bubbleHit, best = null, bestScore = Infinity;
      bubbleList.forEach(function (b) {
        var d = Math.sqrt((b.x - px) * (b.x - px) + (b.y - py) * (b.y - py));
        // inside a bubble: the smallest one wins (it's drawn on top); outside: the nearest edge
        var score = d <= b.r ? -1e6 + b.r : d - b.r <= reach ? d - b.r : Infinity;
        if (score < bestScore) { bestScore = score; best = b; }
      });
      return best ? { id: best.id, kind: "bubble", el: best.el } : null;
    }
    function target(evt) {
      var nb = nearestBubble(evt);
      if (nb) return nb;
      var t = evt.target;
      if (!t || !t.getAttribute) return null;
      var id = t.getAttribute("data-id");
      if (!id) return null;
      var kind = t.getAttribute("data-kind") || "country";
      if (kind === "country" && !t.classList.contains("dvm-on")) return null;
      return { id: id, kind: kind, el: t };
    }
    function placeTip(evt) {
      var r = stage.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var x = evt.clientX - r.left + 14, y = evt.clientY - r.top + 14;
      if (x + w > r.width) x = evt.clientX - r.left - w - 14;
      if (x < 0) x = Math.max(0, (r.width - w) / 2);
      if (y + h > r.height) y = Math.max(0, r.height - h);
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }
    function unhover() {
      tip.classList.remove("on");
      clearOutline("dvm-hov");
      svg.classList.remove("dvm-fading");
      if (hoverEl) Array.prototype.forEach.call(svg.querySelectorAll(".dvm-hovered"), function (e) { e.classList.remove("dvm-hovered"); });
      hoverEl = null;
    }
    function hover(t) {
      unhover();
      var style = S.hoverStyle || "outline";
      if (t.kind === "bubble") rings(t.el, "dvm-hov", S.highlightInner, S.highlightOuter, S.highlightWidth);
      if (t.kind === "country") {
        if (/outline/.test(style)) outline([t.el], "dvm-hov", S.hoverColor, S.hoverWidth);
        if (/fade/.test(style)) {
          svg.classList.add("dvm-fading");
          [view.paths[t.id]].concat(view.extra[t.id] || []).forEach(function (e) { if (e) e.classList.add("dvm-hovered"); });
        }
      }
      hoverEl = t.el;
    }
    svg.addEventListener("pointermove", function (evt) {
      if (evt.pointerType === "touch") return;
      var t = target(evt);
      if (!t) { unhover(); hoverKey = null; return; }
      if (t.id + t.kind !== hoverKey) {
        hoverKey = t.id + t.kind;
        hover(t);
        var html = view.onHover ? view.onHover(t.id, t.kind) : "";
        tip.innerHTML = html || "";
        tip.classList.toggle("on", !!html);
      }
      if (tip.classList.contains("on")) placeTip(evt);
    });
    svg.addEventListener("pointerleave", function () { unhover(); hoverKey = null; });
    svg.addEventListener("click", function (evt) {
      var t = target(evt);
      // the popup goes away on click (the panel takes over); it comes back when the pointer moves to another country
      tip.classList.remove("on");
      view.lastPointer = evt.pointerType || "mouse";
      if (view.onClick) view.onClick(t ? t.id : null, t ? t.kind : null);
    });
    view.hideTip = function () { tip.classList.remove("on"); };
    // show the popup next to a bubble (e.g. after a search), as if the pointer were on it
    view.tipAt = function (id, html) {
      var b = bubbleEls[id];
      if (!b || !html) { tip.classList.remove("on"); return; }
      tip.innerHTML = html; tip.classList.add("on");
      var sr = svg.getBoundingClientRect(), st = stage.getBoundingClientRect();
      var k = sr.width / (+svg.getAttribute("width") || sr.width);
      var x = sr.left - st.left + (+b.getAttribute("cx")) * k, y = sr.top - st.top + (+b.getAttribute("cy")) * k, r = +b.getAttribute("r") * k;
      placeTip({ clientX: st.left + x + r, clientY: st.top + y + r });
      hoverKey = id + "bubble";
    };
    return view;
  };

  /* ------------------------------------------------------------------
   * LEGENDS
   * ------------------------------------------------------------------ */
  // Categories: items [{ key, label, color }]. onToggle(activeKeys) makes items clickable filters.
  DV.mapLegend = function (o) {
    var el = div("dvm-legend");
    var active = {};
    o.items.forEach(function (it) { active[it.key] = true; });
    if (o.title) div("dvm-legend-title", el).textContent = o.title;
    var list = div("dvm-legend-items", el);
    o.items.forEach(function (it) {
      var b = div("dvm-li", list, o.onToggle ? "button" : "span");
      if (o.onToggle) { b.type = "button"; b.setAttribute("aria-pressed", "true"); }
      var i = div("", b, "i"); i.style.background = it.color;
      b.appendChild(document.createTextNode(it.label));
      if (!o.onToggle) return;
      b.addEventListener("click", function () {
        var keys = Object.keys(active).filter(function (k) { return active[k]; });
        // first click shows only that category; clicking the only one left shows all again
        if (keys.length === o.items.length) { Object.keys(active).forEach(function (k) { active[k] = k === it.key; }); }
        else if (keys.length === 1 && active[it.key]) { Object.keys(active).forEach(function (k) { active[k] = true; }); }
        else active[it.key] = !active[it.key];
        Array.prototype.forEach.call(list.children, function (c, j) {
          var on = active[o.items[j].key];
          c.classList.toggle("off", !on); c.setAttribute("aria-pressed", on ? "true" : "false");
        });
        o.onToggle(active);
      });
    });
    // direction "vertical" or "horizontal"; gap = space between items in px (along that direction)
    el.setLayout = function (dir, gap) {
      el.classList.toggle("dvm-horizontal", dir === "horizontal");
      list.style.gap = dir === "horizontal" ? "4px " + gap + "px" : gap + "px 0";
    };
    el.active = active;
    return el;
  };

  // Colour ramp from 2+ colours, t in 0..1
  DV.colorRamp = function (colors) {
    var c = colors.map(function (h) { h = h.replace("#", ""); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); });
    return function (t) {
      t = DV.clamp(t, 0, 1) * (c.length - 1);
      var i = Math.min(c.length - 2, Math.floor(t)), f = t - i;
      return "#" + [0, 1, 2].map(function (k) {
        var v = Math.round(c[i][k] + (c[i + 1][k] - c[i][k]) * f);
        return (v < 16 ? "0" : "") + v.toString(16);
      }).join("");
    };
  };
  // Continuous colour legend: { title, colors, min, max, fmt }
  DV.gradientLegend = function (o) {
    var el = div("dvm-legend dvm-gradient");
    if (o.title) div("dvm-legend-title", el).textContent = o.title;
    var bar = div("dvm-bar", el);
    bar.style.background = "linear-gradient(to right," + o.colors.join(",") + ")";
    var lab = div("dvm-bar-labels", el);
    div("", lab, "span").textContent = o.fmt ? o.fmt(o.min) : o.min;
    div("", lab, "span").textContent = o.fmt ? o.fmt(o.max) : o.max;
    return el;
  };
  // Bubble area proportional to the value: r(v) for a maximum value and radius
  DV.sizeScale = function (maxValue, maxR) {
    return function (v) { return maxValue > 0 && v > 0 ? Math.sqrt(v / maxValue) * maxR : 0; };
  };
  // Nested circles: { title, values: [small, large], r: fn, fmt, color }
  DV.bubbleLegend = function (o) {
    var el = div("dvm-legend dvm-bubbles");
    if (o.title) div("dvm-legend-title", el).textContent = o.title;
    var rMax = o.r(Math.max.apply(null, o.values)), w = rMax * 2 + 70, h = rMax * 2 + 2;
    var svg = DV.el("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h }, el);
    o.values.slice().sort(function (a, b) { return b - a; }).forEach(function (v) {
      var r = o.r(v), cy = h - 1 - r;
      DV.el("circle", { cx: rMax + 1, cy: cy, r: r, fill: "none", stroke: o.color || "#000" }, svg);
      DV.el("line", { x1: rMax + 1, x2: rMax * 2 + 8, y1: cy - r, y2: cy - r, stroke: o.color || "#000", "stroke-dasharray": "2 2" }, svg);
      DV.el("text", { x: rMax * 2 + 11, y: cy - r, "dominant-baseline": "middle", "font-size": "0.85em", fill: "currentColor" }, svg)
        .textContent = o.fmt ? o.fmt(v) : v;
    });
    return el;
  };

  /* ------------------------------------------------------------------
   * COUNTRY SEARCH: { placeholder, items: [{ id, label }], onSelect(id or null) }
   * ------------------------------------------------------------------ */
  DV.mapSearch = function (o) {
    var el = div("dvm-search dv-control");   // dv-control: left out of still images by default
    el.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M10 10l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var input = div("", el, "input");
    input.type = "text"; input.setAttribute("role", "combobox"); input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");
    var clear = div("dvm-clear", el, "button"); clear.type = "button"; clear.innerHTML = "&times;";
    clear.setAttribute("aria-label", "Clear");
    var list = div("dvm-options", el, "ul"); list.setAttribute("role", "listbox");
    var shown = [], hi = -1;
    function open(q) {
      q = (q || "").trim().toLowerCase();
      shown = o.items.filter(function (it) { return !q || it.label.toLowerCase().indexOf(q) > -1; });
      list.innerHTML = "";
      shown.forEach(function (it, i) {
        var li = div("", list, "li"); li.textContent = it.label; li.setAttribute("role", "option");
        li.addEventListener("pointerdown", function (e) { e.preventDefault(); pick(i); });
      });
      hi = -1;
      el.classList.toggle("open", shown.length > 0);
      input.setAttribute("aria-expanded", shown.length ? "true" : "false");
    }
    function close() { el.classList.remove("open"); input.setAttribute("aria-expanded", "false"); }
    function pick(i) {
      var it = shown[i]; if (!it) return;
      input.value = it.label; el.classList.add("has"); close(); input.blur();
      o.onSelect(it.id);
    }
    function mark() { Array.prototype.forEach.call(list.children, function (li, i) { li.classList.toggle("hi", i === hi); }); }
    input.addEventListener("focus", function () { open(""); input.select(); });
    input.addEventListener("input", function () { open(input.value); });
    input.addEventListener("blur", close);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { hi = Math.min(shown.length - 1, hi + 1); mark(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { hi = Math.max(0, hi - 1); mark(); e.preventDefault(); }
      else if (e.key === "Enter") { pick(hi > -1 ? hi : 0); }
      else if (e.key === "Escape") { close(); input.blur(); }
    });
    clear.addEventListener("click", function () { el.set(null); o.onSelect(null); });
    el.set = function (id) {
      var it = o.items.filter(function (x) { return x.id === id; })[0];
      input.value = it ? it.label : ""; el.classList.toggle("has", !!it);
    };
    el.setPlaceholder = function (t) { input.placeholder = t; input.setAttribute("aria-label", t); };
    el.setPlaceholder(o.placeholder || "Select country");
    return el;
  };

  /* ------------------------------------------------------------------
   * TIME SLIDER: { dates: [{ label, t }] oldest first, index, onChange(i) }
   * Steps are placed in proportion to time; the thumb snaps to the nearest date.
   * el.set(i), el.setLabel(fn(i) -> text), el.setStyle(S) (the DV.sliderGroup settings)
   * ------------------------------------------------------------------ */
  DV.timeSlider = function (o) {
    var el = div("dvm-slider dv-control"), n = o.dates.length, t0 = o.dates[0].t, t1 = o.dates[n - 1].t;
    var play = div("dvm-play", el, "button"); play.type = "button"; play.setAttribute("aria-label", "Play");
    play.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="pl" d="M7 4.5v11l9-5.5z"/>' +
      '<path class="pa" d="M6 4.5h3v11H6zM11 4.5h3v11h-3z"/></svg>';
    var body = div("dvm-sbody", el);
    var label = div("dvm-date", body);
    var track = div("dvm-track", body);
    var ticks = div("dvm-ticks", track);
    var range = div("", track, "input"); range.type = "range"; range.min = 0; range.max = 1000; range.step = 1;
    var ends = div("dvm-ends", track);
    var pos = function (i) { return t1 === t0 ? 1000 : Math.round((o.dates[i].t - t0) / (t1 - t0) * 1000); };
    o.dates.forEach(function (d, i) {
      var tk = div("dvm-tick", ticks);
      tk.style.left = "calc(var(--dvm-thumb) / 2 + (100% - var(--dvm-thumb)) * " + pos(i) / 1000 + ")";
    });
    div("", ends, "span").textContent = o.dates[0].label.replace(/^.*\b(\d{4})$/, "$1");
    div("", ends, "span").textContent = o.dates[n - 1].label.replace(/^.*\b(\d{4})$/, "$1");
    var cur = o.index, timer = null, speed = 900, labelFn = function (i) { return o.dates[i].label; };
    function nearest(v) {
      var best = 0;
      for (var i = 1; i < n; i++) if (Math.abs(pos(i) - v) < Math.abs(pos(best) - v)) best = i;
      return best;
    }
    function set(i, fire) {
      cur = DV.clamp(i, 0, n - 1);
      range.value = pos(cur);
      range.style.setProperty("--pct", pos(cur) / 10 + "%");
      range.setAttribute("aria-valuetext", labelFn(cur));
      label.textContent = labelFn(cur);
      if (fire) o.onChange(cur);
    }
    function stop() { clearInterval(timer); timer = null; el.classList.remove("playing"); play.setAttribute("aria-label", "Play"); }
    range.addEventListener("input", function () { stop(); var i = nearest(+range.value); if (i !== cur) set(i, true); else set(cur, false); });
    range.addEventListener("change", function () { set(cur, false); });
    play.addEventListener("click", function () {
      if (timer) { stop(); return; }
      el.classList.add("playing"); play.setAttribute("aria-label", "Pause");
      if (cur === n - 1) set(0, true);
      timer = setInterval(function () {
        if (cur >= n - 1) { stop(); return; }
        set(cur + 1, true);
        if (cur >= n - 1) stop();
      }, speed);
    });
    el.set = function (i) { set(i, false); };
    el.get = function () { return cur; };
    el.setLabel = function (fn) { labelFn = fn; set(cur, false); };
    el.setStyle = function (S) {
      speed = S.playSpeed || 900;
      var st = el.style;
      st.setProperty("--dvm-slider-width", S.sliderWidth + "px");
      st.setProperty("--dvm-thumb", S.sliderThumb + "px");
      st.setProperty("--dvm-line", S.sliderThickness + "px");
      st.setProperty("--dvm-scolor", S.sliderColor);
      st.setProperty("--dvm-srest", S.sliderRestColor);
      st.setProperty("--dvm-play", S.playSize + "px");
      el.className = "dvm-slider dv-control" + (timer ? " playing" : "") +
        " dvm-play-" + String(S.playStyle || "filled circle").replace(/\s+/g, "-") +
        " dvm-thumb-" + String(S.sliderThumbStyle || "circle").replace(/\s+/g, "-") +
        (S.sliderTicks ? "" : " dvm-noticks") + (S.sliderYears ? "" : " dvm-noyears") +
        " dvm-label-" + (S.sliderLabelPos === "above" ? "above" : "right");
    };
    el.stop = stop;
    set(cur, false);
    return el;
  };

  /* ------------------------------------------------------------------
   * DATES in sheet headers: "January 2016", "Jan 2016", "2016-01", "01/2016", "2016"
   * Returns months since year 0 (or null if it isn't a date).
   * ------------------------------------------------------------------ */
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  DV.parseDate = function (s) {
    s = String(s || "").trim().toLowerCase();
    var m = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s);
    if (m && MONTHS.indexOf(m[1]) > -1) return +m[2] * 12 + MONTHS.indexOf(m[1]);
    m = /^(\d{4})-(\d{1,2})(-\d{1,2})?$/.exec(s);
    if (m) return +m[1] * 12 + (+m[2] - 1);
    m = /^(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return +m[2] * 12 + (+m[1] - 1);
    m = /^(\d{4})$/.exec(s);
    if (m) return +m[1] * 12;
    return null;
  };

  /* ------------------------------------------------------------------
   * STANDARD DESIGN-MODE SETTINGS. Pass defaults to change any def,
   * e.g. DV.mapGroups({ viewWest: -12 }).
   * ------------------------------------------------------------------ */
  function withDefs(groups, defs) {
    defs = defs || {};
    groups.forEach(function (g) { g.fields.forEach(function (f) { if (f.key in defs) f.def = defs[f.key]; }); });
    return groups;
  }
  DV.mapGroups = function (defs) {
    return withDefs([
      { name: "Map shapes", fields: [
        { key: "geometry",     type: "select", options: Object.keys(DV.GEOMETRY), def: "Medium (Natural Earth 50m)", help: "Country shapes, Simple: few islands and smooth coasts; Detailed: what Flourish used" },
        { key: "mapDetail",    type: "range", min: 0.02, max: 1, step: 0.01, def: 1, help: "Coastline detail, share of points kept (1 = all, lower = smoother)" },
        { key: "mapMinIsland", type: "range", min: 0, max: 2990, step: 10, def: 0, help: "Hide islands smaller than this, in km² (0 = show all; for scale: Mallorca is about 3,600, Rhodes 1,400)" },
        { key: "noDataShow",   type: "select", options: ["hidden", "BFF countries only", "all countries"], def: "hidden", help: "Countries without data, hidden: only countries with data; BFF countries only: also BFF countries with no data; all countries: neighbours too" },
        { key: "smallMode",    type: "select", options: ["as they are", "circle", "zoomed box"], def: "zoomed box", help: "Very small countries (list below), as they are: their real size; circle: a dot you can hover; zoomed box: an enlarged copy in a box" },
        { key: "smallList",    type: "text", def: "MT", help: "Very small countries, ISO codes separated by commas (e.g. MT, LU)" },
        { key: "smallSize",    type: "range", min: 2, max: 15, step: 0.5, def: 5, help: "Size of the zoomed box (or circle), in % of the map width" },
        { key: "smallDX",      type: "range", min: -20, max: 20, step: 0.5, def: 5, help: "Zoomed box position sideways from the country, in % of the map width: + right" },
        { key: "smallDY",      type: "range", min: -20, max: 20, step: 0.5, def: -1.5, help: "Zoomed box position up or down from the country, in % of the map width: + down" }
      ]},
      { name: "Projection and view", fields: [
        { key: "projection",   type: "select", options: DV.PROJECTIONS, def: "Natural Earth", help: "Map projection" },
        { key: "mapCentreLon", type: "range", min: -30, max: 40, step: 1, def: 0, help: "Central meridian (longitude); 0 matches Flourish, around 15 straightens Europe" },
        { key: "viewWest",     type: "range", min: -40, max: 20, step: 0.5, def: -11, help: "View box: west edge (longitude)" },
        { key: "viewEast",     type: "range", min: 10, max: 70, step: 0.5, def: 44, help: "View box: east edge (longitude)" },
        { key: "viewSouth",    type: "range", min: 20, max: 50, step: 0.5, def: 34, help: "View box: south edge (latitude)" },
        { key: "viewNorth",    type: "range", min: 50, max: 85, step: 0.5, def: 71, help: "View box: north edge (latitude)" },
        { key: "mapZoom",      type: "range", min: 0.5, max: 3, step: 0.01, def: 1, help: "Zoom (1 = the view box fits the map area)" },
        { key: "mapShiftX",    type: "range", min: -50, max: 50, step: 0.5, def: 0, help: "Move the map sideways, in % of its width: + right, - left" },
        { key: "mapShiftY",    type: "range", min: -50, max: 50, step: 0.5, def: 0, help: "Move the map up or down, in % of its height: + down, - up" },
        { key: "mapHeight",    type: "range", min: 0.4, max: 1.4, step: 0.01, def: 0.72, help: "Map height as a share of its width" },
        { key: "mapHeightPhone", type: "range", min: 0.4, max: 1.6, step: 0.01, def: 0.85, help: "Map height on phones, as a share of its width (phones = narrower than the brand stackBelow width)" },
        { key: "mapZoomPhone", type: "range", min: 0.5, max: 3, step: 0.01, def: 1, help: "Extra zoom on phones (1 = same as wide screens)" }
      ]},
      { name: "Map colours and borders", fields: [
        { key: "noDataFill",   type: "color", def: "#dcdcdc", help: "BFF countries without data" },
        { key: "otherFill",    type: "color", def: "#eceef0", help: "Other countries (neighbours)" },
        { key: "borderColor",  type: "color", def: "#ffffff", help: "Country borders" },
        { key: "borderWidth",  type: "range", min: 0, max: 3, step: 0.1, def: 0.7, help: "Border width in px" },
        { key: "smallBoxColor", type: "color", def: "#8a8a8a", help: "Zoomed box and its line" }
      ]},
      { name: "Hover and selection", fields: [
        { key: "hoverStyle",   type: "select", options: ["outline", "outline and fade others", "fade others", "none"], def: "outline", help: "What happens to the country under the pointer" },
        { key: "hoverColor",   type: "color", def: "#000000", help: "Hover outline colour" },
        { key: "hoverWidth",   type: "range", min: 0, max: 4, step: 0.1, def: 1.5, help: "Hover outline width in px" },
        { key: "fadeOpacity",  type: "range", min: 0.1, max: 0.9, step: 0.05, def: 0.4, help: "How visible the other countries stay when faded (0 = invisible, 1 = no fade)" },
        { key: "selectColor",  type: "color", def: "#000000", help: "Outline of the selected (clicked or searched) country" },
        { key: "selectWidth",  type: "range", min: 0, max: 5, step: 0.1, def: 2.5, help: "Selected outline width in px" }
      ]}
    ], defs);
  };
  // Size of a bubble for a value: area in proportion to the value, between S.bubbleMinR and S.bubbleMaxR,
  // scaled with the map width (the radii are for a 1000 px wide map). maxValue: S.bubbleMaxValue or the data's largest.
  DV.bubbleRadius = function (S, maxValue, mapWidth) {
    var mv = +S.bubbleMaxValue > 0 ? +S.bubbleMaxValue : maxValue, k = DV.clamp(mapWidth / 1000, 0.55, 1.5);
    return function (v) {
      if (!(v > 0) || !(mv > 0)) return 0;
      return Math.max(S.bubbleMinR, Math.sqrt(Math.min(v, mv) / mv) * S.bubbleMaxR) * k;
    };
  };
  DV.bubbleGroup = function (defs) {
    return withDefs([
      { name: "Bubbles", fields: [
        { key: "bubbleMinR",        type: "range", min: 0.5, max: 10, step: 0.25, def: 2.5, help: "Smallest bubble radius in px (on a 1000 px wide map)" },
        { key: "bubbleMaxR",        type: "range", min: 3, max: 40, step: 0.5, def: 8, help: "Largest bubble radius in px (on a 1000 px wide map)" },
        { key: "bubbleMaxValue",    type: "range", min: 0, max: 10000, step: 50, def: 0, help: "Value that gets the largest bubble (0 = the largest in the data; fix it so sizes don't change between updates)" },
        { key: "bubbleOpacity",     type: "range", min: 0.1, max: 1, step: 0.05, def: 1, help: "Bubble fill opacity" },
        { key: "bubbleStroke",      type: "color", def: "#ffffff", help: "Bubble outline colour" },
        { key: "bubbleStrokeWidth", type: "range", min: 0, max: 3, step: 0.05, def: 0.75, help: "Bubble outline width in px" },
        { key: "bubbleHit",         type: "range", min: 0, max: 30, step: 1, def: 8, help: "How close the pointer must be to a bubble to pick it, in px" },
        { key: "highlightInner",    type: "color", def: "#000000", help: "Highlighted bubble: inner ring" },
        { key: "highlightOuter",    type: "color", def: "#ffffff", help: "Highlighted bubble: outer ring" },
        { key: "highlightWidth",    type: "range", min: 0, max: 8, step: 0.5, def: 3, help: "Highlighted bubble: ring width in px" },
        { key: "sizeLegendPos",     type: "select", options: DV.POSITIONS, def: "hidden", help: "Size legend position (hidden = none)" },
        { key: "sizeLegendTitle",   type: "text", def: "Capacity (MW)", help: "Size legend title" },
        { key: "sizeLegendValues",  type: "text", def: "500, 2000", help: "Size legend values, separated by commas" }
      ]}
    ], defs);
  };
  DV.sliderGroup = function (defs) {
    return withDefs([
      { name: "Time slider", fields: [
        { key: "sliderPos",        type: "select", options: DV.POSITIONS, def: "below map", help: "Position (on phones, corners and sides move below the map)" },
        { key: "sliderStart",      type: "select", options: ["latest", "earliest"], def: "latest", help: "Date shown when the map opens" },
        { key: "sliderWidth",      type: "range", min: 160, max: 1100, step: 10, def: 520, help: "Width of the whole slider (button, track and date) in px" },
        { key: "sliderLabelPos",   type: "select", options: ["right", "above"], def: "right", help: "Date label: right of the track or above it" },
        { key: "sliderTicks",      type: "check", def: true, help: "Show a tick for each date with data" },
        { key: "sliderYears",      type: "check", def: true, help: "Show the first and last year under the track" },
        { key: "playStyle",        type: "select", options: ["filled circle", "outline circle", "filled square", "triangle only", "hidden"], def: "filled circle", help: "Play button style" },
        { key: "playSize",         type: "range", min: 16, max: 48, step: 1, def: 30, help: "Play button size in px" },
        { key: "sliderThickness",  type: "range", min: 1, max: 12, step: 0.5, def: 3, help: "Track thickness in px" },
        { key: "sliderThumbStyle", type: "select", options: ["circle", "ring", "bar"], def: "circle", help: "Handle style" },
        { key: "sliderThumb",      type: "range", min: 8, max: 30, step: 1, def: 16, help: "Handle size in px" },
        { key: "sliderColor",      type: "color", def: "#000000", help: "Button, handle and the track up to the date shown" },
        { key: "sliderRestColor",  type: "color", def: "#c8c8c8", help: "Track after the date shown" },
        { key: "playSpeed",        type: "range", min: 300, max: 3000, step: 50, def: 900, help: "Play: time per date, in milliseconds" }
      ]}
    ], defs);
  };
})();
