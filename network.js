// The lineage as a network (needs d3 loaded as a global). Two kinds of node, as in a stemma:
// individuals (circles, area by model size), and the texts they heard or wrote (shape by kind). Nodes can be dragged; hovering one keeps it,
// its neighbours and their links, and fades the rest. Returns the selections so a page can colour
// and size the individuals.

const CSS = `
.net { position: relative; overflow: hidden; }
.net svg { width: 100%; height: 100%; display: block; cursor: grab; }
.net .link { stroke: #c4c3bc; stroke-width: 1.2; transition: opacity .15s; }
.net .link.clone { stroke-dasharray: 5 4; }
.net .link.hot { stroke: #55554f; stroke-width: 1.8; }
.net .node text { font: 12px "IBM Plex Mono", ui-monospace, monospace; fill: #1c1c1a; pointer-events: none; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
.net .node.text text, .net .node.source text { font: italic 12px "IBM Plex Sans", system-ui, sans-serif; fill: #6f6f6a; }
.net .node { cursor: pointer; transition: opacity .15s; }
.net .node circle { transition: fill .25s, r .25s; }
.net .node .count { font: 500 11px "IBM Plex Mono", ui-monospace, monospace; fill: #8a5a00; }
.net .dim { opacity: 0.12; }
.net .unborn { opacity: 0.18; }
.net .lit .shape { stroke: #1c1c1a; stroke-width: 2.2; }
`;

export function lineageNetwork(main, reg, { zoomable = true, flat = 0.06, onPick = () => {} } = {}) {
  if (!document.getElementById("net-css")) document.head.append(Object.assign(document.createElement("style"), { id: "net-css", textContent: CSS }));
  main.classList.add("net");
  const ind = reg.individuals.filter((i) => i.status === "trained");
  // texts by kind, each its own shape: real speech, a copy made by an individual, books
  const nodes = [{ id: "care", kind: "source", label: "caregivers", shape: "circle" }, { id: "Ω", kind: "text", label: "Ω", shape: "square" },
    { id: "WT2", kind: "text", label: "children's books", shape: "triangle" }];
  const links = [{ source: "care", target: "Ω" }];
  for (const i of ind) nodes.push({ id: "#" + i.serial, kind: "ind", label: "#" + i.serial, i });
  for (const code of Object.keys(reg.corpora || {})) {
    if (code === "Ω") continue;
    const w = /#(\d+)/.exec(code)[1];
    nodes.push({ id: code, kind: "text", label: `#${w}'s copy`, shape: "diamond" });
    links.push({ source: "#" + w, target: code });
  }
  for (const i of ind) {
    links.push(i.clone_of ? { source: "#" + i.clone_of, target: "#" + i.serial, clone: true } : { source: i.heard, target: "#" + i.serial });
    if (i.extended?.length) links.push({ source: "WT2", target: "#" + i.serial });
  }

  const W = () => main.clientWidth, H = () => main.clientHeight;
  const svg = d3.select(main).append("svg");
  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.3, 4]).on("zoom", (e) => g.attr("transform", e.transform));
  if (zoomable) svg.call(zoom);  // embedded in a page, scrolling stays with the page
  // once the layout has settled the first time, frame the whole graph
  function fit() {
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y), pad = 60;
    const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad * 2, Math.min(...ys) - pad, Math.max(...ys) + pad];
    const k = Math.min(1.6, W() / (x1 - x0), H() / (y1 - y0));
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(W() / 2 - k * (x0 + x1) / 2, H() / 2 - k * (y0 + y1) / 2).scale(k));
  }
  const linkSel = g.append("g").selectAll("line").data(links).join("line").attr("class", (d) => "link" + (d.clone ? " clone" : ""));
  const nodeSel = g.append("g").selectAll("g").data(nodes).join("g").attr("class", (d) => "node " + d.kind);
  // an individual's area grows with its number of parameters (EN1, about 10.8M, is the unit)
  const radius = (i) => 9 * Math.sqrt((i.params || 10.77e6) / 10.77e6);
  for (const d of nodes) if (d.i) d.r = radius(d.i);
  nodeSel.filter((d) => d.kind === "ind").append("circle").attr("r", (d) => d.r).attr("fill", "#3d3d3a").attr("stroke", "#fff").attr("stroke-width", 1.5);
  const SYM = { circle: d3.symbolCircle, square: d3.symbolSquare, diamond: d3.symbolDiamond, triangle: d3.symbolTriangle };
  nodeSel.filter((d) => d.kind !== "ind").append("path").attr("class", "shape")
    .attr("d", (d) => d3.symbol(SYM[d.shape], d.kind === "source" ? 170 : 110)()).attr("fill", "#fff").attr("stroke", "#8a897f").attr("stroke-width", 1.5);
  nodeSel.append("text").attr("x", (d) => (d.kind === "ind" ? d.r + 5 : 11)).attr("y", 4).text((d) => d.label);

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance((d) => (d.clone ? 90 : 70)).strength(0.7))
    .force("charge", d3.forceManyBody().strength(-480))
    .force("center", d3.forceCenter(W() / 2, H() / 2))
    .force("collide", d3.forceCollide((d) => (d.r || 8) + 17))
    .force("flat", d3.forceY(H() / 2).strength(flat))  // a little flatter, to fill a wide frame
    .alphaDecay(0.045);
  let framed = false;
  sim.on("end", () => { if (!framed) { framed = true; fit(); } });
  sim.on("tick", () => {
    linkSel.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
  nodeSel.call(d3.drag()
    .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  const nb = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
  for (const l of links) { nb.get(l.source.id).add(l.target.id); nb.get(l.target.id).add(l.source.id); }
  nodeSel.on("mouseenter", (e, d) => {
    nodeSel.classed("dim", (n) => !nb.get(d.id).has(n.id));
    linkSel.classed("dim", (l) => l.source.id !== d.id && l.target.id !== d.id).classed("hot", (l) => l.source.id === d.id || l.target.id === d.id);
  }).on("mouseleave", () => { nodeSel.classed("dim", false); linkSel.classed("dim", false).classed("hot", false); })
    .on("click", (e, d) => { if (d.i) onPick(d.i); });

  // when the frame changes size, re-centre and frame the graph again
  new ResizeObserver(() => { sim.force("center", d3.forceCenter(W() / 2, H() / 2)); if (framed) fit(); }).observe(main);
  return { nodeSel, linkSel, individuals: nodeSel.filter((d) => d.kind === "ind") };
}

// the legend for the texts, as small inline SVGs
export function textLegend() {
  const one = (sym, name) => `<div class="kind"><svg width="14" height="14" viewBox="-7 -7 14 14"><path d="${d3.symbol(sym, 60)()}" fill="#fff" stroke="#8a897f" stroke-width="1.4"/></svg>${name}</div>`;
  return one(d3.symbolSquare, "real family speech (Ω)") + one(d3.symbolDiamond, "a copy written by an individual") + one(d3.symbolTriangle, "children's books") + one(d3.symbolCircle, "the real caregivers");
}

// inside a frame the page may not be laid out yet: wait until the element has a size
export async function laidOut(el) {
  while (el.clientHeight < 50 || el.clientWidth < 50) await new Promise((r) => requestAnimationFrame(r));
}
