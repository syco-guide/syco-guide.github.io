"use strict";
const D = window.DATA, C = window.CONTENT;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DOMAINS = [...new Set(D.rankings.map(r => r.domain))].sort();
const TURNS = ["single-turn", "multi-turn"];
const TARGET_LABEL = { traits: "user's traits", facts: "facts", beliefs: "beliefs and opinions", emotions: "emotions" };

// ------------------------------------------------------------------ Plackett–Luce
const MODELS = [...new Set(D.rankings.flatMap(r => r.order.map(o => o[0])))].sort();
const IDX = Object.fromEntries(MODELS.map((m, k) => [m, k]));

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// order of item indices from most to least sycophantic; ties at random
function toOrder(r, rand) {
  return r.order.map(([m, v]) => [IDX[m], v, rand()]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
}

// MM algorithm (Hunter 2004) with a weak Gamma prior so that every LM gets a finite score
function fitPL(orders, eps = 0.01, iters = 300) {
  const n = MODELS.length, w = new Float64Array(n).fill(1), wins = new Float64Array(n), seen = new Uint8Array(n);
  for (const o of orders) o.forEach((i, k) => { seen[i] = 1; if (k < o.length - 1) wins[i]++; });
  const den = new Float64Array(n);
  for (let it = 0; it < iters; it++) {
    den.fill(0);
    for (const o of orders) {
      const m = o.length, S = new Float64Array(m);
      let s = 0; for (let k = m - 1; k >= 0; k--) { s += w[o[k]]; S[k] = s; }
      let cum = 0;
      for (let k = 0; k < m; k++) { if (k < m - 1) cum += 1 / S[k]; den[o[k]] += cum; }
    }
    let delta = 0;
    for (let i = 0; i < n; i++) if (seen[i]) {
      const nw = (wins[i] + eps) / (den[i] + eps);
      delta = Math.max(delta, Math.abs(Math.log(nw / w[i]))); w[i] = nw;
    }
    if (delta < 1e-7) break;
  }
  const th = new Float64Array(n).fill(NaN); let mean = 0, c = 0;
  for (let i = 0; i < n; i++) if (seen[i]) { th[i] = Math.log(w[i]); mean += th[i]; c++; }
  for (let i = 0; i < n; i++) if (seen[i]) th[i] -= mean / c;
  return th;
}

function quantile(a, q) { const s = a.slice().sort((x, y) => x - y), p = (s.length - 1) * q, f = Math.floor(p); return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (p - f); }

// fit + bootstrap over rankings, in chunks so the page stays responsive
function fitWithIntervals(rankings, B, onProgress) {
  return new Promise(resolve => {
    const rand = rng(1), point = fitPL(rankings.map(r => toOrder(r, rand)));
    const draws = MODELS.map(() => []);
    let b = 0;
    const step = () => {
      const end = Math.min(B, b + 10);
      for (; b < end; b++) {
        const sample = Array.from({ length: rankings.length }, () => rankings[Math.floor(rand() * rankings.length)]);
        const th = fitPL(sample.map(r => toOrder(r, rand)), 0.01, 150);
        th.forEach((t, i) => { if (!isNaN(t)) draws[i].push(t); });
      }
      onProgress && onProgress(b / B);
      if (b < B) setTimeout(step, 0); else {
        const count = new Array(MODELS.length).fill(0);
        rankings.forEach(r => r.order.forEach(([m]) => count[IDX[m]]++));
        resolve(MODELS.map((m, i) => ({
          model: m, theta: point[i], n: count[i],
          lo: draws[i].length > 10 ? quantile(draws[i], 0.025) : NaN,
          hi: draws[i].length > 10 ? quantile(draws[i], 0.975) : NaN,
        })).filter(x => x.n > 0));
      }
    };
    step();
  });
}

function kendallTau(x, y) {        // tau-b
  let c = 0, d = 0, tx = 0, ty = 0;
  for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) {
    const a = Math.sign(x[i] - x[j]), b = Math.sign(y[i] - y[j]);
    if (a === 0 && b === 0) continue; if (a === 0) { tx++; continue; } if (b === 0) { ty++; continue; }
    a === b ? c++ : d++;
  }
  const den = Math.sqrt((c + d + tx) * (c + d + ty));
  return den ? (c - d) / den : NaN;
}

// each filter is a list of allowed values; an empty or missing list allows all
const ok = (vals, v) => !vals || !vals.length || vals.includes(v);
const select = (rs, f) => rs.filter(r => ok(f.turns, r.turns) && ok(f.domain, r.domain) && ok(f.target, r.target));
const studies = rs => new Set(rs.map(r => r.study)).size;

// full fit, used by the guide (reference LMs) and the ranking check
let FULL = null;
const fullReady = fitWithIntervals(D.rankings, 300).then(res => (FULL = res));

// ------------------------------------------------------------------ tabs
function showTab() {
  const t = (location.hash || "#guide").slice(1).split("?")[0];
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.dataset.tab === t));
  document.querySelectorAll("section.tab").forEach(s => s.classList.toggle("on", s.id === "tab-" + t));
}
window.addEventListener("hashchange", showTab);

// ------------------------------------------------------------------ 1. guide
// every step allows several answers; at least one stays selected
const STEPS = [
  { stage: "Conceptualise", key: "target", title: "What does the sycophancy target?", q: "The first axis of the taxonomy: what the behaviour is directed at.",
    opts: Object.entries(C.targets).map(([k, v]) => [k, v.label]) },
  { stage: "Conceptualise", key: "trigger", title: "Does it have to be triggered?", q: "The second axis of the taxonomy: whether the sycophancy reacts to a cue from the user, such as a stated view or pushback, or appears without one.",
    opts: [["reactive", "yes, by a cue from the user"], ["proactive", "no, without a cue"]] },
  { stage: "Conceptualise", key: "knows", title: "Does the LM know the truth?", q: "The third axis: some definitions require that the LM knows the truth, some describe an LM that does not know it (or there is none), and some leave it unspecified.",
    opts: [["knows", "it knows"], ["unknown", "it does not know"], ["unspecified", "not specified"]] },
  { stage: "Operationalise", key: "turns", title: "Number of turns", q: "An operationalisation choice, separate from the trigger: the user's cue can be in the first prompt (single-turn) or come after the LM's first answer (multi-turn).",
    opts: [["single", "single-turn"], ["multi", "multi-turn"]] },
  { stage: "Operationalise", key: "format", title: "Question format", q: "Fixed answer options give a clear ground truth but resemble real use less; open-ended answers need a judge or rubric.",
    opts: [["MCQ", "multiple choice"], ["OE", "open-ended"]] },
  { stage: "Operationalise", key: "domain", title: "Domain", q: "The domain of the rankings and benchmarks to compare with.",
    opts: DOMAINS.map(d => [d, d]) },
  { stage: "Measure", key: "gt", title: "Is there a ground truth?", q: "A known correct answer against which responses are scored.",
    opts: [["yes", "yes"], ["no", "no"]] },
  { stage: "Measure", key: "compare", title: "Do you compare responses?", q: "Standalone metrics judge each response on its own; comparative metrics compare at least two responses, e.g. with and without the user's view.",
    opts: [["standalone", "no, single response"], ["comparative", "yes, two or more"]] },
];
const choice = { target: ["facts"], trigger: ["reactive"], turns: ["multi"], format: ["OE"], gt: ["yes"], knows: ["unspecified"], compare: ["comparative"], domain: ["factual"] };
const has = (k, v) => choice[k].includes(v);

function dimList(dims) { return dims.map(([n, r]) => `<b>${esc(n)}</b> (${esc(r)})`).join(", "); }
function joinAnd(xs) { return xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]; }
const KNOWS_TEXT = {
  knows: () => "Dimensions where the LM knows the truth: " + dimList(C.truth.knows),
  unknown: () => "Dimensions where the LM does not know the truth: " + dimList(C.truth.unknown) + ". On that account, this is not sycophancy.",
  unspecified: () => "Dimensions whose definition does not specify what the LM knows: " + dimList(C.truth.unspecified),
};

function renderSteps() {
  const STAGE_Q = {
    Conceptualise: "What counts as sycophancy, and what does not? State explicitly whether your definition requires a stated user opinion, pushback from the user, that the LM knows the ground truth and abandons it, or flattery of the user.",
    Operationalise: "How is sycophancy elicited, and in which LMs?",
    Measure: "How is sycophancy scored?",
  };
  $("#steps").innerHTML = STEPS.map((s, k) => {
    const head = k === 0 || STEPS[k - 1].stage !== s.stage ? `<h2 class="stage">${esc(s.stage)}</h2><p class="q">${esc(STAGE_Q[s.stage])}</p>` : "";
    let extra = [];
    if (s.key === "target") extra = choice.target.map(t => `${esc(C.targets[t].label)}: ${esc(C.targets[t].help)}. Dimensions: ${dimList(C.targets[t].dims)}`);
    if (s.key === "trigger") extra = choice.trigger.map(t => `Dimensions ${esc(C.triggers[t].label)}: ${dimList(C.triggers[t].dims)}`);
    if (s.key === "knows") extra = choice.knows.map(t => KNOWS_TEXT[t]());
    return head + `<div class="card"><h3><span class="step">${k + 1}</span>${esc(s.title)}</h3><p class="q">${esc(s.q)} <span class="note">Select one or more.</span></p>
      <div class="opts">${s.opts.map(([v, l]) => `<label><input type="checkbox" name="${s.key}" value="${esc(v)}" ${has(s.key, v) ? "checked" : ""}>${esc(l)}</label>`).join("")}</div>
      ${extra.map(e => `<div class="dims">${e}</div>`).join("")}</div>`;
  }).join("");
  $("#steps").querySelectorAll("input").forEach(i => i.addEventListener("change", () => {
    const vals = [...$("#steps").querySelectorAll(`input[name="${i.name}"]:checked`)].map(x => x.value);
    if (vals.length) choice[i.name] = STEPS.find(s => s.key === i.name).opts.map(o => o[0]).filter(v => vals.includes(v));
    renderSteps(); renderResult();
  }));
}

function renderResult() {
  const ch = choice;
  const turns = ch.turns.map(t => t + "-turn");
  const combos = ch.compare.flatMap(c => ch.gt.map(g => [c, g]));
  const scopeRs = select(D.rankings, { turns, domain: ch.domain });
  const benches = C.benchmarks.filter(b => b.domains.some(d => ch.domain.includes(d)) && (b.turns === "both" || ch.turns.includes(b.turns)));
  const sameFormat = b => b.format === "Both" || ch.format.includes(b.format);
  const several = ch.turns.length > 1 || ch.format.length > 1 || combos.length > 1 || ch.domain.length > 1 || ch.target.length > 1;
  const checks = [
    "Report the full ranking of LMs, not only the most and least sycophantic one.",
    "Report the number of turns, the question format, and how the metric is computed" + (several ? ", and report results separately for each setting, since rankings from one setting need not hold in another." : "."),
    has("format", "OE") || has("gt", "no") ? C.metricCaveats.judge : null,
    has("knows", "knows") ? "Measure what the LM knows, e.g. its certainty in the first answer or its internal states; correctness of an answer does not imply knowledge of it." : null,
    has("knows", "unknown") ? "Report how uncertain the LM is; agreement that grows with uncertainty is uncertainty-driven conformity rather than sycophancy on some accounts." : null,
    has("knows", "unspecified") ? "State that the design does not separate sycophancy from genuine agreement and uncertainty-driven conformity." : null,
    "Compare every prompt with a stance against a neutral baseline in the same format.",
    "Use about 100 items or more; datasets with 40 or fewer items rank LMs unreliably.",
    "Include reference LMs from both ends of the meta-ranking, e.g. GPT-5 or Claude Sonnet 4.6 and Gemma 3 4B or Qwen2.5 7B, so that new results can be placed.",
    "Score with an LM judge, string match, or log-probs; for open-ended data, use more than one judge, as judges can disagree.",
    "Claim that one LM is less sycophantic than another only for a clear difference pooled over several datasets.",
  ].filter(Boolean);

  let refs = "<span class='progress'>computing&hellip;</span>";
  if (FULL) {
    const r = FULL.filter(x => x.n >= 4 && (x.lo > 0 || x.hi < 0)).sort((a, b) => b.n - a.n).slice(0, 8);
    refs = r.map(x => `${esc(x.model)} <span class="note">(${x.n} rankings, ${x.hi < 0 ? "less" : "more"})</span>`).join(", ");
  }
  const fmt = { MCQ: "multiple-choice", OE: "open-ended" };
  const metricBlock = ([c, g]) => `${combos.length > 1 ? `<p class="note" style="margin:8px 0 0">${c}, ${g === "yes" ? "with" : "without"} ground truth</p>` : ""}
    <ul>${C.metrics[c + "_" + (g === "yes" ? "gt" : "nogt")].map(m => `<li><b>${esc(m.name)}</b>: ${esc(m.how)} <span class="note">e.g. ${esc(m.ex)}</span></li>`).join("")}</ul>`;
  $("#result").innerHTML = `
    <h2>Your design</h2>
    <div class="design">A ${joinAnd(turns)}, ${joinAnd(ch.format.map(f => fmt[f]))} study of sycophancy towards ${joinAnd(ch.target.map(t => `<i>${esc(C.targets[t].label)}</i>`))} in the ${esc(joinAnd(ch.domain))} domain${ch.domain.length > 1 ? "s" : ""}, ${ch.gt.length > 1 ? "with and without" : has("gt", "yes") ? "with" : "without"} a ground truth, using ${ch.compare.length > 1 ? "<b>standalone and comparative metrics</b>" : `a <b>${ch.compare[0]} metric</b>`}.</div>
    <h4>Metric types</h4>
    ${combos.map(metricBlock).join("")}
    ${ch.compare.map(c => `<div class="warn">${esc(C.metricCaveats[c])}</div>`).join("")}
    ${has("gt", "no") ? `<div class="warn">${esc(C.metricCaveats.nogt)}</div>` : ""}
    ${has("format", "MCQ") && has("gt", "no") && ch.gt.length === 1 ? `<div class="warn">Multiple-choice questions usually come with a ground truth; check whether one exists.</div>` : ""}
    <h4>Benchmarks with this scope</h4>
    ${benches.length ? `<ul>${benches.map(b => `<li>${esc(b.name)} <span class="note">${esc(b.ref)}, ${b.format}, ${b.turns}-turn, metric ${b.metric}</span>${sameFormat(b) ? "" : ' <span class="pill">other format</span>'}</li>`).join("")}</ul>` : "<p class='note'>No benchmark in the review covers this scope.</p>"}
    <p class="note">A benchmark ranks LMs on its own operationalisation of sycophancy: in the paper, the rankings of ELEPHANT, PARROT, and SycoEval-EM do not agree with other studies of their scope. Only factual rankings agree across studies; for other domains, evaluate on a dataset of that kind.</p>
    <h4>Rankings in the literature with this scope</h4>
    <p><span class="big">${scopeRs.length}</span> rankings from ${studies(scopeRs)} studies ${scopeRs.length ? `<button class="ghost" id="to-pos">See the meta-ranking</button>` : ""}</p>
    <h4>What to report</h4>
    <ul>${checks.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
    <p class="note">LMs with a consistent position in many rankings, as candidates for reference LMs: ${refs}</p>`;
  const btn = $("#to-pos");
  if (btn) btn.onclick = () => { setChips($("#f-turns"), turns); setChips($("#f-domain"), ch.domain); setChips($("#f-target"), []); location.hash = "#positions"; runPositions(); };
}

// ------------------------------------------------------------------ 2. positions
// filter chips: none selected = all
function fillChips(el, values, labels = {}) {
  el.innerHTML = values.map(v => `<label><input type="checkbox" value="${esc(v)}">${esc(labels[v] || v)}</label>`).join("");
}
const getChips = el => [...el.querySelectorAll("input:checked")].map(i => i.value);
const setChips = (el, vals) => el.querySelectorAll("input").forEach(i => i.checked = vals.includes(i.value));

function plot(res, minN) {
  const rows = res.filter(x => x.n >= minN && !isNaN(x.theta)).sort((a, b) => a.theta - b.theta);
  if (!rows.length) { $("#plot").innerHTML = "<p class='note'>No LM in enough rankings.</p>"; return; }
  const lo = Math.min(...rows.map(r => isNaN(r.lo) ? r.theta : r.lo)), hi = Math.max(...rows.map(r => isNaN(r.hi) ? r.theta : r.hi));
  const W = Math.max(560, $("#plot").clientWidth), L = 210, R = 20, H = 18, top = 26;
  const x = v => L + (v - lo) / (hi - lo || 1) * (W - L - R);
  const col = r => r.n >= minN && r.hi < 0 ? "var(--less)" : r.n >= minN && r.lo > 0 ? "var(--more)" : "var(--ns)";
  const ticks = []; for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) ticks.push(t);
  let s = `<svg width="${W}" height="${top + rows.length * H + 30}" role="img" aria-label="Plackett–Luce scores">`;
  ticks.forEach(t => s += `<line class="${t === 0 ? "zero" : "axis"}" x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${top + rows.length * H}"/><text x="${x(t)}" y="${top - 10}" text-anchor="middle">${t}</text>`);
  rows.forEach((r, k) => {
    const y = top + k * H + H / 2;
    s += `<text x="${L - 8}" y="${y + 4}" text-anchor="end">${esc(r.model)} (${r.n})</text>`;
    if (!isNaN(r.lo)) s += `<line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${y}" y2="${y}" stroke="${col(r)}" stroke-width="2" opacity="0.6"/>`;
    s += `<circle cx="${x(r.theta)}" cy="${y}" r="4.5" fill="${col(r)}"><title>${esc(r.model)}: θ = ${r.theta.toFixed(2)} [${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}], ${r.n} rankings</title></circle>`;
  });
  s += `<text x="${(L + W - R) / 2}" y="${top + rows.length * H + 24}" text-anchor="middle">Plackett–Luce score θ (higher = more sycophantic)</text></svg>`;
  $("#plot").innerHTML = s;
}

async function runPositions() {
  const f = { turns: getChips($("#f-turns")), domain: getChips($("#f-domain")), target: getChips($("#f-target")) };
  const rs = select(D.rankings, f), minN = +$("#f-min").value, B = +$("#f-boot").value;
  $("#f-warn").hidden = !(f.turns.length || f.domain.length || f.target.length);
  if (rs.length < 2) { $("#f-info").textContent = "Fewer than two rankings match."; $("#plot").innerHTML = ""; return; }
  const res = await fitWithIntervals(rs, B, p => $("#f-info").textContent = `${rs.length} rankings from ${studies(rs)} studies; resampling ${Math.round(p * 100)}%`);
  const shown = res.filter(x => x.n >= minN), cons = shown.filter(x => x.lo > 0 || x.hi < 0);
  $("#f-info").textContent = `${rs.length} rankings from ${studies(rs)} studies. ${cons.length} of ${shown.length} LMs in at least ${minN} rankings have a consistent position (${B} resamples of the rankings).`;
  plot(res, minN);
}

// ------------------------------------------------------------------ 3. check a ranking
// names match case-insensitively and ignoring spaces, hyphens and underscores,
// so "Qwen2.5 7B" and "Qwen2.5-7B" are the same LM
const squash = s => s.trim().toLowerCase().replace(/[\s_-]+/g, "");
let SQUASHED = null;
function resolveName(s) {
  const k = s.trim().toLowerCase();
  if (D.names[k]) return D.names[k];
  if (!SQUASHED) {
    SQUASHED = {};
    MODELS.forEach(m => SQUASHED[squash(m)] = m);
    Object.entries(D.names).forEach(([a, m]) => SQUASHED[squash(a)] ??= m);
  }
  return MODELS.find(m => m.toLowerCase() === k) || SQUASHED[squash(s)] || null;
}

async function runCheck() {
  const lines = $("#c-input").value.split("\n").map(l => l.trim()).filter(Boolean);
  const mine = {}, unknown = [];
  lines.forEach((l, k) => l.split("=").forEach(n => { const m = resolveName(n); if (m) mine[m] = mine[m] ? Math.min(mine[m], k + 1) : k + 1; else unknown.push(n.trim()); }));
  const f = { turns: getChips($("#c-turns")), domain: getChips($("#c-domain")) };
  $("#c-out").innerHTML = "<p class='progress'>fitting&hellip;</p>";
  await fullReady;
  const scope = select(D.rankings, f);
  const scopeFit = (f.turns.length || f.domain.length) && scope.length >= 2 ? fitPL(scope.map(r => toOrder(r, rng(2)))) : null;
  const compare = th => {
    const shared = Object.keys(mine).filter(m => !isNaN(th[IDX[m]]));
    return { n: shared.length, tau: shared.length >= 3 ? kendallTau(shared.map(m => -mine[m]), shared.map(m => th[IDX[m]])) : NaN, shared };
  };
  const fullTh = new Float64Array(MODELS.length).fill(NaN); FULL.forEach(x => fullTh[IDX[x.model]] = x.theta);
  const all = compare(fullTh), sc = scopeFit ? compare(scopeFit) : null;
  // direct ranking: pooled positions, and for a scope the mean z-score over the matching datasets
  const DR = window.DIRECT, dTh = th => { const out = new Float64Array(MODELS.length).fill(NaN);
    Object.entries(th).forEach(([lm, v]) => { const m = resolveName(lm); if (m && IDX[m] !== undefined) out[IDX[m]] = v; }); return out; };
  const dAll = compare(dTh(Object.fromEntries(DR.lms.map(l => [l.lm, l.theta]))));
  const dSets = Object.values(DR.datasets).filter(d => (!f.turns.length || f.turns.includes(d.turns + "-turn")) && (!f.domain.length || f.domain.includes(d.domain)));
  let dSc = null;
  if ((f.turns.length || f.domain.length) && dSets.length) {
    const sum = {}, cnt = {};
    dSets.forEach(d => { const v = Object.values(d.scores), mu = v.reduce((a, b) => a + b, 0) / v.length,
      sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) || 1;
      Object.entries(d.scores).forEach(([lm, s]) => { sum[lm] = (sum[lm] || 0) + (s - mu) / sd; cnt[lm] = (cnt[lm] || 0) + 1; }); });
    dSc = compare(dTh(Object.fromEntries(Object.keys(sum).map(lm => [lm, sum[lm] / cnt[lm]]))));
  }
  const row = (label, r, nr) => `<tr><td>${label}</td><td>${nr}</td><td>${r.n}</td><td><b>${isNaN(r.tau) ? "–" : r.tau.toFixed(2)}</b></td></tr>`;
  $("#c-out").innerHTML = `<h3>Agreement with the meta-ranking</h3>
    <table><tr><th>meta-ranking fitted on</th><th>rankings</th><th>shared LMs</th><th>Kendall's τ</th></tr>
    ${row("all studies", all, D.rankings.length)}
    ${sc ? row("same scope", sc, scope.length) : ""}</table>
    <h3>Agreement with the direct ranking</h3>
    <table><tr><th>direct ranking on</th><th>datasets</th><th>shared LMs</th><th>Kendall's τ</th></tr>
    ${row("all datasets", dAll, Object.keys(DR.datasets).length)}
    ${dSc ? row("same scope", dSc, dSets.length) : ""}</table>
    <p class="note">The direct ranking covers ${DR.lms.length} LMs. For a scope, LMs are ordered by their mean standardised score over the datasets of that scope.</p>
    <p class="note">τ = 1: same order, 0: unrelated, −1: reversed. (1+τ)/2 is the share of LM pairs in the same order. With few shared LMs, τ is uncertain.</p>
    ${unknown.length ? `<div class="warn">Not found in the rankings: ${unknown.map(esc).join(", ")}</div>` : ""}
    <p class="note">Matched: ${Object.keys(mine).map(esc).join(", ")}</p>`;
}


// ------------------------------------------------------------------ 4. direct ranking
const X = window.DIRECT;
const DS_NAME = { beacon: "Beacon", elephant_aita: "ELEPHANT AITA", elephant_oeq: "ELEPHANT open questions", parrot_style: "PARROT-style on MMLU",
  sb_delusion: "syco-bench delusion", sb_mirror: "syco-bench mirror", sb_pickside: "syco-bench pick a side", sb_whosaid: "syco-bench who said it",
  se_answer: "SycophancyEval answer", se_are_you_sure: "SycophancyEval are you sure", se_feedback: "SycophancyEval feedback",
  sycon_debate: "SYCON debate", sycon_fp: "SYCON false presuppositions", sycon_fp_single: "SYCON false presuppositions, turn 1" };
const GROUP_COL = { less: "var(--less)", more: "var(--more)", none: "var(--ns)" };

function renderDirect() {
  $("#d-take").innerHTML = [
    "All nine LMs with a consistent position in the meta-ranking remain less or more sycophantic than the average LM; only four keep a consistent position.",
    "We can rely on the meta-ranking for whether such an LM is less or more sycophantic than average, not for its exact position.",
    "Factual datasets agree with each other and with the meta-ranking; datasets on feedback, beliefs, and interpersonal advice are reliable but rank LMs differently.",
    "Two LMs keep their order on over 90% of the datasets only if their scores differ by about 2 or more.",
  ].map(t => `<li>${esc(t)}</li>`).join("");
  const rows = X.lms, lo = Math.min(...rows.map(r => r.theta)) - 0.3, hi = Math.max(...rows.map(r => r.theta)) + 0.3;
  const W = Math.max(380, $("#d-plot").clientWidth || 420), L = 140, R = 14, H = 20, top = 22;
  const x = v => L + (v - lo) / (hi - lo) * (W - L - R);
  let s = `<svg width="${W}" height="${top + rows.length * H + 28}" role="img" aria-label="Direct-ranking scores">`;
  for (let t = Math.ceil(lo); t <= Math.floor(hi); t++) s += `<line class="${t === 0 ? "zero" : "axis"}" x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${top + rows.length * H}"/><text x="${x(t)}" y="${top - 10}" text-anchor="middle">${t}</text>`;
  rows.forEach((r, k) => {
    const y = top + k * H + H / 2, fill = r.consistent ? (r.theta < 0 ? "var(--less)" : "var(--more)") : "var(--ns)";
    s += `<text x="${L - 8}" y="${y + 4}" text-anchor="end">${esc(r.lm)}</text>`;
    s += `<circle cx="${x(r.theta)}" cy="${y}" r="7" fill="none" stroke="${GROUP_COL[r.meta_group]}" stroke-width="2"/>`;
    s += `<circle cx="${x(r.theta)}" cy="${y}" r="4" fill="${fill}"><title>${esc(r.lm)}: θ = ${r.theta.toFixed(2)}; meta-ranking: ${r.meta_group === "none" ? "no consistent position" : "consistently " + r.meta_group}</title></circle>`;
  });
  s += `<text x="${(L + W - R) / 2}" y="${top + rows.length * H + 22}" text-anchor="middle">score θ (higher = more sycophantic)</text></svg>`;
  $("#d-plot").innerHTML = s;
  const ds = Object.entries(X.datasets).sort((a, b) => (b[1].tau_meta ?? -9) - (a[1].tau_meta ?? -9));
  const f = v => v == null ? "–" : v.toFixed(2);
  $("#d-table").innerHTML = `<table><tr><th>dataset</th><th>domain</th><th>items (scored)</th><th>τ meta</th><th>split-half</th></tr>
    ${ds.map(([k, d]) => `<tr><td>${esc(DS_NAME[k] || k)}</td><td>${esc(d.domain)}</td><td>${d.items}${d.scored && d.scored !== d.items ? ` (${d.scored})` : ""}</td><td>${f(d.tau_meta)}</td><td>${f(d.split_half)}</td></tr>`).join("")}</table>`;
}

// ------------------------------------------------------------------ 5. predictions
const CACHE = {};
let CURRENT = [];
async function loadBench(b) {
  if (!CACHE[b]) {
    const r = await fetch(`predictions/${b}.json`);
    if (!r.ok) throw new Error(`predictions/${b}.json: ${r.status}`);
    CACHE[b] = await r.json();
  }
  return CACHE[b];
}

async function runPredictions() {
  const benches = getChips($("#p-bench")), lms = getChips($("#p-lm")), syc = getChips($("#p-syc")), text = getChips($("#p-text"));
  const use = benches.length ? benches : Object.keys(X.datasets);
  $("#p-info").textContent = "loading…"; $("#p-csv").disabled = $("#p-jsonl").disabled = true;
  const out = [];
  try {
    for (const [k, b] of use.entries()) {
      $("#p-info").textContent = `loading ${DS_NAME[b] || b} (${k + 1} of ${use.length})…`;
      const d = await loadBench(b), c = Object.fromEntries(d.columns.map((n, i) => [n, i]));
      for (const r of d.rows) {
        if (lms.length && !lms.includes(r[c.lm])) continue;
        const v = r[c.item_sycophancy];
        if (syc.length && !(syc.includes("yes") && v != null && v >= 0.5 || syc.includes("no") && v != null && v < 0.5)) continue;
        const o = { dataset: b, lm: r[c.lm], item: r[c.item], condition: r[c.condition], turn: r[c.turn], item_sycophancy: v,
          labels_default: r[c.labels_default], labels_claude_haiku: r[c.labels_claude_haiku], labels_jev: r[c.labels_jev] };
        if (text.includes("prompt")) o.prompt = d.prompts[`${r[c.item]}|${r[c.condition]}|${r[c.turn]}`] ?? "";
        if (text.includes("response")) o.response = r[c.response];
        out.push(o);
      }
    }
  } catch (e) {
    $("#p-info").textContent = "Could not load the predictions (" + e.message + "). Open the page through a web server, not as a local file.";
    return;
  }
  CURRENT = out;
  $("#p-info").textContent = `${out.length.toLocaleString()} responses from ${use.length} dataset${use.length > 1 ? "s" : ""}.`;
  $("#p-csv").disabled = $("#p-jsonl").disabled = !out.length;
  const cols = out.length ? Object.keys(out[0]) : [];
  const cell = v => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return esc(t.length > 160 ? t.slice(0, 160) + "…" : t); };
  $("#p-preview").innerHTML = out.length ? `<p class="note">First 20 rows</p><table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>
    ${out.slice(0, 20).map(o => `<tr>${cols.map(c => `<td>${cell(o[c])}</td>`).join("")}</tr>`).join("")}</table>` : "<p class='note'>No response matches.</p>";
}

function download(name, body, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
function toCSV(rows) {
  const cols = Object.keys(rows[0]);
  const q = v => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [cols.join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\n");
}

// ------------------------------------------------------------------ init
fillChips($("#f-turns"), TURNS); fillChips($("#f-domain"), DOMAINS); fillChips($("#f-target"), Object.keys(TARGET_LABEL), TARGET_LABEL);
fillChips($("#c-turns"), TURNS); fillChips($("#c-domain"), DOMAINS);
$("#f-run").onclick = runPositions; $("#c-run").onclick = runCheck;
fillChips($("#p-bench"), Object.keys(X.datasets), DS_NAME); fillChips($("#p-lm"), X.lms.map(r => r.lm));
fillChips($("#p-syc"), ["yes", "no"], { yes: "sycophantic", no: "not sycophantic" });
fillChips($("#p-text"), ["prompt", "response"], { prompt: "include prompt", response: "include response" });
setChips($("#p-text"), ["prompt", "response"]); setChips($("#p-bench"), ["sb_delusion"]);
$("#p-load").onclick = runPredictions;
$("#p-csv").onclick = () => download("sycophancy_predictions.csv", toCSV(CURRENT), "text/csv");
$("#p-jsonl").onclick = () => download("sycophancy_predictions.jsonl", CURRENT.map(r => JSON.stringify(r)).join("\n") + "\n", "application/x-ndjson");
renderDirect();
renderSteps(); renderResult(); showTab();
fullReady.then(() => { renderResult(); if (!$("#plot").innerHTML) runPositions(); });
