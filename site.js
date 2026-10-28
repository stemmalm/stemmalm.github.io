// Shared helpers: the registry and how an individual's number reads.
export const STATUS = { untrained: "Not trained", training: "Growing", trained: "Grown" };

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
