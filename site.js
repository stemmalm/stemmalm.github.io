// Shared helpers: the registry, how an individual's number reads, the header, and the lineage figure.
export const STATUS = { untrained: "not trained", queued: "queued", training: "growing", trained: "grown" };

export async function registry() {
  const r = await fetch("registry.json");
  if (!r.ok) throw new Error("registry");
  return r.json();
}

export function fullId(i) {
  return [i.strain, i.env, "G" + i.gen, i.lesion || "—", "s" + i.seed].join("·");
}

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

// the logo: a root and three branches, drawn the way phylogenies are drawn
export const LOGO = `<svg viewBox="0 0 34 28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M3 14H11M11 5V23M11 5H23M11 14H23M11 23H23"/></g><g fill="currentColor"><circle cx="3" cy="14" r="2.4"/><circle cx="25" cy="5" r="2.4"/><circle cx="25" cy="14" r="2.4"/><circle cx="25" cy="23" r="2.4"/></g></svg>`;

export function header(active) {
  const bar = document.querySelector(".bar");
  const link = (href, name) => `<a href="${href}"${name === active ? ' aria-current="page"' : ""}>${name}</a>`;
  bar.innerHTML = `<a class="home" href="./">${LOGO}<span>stemma.lm</span></a>`
    + `<nav>${link("./", "overview")}${link("lineage.html", "lineage")}${link("variants.html", "variants")}${link("log.html", "log")}${link("about.html", "about")}</nav>`;
}

// The lineage as a right-angled tree: the real caregivers at the root, each generation one column
// further right, children joined to their parent. Leaves are spaced evenly; a parent sits at the
// middle of its children.
const NS = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}


// The figure's legend (B22a2 §3b): shape = strain, colour = environment, hollow = lesioned,
// line = how the parent passed its speech on, a thin ring = lived past the first 72 months.
export const SHAPES = ["circle", "square", "triangle", "diamond"];
export const ENV_COLORS = { WT1: "var(--ink)", WT2: "#2f6fd0", WT2m: "#2e9a68" };
export const MODES = {
  care: { name: "real caregivers' speech", dash: "", width: 1, color: "var(--muted)" },
  c: { name: "copy", dash: "", width: 1.3 },
  f: { name: "free speech", dash: "5 3", width: 1.3 },
  r: { name: "respeak", dash: "1.5 2.5", width: 1.3 },
  d: { name: "distill", dash: "", width: 3 },
  clone: { name: "clone: the same life up to the branch point", dash: "7 3 1 3", width: 1.3, color: "var(--muted)" },
};
export const modeOf = (i) => i.clone_of ? "clone" : (i.parent ? (/·([a-z])/.exec(i.heard || "") || [, "c"])[1] : "care");
export const envOf = (i) => (i.extended && i.extended.length ? i.extended[i.extended.length - 1].env : i.env);
export function mark(shape, x, y, r, color, hollow) {
  const paint = hollow ? { fill: "var(--bg)", stroke: color, "stroke-width": 1.4 } : { fill: color };
  if (shape === "square") return s("rect", { x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, ...paint });
  if (shape === "triangle") return s("path", { d: `M${x} ${y - r * 1.15}L${x + r * 1.05} ${y + r * 0.75}L${x - r * 1.05} ${y + r * 0.75}Z`, ...paint });
  if (shape === "diamond") return s("path", { d: `M${x} ${y - r * 1.2}L${x + r * 1.2} ${y}L${x} ${y + r * 1.2}L${x - r * 1.2} ${y}Z`, ...paint });
  return s("circle", { cx: x, cy: y, r, ...paint });
}

export function lineageFigure(reg0, { compact = false } = {}) {
  const reg = { ...reg0, individuals: reg0.individuals.filter((i) => i.status === "trained") };  // only grown ones are shown
  // a clone hangs off the individual it was copied from, one column further right
  const up = (i) => i.clone_of ?? i.parent ?? null;
  const kids = (p) => reg.individuals.filter((i) => (p === null ? up(i) === null : up(i) === p));
  const byN = new Map(reg.individuals.map((i) => [i.serial, i]));
  const col = (i) => (i.clone_of ? col(byN.get(i.clone_of)) + 1 : i.gen);
  const depth = Math.max(0, ...reg.individuals.map(col)) + 1;
  const ROW = compact ? 22 : 30, X0 = 14, COL = compact ? 150 : 290, LEAD = 30;
  const xs = (d) => X0 + 110 + d * COL;  // d = generation
  let leaf = 0;
  const pos = new Map();
  function place(i) {  // returns y of the node
    const ch = kids(i.serial);
    const y = ch.length ? ch.map(place).reduce((a, b) => a + b, 0) / ch.length : 16 + ROW * leaf++;
    pos.set(i.serial, y);
    return y;
  }
  const roots = kids(null);
  const rootYs = roots.map(place);
  const rootY = rootYs.reduce((a, b) => a + b, 0) / Math.max(1, rootYs.length);
  const W = xs(depth - 1) + (compact ? 150 : 250), H = 16 + ROW * Math.max(1, leaf);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Lineage of StemmaLM individuals" });
  const strains = Object.keys(reg.strains || {});
  const shapeOf = (i) => SHAPES[Math.max(0, strains.indexOf(i.strain)) % SHAPES.length];
  const line = (d, m = MODES.c) => svg.append(s("path", { d, fill: "none", stroke: m.color || "currentColor", "stroke-width": m.width, "stroke-dasharray": m.dash, opacity: 0.8 }));
  const font = { "font-family": "IBM Plex Mono, ui-monospace, monospace", "font-size": compact ? 11.5 : 12.5, fill: "currentColor" };

  function edges(parentX, parentY, children) {
    if (!children.length) return;
    const ex = xs(col(children[0])) - LEAD;
    const ys = children.map((c) => pos.get(c.serial));
    const ms = children.map((c) => MODES[modeOf(c)] || MODES.c);
    const trunk = ms.every((m) => m === ms[0]) ? ms[0] : MODES.c;
    line(`M${parentX} ${parentY}H${ex}M${ex} ${Math.min(...ys)}V${Math.max(...ys)}`, trunk);
    children.forEach((c, k) => line(`M${ex} ${pos.get(c.serial)}H${xs(col(c)) - 4}`, ms[k]));
  }
  // root: the real caregivers
  svg.append(s("circle", { cx: X0, cy: rootY, r: 3.5, fill: "currentColor" }));
  svg.append(s("text", { ...font, x: X0 - 4, y: rootY - 9, opacity: 0.7 }, compact ? "caregivers" : "real caregivers"));
  edges(X0, rootY, roots);
  for (const i of reg.individuals) {
    const x = xs(col(i)), y = pos.get(i.serial), ch = kids(i.serial);
    edges(x, y, ch);
    const a = s("a", { href: `individual.html?n=${i.serial}`, "data-serial": i.serial, "aria-label": `#${i.serial} ${fullId(i)}` });
    if (envOf(i) !== i.env) a.append(s("circle", { cx: x, cy: y, r: 7, fill: "none", stroke: "currentColor", "stroke-width": 0.8, opacity: 0.7 }));
    a.append(mark(shapeOf(i), x, y, 4, ENV_COLORS[envOf(i)] || "var(--ink)", !!i.lesion));
    a.append(s("circle", { cx: x, cy: y, r: 9, fill: "transparent" }));  // a bigger target for the pointer
    const label = `#${i.serial}` + (compact ? "" : `  ${fullId(i)}`);
    a.append(s("text", { ...font, x: x + 8, y: ch.length ? y - 7 : y + 4 }, label));
    svg.append(a);
  }
  return svg;
}

// a one-line curve: points [[x, y], ...] drawn in currentColor
export function sparkline(points, { w = 120, h = 22 } = {}) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = 0, y1 = Math.max(...ys) || 1;
  const d = points.map((p, k) => `${k ? "L" : "M"}${((p[0] - x0) / (x1 - x0 || 1) * (w - 2) + 1).toFixed(1)} ${(h - 1 - (p[1] - y0) / (y1 - y0) * (h - 2)).toFixed(1)}`).join("");
  const svg = s("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, "aria-hidden": "true" });
  svg.append(s("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.2 }));
  return svg;
}

// The lineage as a map: drag to move, pinch or ctrl/⌘ + scroll to zoom, buttons to zoom and refit.
// Pointing at an individual shows its card; on a touch screen the first tap shows the card.
export function lineageMap(reg, stats = { individuals: {} }, opts = {}) {
  const svg = lineageFigure(reg, opts);
  const [, , W, H] = svg.getAttribute("viewBox").split(" ").map(Number);
  // grid paper inside the drawing, so it moves with the tree
  const defs = s("defs");
  const pat = s("pattern", { id: "grid" + Math.random().toString(36).slice(2, 7), width: 16, height: 16, patternUnits: "userSpaceOnUse" });
  pat.append(s("path", { d: "M16 0H0V16", fill: "none", stroke: "var(--grid)", "stroke-width": 1 }));
  defs.append(pat);
  svg.prepend(s("rect", { x: -4000, y: -4000, width: 8000 + W, height: 8000 + H, fill: `url(#${pat.id})` }));
  svg.prepend(defs);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const box = el("div", { class: "map" });
  const ui = el("div", { class: "map-ui" });
  const btn = (label, title, fn) => { const b = el("button", { type: "button", title, "aria-label": title, text: label }); b.addEventListener("click", fn); ui.append(b); };
  const hint = el("div", { class: "map-hint", text: "drag to move · pinch or ⌘/ctrl + scroll to zoom" });
  const card = el("div", { class: "map-card", hidden: "" });
  box.append(svg, ui, hint, card);

  const fit = { x: -12, y: -12, w: W + 24, h: H + 24 };
  let vb = { ...fit };
  const draw = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  draw();
  const toUnits = (cx, cy) => new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
  function zoom(f, cx, cy) {  // f > 1 zooms in, around the screen point (cx, cy)
    const r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const w = Math.min(fit.w * 4, Math.max(fit.w / 8, vb.w / f));
    const g = vb.w / w, p = toUnits(cx, cy);
    vb = { x: p.x - (p.x - vb.x) / g, y: p.y - (p.y - vb.y) / g, w, h: vb.h / g };
    draw();
  }
  btn("+", "zoom in", () => zoom(1.4));
  btn("−", "zoom out", () => zoom(1 / 1.4));
  btn("⤢", "fit the whole lineage", () => { vb = { ...fit }; draw(); });

  let hintT;
  svg.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) { box.classList.add("show-hint"); clearTimeout(hintT); hintT = setTimeout(() => box.classList.remove("show-hint"), 1200); return; }
    e.preventDefault();
    zoom(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  }, { passive: false });

  // dragging and pinching
  const ptrs = new Map();
  let moved = 0, pinch0 = null;
  svg.addEventListener("pointerdown", (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    box.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    const last = ptrs.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 1) {
      const a = toUnits(last.x, last.y), b = toUnits(now.x, now.y);
      vb.x -= b.x - a.x; vb.y -= b.y - a.y; draw();
      moved += Math.abs(now.x - last.x) + Math.abs(now.y - last.y);
      // capture only once it is a drag, so a plain click still reaches the individual's link
      if (moved > 4 && !svg.hasPointerCapture(e.pointerId)) try { svg.setPointerCapture(e.pointerId); } catch {}
    }
    ptrs.set(e.pointerId, now);
    if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      zoom(d / pinch0, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch0 = d; moved = 99;
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; if (!ptrs.size) box.classList.remove("dragging"); };
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);

  // the card
  const byN = new Map(reg.individuals.map((i) => [String(i.serial), i]));
  const when = (d) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  let shown = null;
  function show(a) {
    const i = byN.get(a.getAttribute("data-serial")), st = stats.individuals[String(i.serial)] || {};
    const curve = st.mlu_curve || [];
    const row = (k, v) => el("div", { class: "kv" }, el("span", { text: k }), el("span", { text: v }));
    card.replaceChildren(
      el("div", { class: "card-n", text: "#" + i.serial }),
      el("div", { class: "card-id", text: fullId(i) }),
      row("generation", "G" + i.gen + (i.parent ? " · parent #" + i.parent : "")),
      ...(i.clone_of ? [row("clone of", `#${i.clone_of} at ${i.clone_at} m`)] : []),
      ...((i.extended || []).map((x) => row("lived on", `${x.env}, ${x.months[0]}–${x.months[1]} m`))),
      row("heard", i.heard || "Ω"),
      ...(i.born ? [row("born", when(i.born))] : []),
      ...(curve.length ? [row("words per utterance", curve[curve.length - 1][1].toFixed(1) + " at 72 m")] : []),
      ...(st.loss_72m != null ? [row("loss at 72 m", st.loss_72m.toFixed(3))] : []),
    );
    if (curve.length) card.append(el("div", { class: "card-spark" }, sparkline(curve, { w: 200, h: 28 }), el("span", { text: "0 → 72 months" })));
    card.append(el("a", { class: "card-go", href: a.getAttribute("href"), text: "meet #" + i.serial + " →" }));
    card.hidden = false;
    const r = box.getBoundingClientRect(), n = a.querySelector("circle[fill=transparent]").getBoundingClientRect();
    let x = n.right - r.left + 12, y = n.top - r.top - 10;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (x + cw > r.width - 6) x = n.left - r.left - cw - 12;
    card.style.left = Math.max(6, x) + "px";
    card.style.top = Math.max(6, Math.min(y, r.height - ch - 6)) + "px";
    shown = a;
  }
  const hide = () => { card.hidden = true; shown = null; };
  for (const a of svg.querySelectorAll("a[data-serial]")) {
    a.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !ptrs.size) show(a); });
    a.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !card.matches(":hover")) setTimeout(() => { if (!card.matches(":hover") && shown === a) hide(); }, 120); });
    a.addEventListener("focus", () => show(a));
    a.addEventListener("click", (e) => {
      if (moved > 4) { e.preventDefault(); return; }  // the end of a drag is not a click
      if (e.pointerType !== "mouse" && shown !== a) { e.preventDefault(); show(a); }  // touch: first tap shows the card
    });
  }
  card.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
  svg.addEventListener("pointerdown", (e) => { if (!e.target.closest("a")) hide(); });
  const wrap = el("div", { class: "map-wrap" }, box, legend(reg));
  // rings around the individuals that said something, thicker for more (counts by serial)
  wrap.highlight = (counts, label = "") => {
    for (const r of svg.querySelectorAll(".hl")) r.remove();
    const max = Math.max(1, ...Object.values(counts || {}));
    for (const a of svg.querySelectorAll("a[data-serial]")) {
      const n = (counts || {})[a.getAttribute("data-serial")];
      if (!n) continue;
      const c = a.querySelector("circle[fill=transparent]");
      const [x, y] = [c.getAttribute("cx"), c.getAttribute("cy")];
      a.prepend(s("circle", { class: "hl", cx: x, cy: y, r: 6 + 6 * Math.sqrt(n / max), fill: "var(--mark)", stroke: "#c98a00", "stroke-width": 1.2 }));
      a.append(s("text", { class: "hl", "text-anchor": "end", x: +x - 15, y: +y + 4, "font-family": "IBM Plex Mono, monospace", "font-size": 10.5, fill: "#9a6a00" }, String(n)));
    }
  };
  return wrap;
}

// the legend shows only what the lineage has so far
function legend(reg) {
  const grown = reg.individuals.filter((i) => i.status === "trained");
  const strains = Object.keys(reg.strains || {});
  const box = el("div", { class: "map-legend" });
  const item = (svgKids, text) => {
    const g = s("svg", { viewBox: "0 0 26 12", width: 26, height: 12, "aria-hidden": "true" });
    for (const k of svgKids) g.append(k);
    box.append(el("div", {}, g, el("span", { text })));
  };
  for (const st of [...new Set(grown.map((i) => i.strain))])
    item([mark(SHAPES[Math.max(0, strains.indexOf(st)) % SHAPES.length], 13, 6, 4, "var(--ink)", false)], st);
  for (const env of [...new Set(grown.map(envOf))].filter((e) => e !== "WT1"))
    item([mark("circle", 13, 6, 4, ENV_COLORS[env] || "var(--ink)", false)], "lived on " + env);
  if (grown.some((i) => i.lesion)) item([mark("circle", 13, 6, 4, "var(--ink)", true)], "lesioned");
  for (const m of [...new Set(grown.map(modeOf))]) {
    const M = MODES[m] || MODES.c;
    item([s("path", { d: "M1 6H25", stroke: M.color || "var(--ink)", "stroke-width": M.width, "stroke-dasharray": M.dash, fill: "none" })], M.name);
  }
  return box;
}
