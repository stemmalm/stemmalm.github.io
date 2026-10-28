// StemmaLM in the browser: the EN1 learner (character-level GPT, 6 layers, 6 heads, width 384,
// window 256), run from an fp16 snapshot exported by tools/export_web.py. Same computation as
// the PyTorch model (nn.MultiheadAttention, exact GELU, LayerNorm eps 1e-5, tied output layer).

const D = 384, H = 6, HD = 64, L = 6, F = 1536, BLOCK = 256, EPS = 1e-5;

// fp16 -> fp32 lookup table
const F16 = new Float32Array(65536);
for (let h = 0; h < 65536; h++) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  F16[h] = e === 0 ? s * Math.pow(2, -14) * (m / 1024)
    : e === 31 ? (m ? NaN : s * Infinity)
    : s * Math.pow(2, e - 15) * (1 + m / 1024);
}

export function decode(buffer) {
  const u = new Uint16Array(buffer), f = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) f[i] = F16[u[i]];
  return f;
}

export function makeModel(manifest, flat) {
  const T = {};
  for (const t of manifest.tensors) {
    const n = t.shape.reduce((a, b) => a * b, 1);
    T[t.name] = flat.subarray(t.offset, t.offset + n);
  }
  return { T, vocab: manifest.vocab, V: manifest.vocab.length };
}

function layerNorm(x, w, b, out) {
  let mean = 0;
  for (let i = 0; i < D; i++) mean += x[i];
  mean /= D;
  let v = 0;
  for (let i = 0; i < D; i++) { const d = x[i] - mean; v += d * d; }
  const r = 1 / Math.sqrt(v / D + EPS);
  for (let i = 0; i < D; i++) out[i] = (x[i] - mean) * r * w[i] + b[i];
  return out;
}

// out[r] = W[r,:] . x + b[r]   (W row-major, rows x cols)
function linear(W, b, x, rows, cols, out) {
  for (let r = 0; r < rows; r++) {
    let s = b ? b[r] : 0;
    const o = r * cols;
    for (let c = 0; c < cols; c++) s += W[o + c] * x[c];
    out[r] = s;
  }
  return out;
}

function erf(x) {  // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

// Incremental decoding with a key/value cache; positions restart when the window slides.
export function newState() {
  return { k: Array.from({ length: L }, () => []), v: Array.from({ length: L }, () => []), n: 0 };
}

const buf = { x: new Float32Array(D), h: new Float32Array(D), qkv: new Float32Array(3 * D),
  att: new Float32Array(D), o: new Float32Array(D), f: new Float32Array(F), m: new Float32Array(D) };

export function step(model, state, token) {
  const { T } = model, x = buf.x, pos = state.n;
  for (let i = 0; i < D; i++) x[i] = T["tok.weight"][token * D + i] + T["pos.weight"][pos * D + i];
  for (let l = 0; l < L; l++) {
    const p = `blocks.${l}.`;
    layerNorm(x, T[p + "ln1.weight"], T[p + "ln1.bias"], buf.h);
    linear(T[p + "attn.in_proj_weight"], T[p + "attn.in_proj_bias"], buf.h, 3 * D, D, buf.qkv);
    state.k[l].push(buf.qkv.slice(D, 2 * D));
    state.v[l].push(buf.qkv.slice(2 * D, 3 * D));
    const K = state.k[l], Vv = state.v[l], n = K.length, scale = 1 / Math.sqrt(HD);
    const sc = new Float32Array(n);
    for (let hh = 0; hh < H; hh++) {
      const o = hh * HD;
      let mx = -Infinity;
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let d = 0; d < HD; d++) s += buf.qkv[o + d] * K[j][o + d];
        sc[j] = s * scale; if (sc[j] > mx) mx = sc[j];
      }
      let z = 0;
      for (let j = 0; j < n; j++) { sc[j] = Math.exp(sc[j] - mx); z += sc[j]; }
      for (let d = 0; d < HD; d++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += sc[j] * Vv[j][o + d];
        buf.att[o + d] = s / z;
      }
    }
    linear(T[p + "attn.out_proj.weight"], T[p + "attn.out_proj.bias"], buf.att, D, D, buf.o);
    for (let i = 0; i < D; i++) x[i] += buf.o[i];
    layerNorm(x, T[p + "ln2.weight"], T[p + "ln2.bias"], buf.h);
    linear(T[p + "mlp.0.weight"], T[p + "mlp.0.bias"], buf.h, F, D, buf.f);
    for (let i = 0; i < F; i++) buf.f[i] = 0.5 * buf.f[i] * (1 + erf(buf.f[i] / Math.SQRT2));
    linear(T[p + "mlp.2.weight"], T[p + "mlp.2.bias"], buf.f, D, F, buf.m);
    for (let i = 0; i < D; i++) x[i] += buf.m[i];
  }
  state.n++;
  layerNorm(x, T["ln.weight"], T["ln.bias"], buf.h);
  return linear(T["tok.weight"], null, buf.h, model.V, D, new Float32Array(model.V));  // tied output
}

// logits for the last position of a whole sequence (fresh cache)
export function run(model, ids) {
  const st = newState();
  let logits = null;
  for (const t of ids) logits = step(model, st, t);
  return { logits, state: st };
}

// One utterance, sampled from the model's own distribution (temperature 1, no truncation),
// until a line break; context is the last CTX characters of the conversation, as in the study.
export function reply(model, text, { ctx = 128, maxNew = 150, rand = Math.random } = {}) {
  const stoi = new Map(model.vocab.map((c, i) => [c, i]));
  const nl = stoi.get("\n");
  let ids = [...text].filter((c) => stoi.has(c)).map((c) => stoi.get(c)).slice(-ctx);
  let { logits, state } = run(model, ids);
  const out = [];
  for (let s = 0; s < maxNew; s++) {
    let mx = -Infinity;
    for (const v of logits) if (v > mx) mx = v;
    let z = 0;
    const p = logits.map((v) => { const e = Math.exp(v - mx); z += e; return e; });
    let r = rand() * z, t = 0;
    while (t < p.length - 1 && (r -= p[t]) > 0) t++;
    if (t === nl) break;
    out.push(model.vocab[t]);
    ids.push(t);
    if (ids.length > BLOCK) {  // window full: crop like x[:, -256:] and recompute
      ids = ids.slice(-BLOCK);
      ({ logits, state } = run(model, ids));
    } else {
      logits = step(model, state, t);
    }
  }
  return out.join("");
}

// CHILDES transcripts name real families: every capitalised word becomes "(name)" unless it is
// an I-form, a kin term, a calendar word or one of a few fictional characters.
const KEEP = new Set(`I I'm I'll I've I'd Mommy Mommy's Daddy Daddy's Mom Mom's Mama Mummy Dad Dad's Papa
Grandma Grandpa Nana Granny Honey Mr Mrs Mister Miss Christmas Santa Easter Halloween Thanksgiving
Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July
August September October November December Elmo Pooh Big Bird Mickey Mouse OK`.split(/\s+/));

export function scrub(text) {
  return text.replace(/\b[A-Z][A-Za-z']*/g, (w) => KEEP.has(w) ? w : (w.endsWith("'s") ? "(name)'s" : "(name)"));
}
