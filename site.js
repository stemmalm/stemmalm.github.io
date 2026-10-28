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
    + `<nav>${link("./", "about")}${link("lineage.html", "lineage")}${link("log.html", "log")}</nav>`;
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

export function lineageFigure(reg, { compact = false } = {}) {
  const kids = (p) => reg.individuals.filter((i) => (p === null ? i.gen === 0 : i.parent === p));
  const depth = Math.max(0, ...reg.individuals.map((i) => i.gen)) + 1;
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
  const line = (d) => svg.append(s("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.2, opacity: 0.75 }));
  const font = { "font-family": "IBM Plex Mono, ui-monospace, monospace", "font-size": compact ? 11.5 : 12.5, fill: "currentColor" };

  function edges(parentX, parentY, children) {
    if (!children.length) return;
    const ex = xs(children[0].gen) - LEAD;
    const ys = children.map((c) => pos.get(c.serial));
    line(`M${parentX} ${parentY}H${ex}M${ex} ${Math.min(...ys)}V${Math.max(...ys)}`);
    for (const c of children) line(`M${ex} ${pos.get(c.serial)}H${xs(c.gen)}`);
  }
  // root: the real caregivers
  svg.append(s("circle", { cx: X0, cy: rootY, r: 3.5, fill: "currentColor" }));
  svg.append(s("text", { ...font, x: X0 - 4, y: rootY - 9, opacity: 0.7 }, compact ? "caregivers" : "real caregivers"));
  edges(X0, rootY, roots);
  for (const i of reg.individuals) {
    const x = xs(i.gen), y = pos.get(i.serial), ch = kids(i.serial);
    edges(x, y, ch);
    const a = s("a", { href: `individual.html?n=${i.serial}` });
    const born = i.born ? ", born " + new Date(i.born).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    a.append(s("title", {}, `#${i.serial} ${fullId(i)} — ${STATUS[i.status]}${born}${i.heard ? ", heard " + i.heard : ""}`));
    a.append(s("circle", { cx: x, cy: y, r: 3.5, fill: i.status === "trained" ? "currentColor" : "var(--bg)", stroke: "currentColor", "stroke-width": 1.4 }));
    const label = `#${i.serial}` + (compact ? "" : `  ${fullId(i)}`) + `  ${STATUS[i.status]}`;
    a.append(s("text", { ...font, x: x + 8, y: ch.length ? y - 7 : y + 4 }, label));
    svg.append(a);
  }
  return svg;
}
