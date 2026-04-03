const TILE_WIDTH_PX = 16;
const LAPLACE_FLOOR = 0.0001;

const KNOWN_PATTERNS = {
  "123": { freq: "38%", tip: "Sequential digits — the most common pattern in leaked passwords." },
  "pas": { freq: "12%", tip: "Extremely common prefix. Start with something unexpected." },
  "qwe": { freq: "9%", tip: "Top keyboard row — attackers try this first." },
  "abc": { freq: "7%", tip: "Alphabetical sequence — trivially predictable." },
  "wor": { freq: "6%", tip: "Common word fragment from 'password'." },
  "asd": { freq: "5%", tip: "Left-hand keyboard row pattern." },
  "zxc": { freq: "4%", tip: "Bottom keyboard row pattern." },
  "000": { freq: "8%", tip: "Repetitive digits add almost zero entropy." },
  "111": { freq: "7%", tip: "Repetitive digits add almost zero entropy." },
  "999": { freq: "5%", tip: "Repetitive digits add almost zero entropy." },
  "!!!": { freq: "6%", tip: "Trailing symbols alone don't meaningfully increase strength." },
  "321": { freq: "11%", tip: "Reverse sequential — just as predictable." },
  "666": { freq: "4%", tip: "Repetitive digits add almost zero entropy." },
  "tes": { freq: "4%", tip: "Common word fragment from 'test'." },
  "lov": { freq: "4%", tip: "Common word fragment from 'love'." },
  "god": { freq: "3%", tip: "Common short word — in every dictionary." },
  "sun": { freq: "3%", tip: "Common short word — in every dictionary." },
  "mon": { freq: "3%", tip: "Common prefix (monday, monkey, money)." },
};

let model = null;
let modelLoading = false;

async function loadModel() {
  if (model) return model;
  if (modelLoading) {
    while (!model) await new Promise(r => setTimeout(r, 100));
    return model;
  }
  modelLoading = true;
  try {
    const url = chrome.runtime.getURL("data/trigrams.json.gz");
    const response = await fetch(url);
    const ds = new DecompressionStream("gzip");
    const decompressed = response.body.pipeThrough(ds);
    const text = await new Response(decompressed).text();
    model = JSON.parse(text);
    return model;
  } catch (e) {
    console.error("[EntropyLens] Model load failed:", e);
    return null;
  }
}

function getProbability(m, context, char) {
  const ctx = m[context];
  if (!ctx) return LAPLACE_FLOOR;
  return ctx[char] ?? LAPLACE_FLOOR;
}

function classifyTransition(prob) {
  if (prob > 0.10) return "high";
  if (prob > 0.01) return "medium";
  return "low";
}

function computePasswordEntropy(probs) {
  return -probs.reduce((sum, p) => {
    const clamped = Math.max(p, 1e-10);
    return sum + Math.log2(clamped);
  }, 0);
}

function entropyLabel(bits) {
  if (bits >= 80) return { label: "Uncrackable", tier: 5 };
  if (bits >= 60) return { label: "Very Strong", tier: 4 };
  if (bits >= 40) return { label: "Strong", tier: 3 };
  if (bits >= 25) return { label: "Moderate", tier: 2 };
  if (bits >= 10) return { label: "Weak", tier: 1 };
  return { label: "Trivial", tier: 0 };
}

function tierColor(tier) {
  return ["#dc2626","#ef4444","#f59e0b","#06b6d4","#10b981","#8b5cf6"][tier];
}

function tierGradient(tier) {
  return [
    "linear-gradient(135deg,#dc2626,#991b1b)",
    "linear-gradient(135deg,#ef4444,#dc2626)",
    "linear-gradient(135deg,#f59e0b,#d97706)",
    "linear-gradient(135deg,#06b6d4,#0891b2)",
    "linear-gradient(135deg,#10b981,#059669)",
    "linear-gradient(135deg,#8b5cf6,#7c3aed)",
  ][tier];
}

function formatCrackTime(bits) {
  const guesses = Math.pow(2, bits);
  const scenarios = [
    { name: "Online (100/s)", rate: 100 },
    { name: "Offline PC (10K/s)", rate: 1e4 },
    { name: "GPU Rig (10B/s)", rate: 1e10 },
    { name: "Supercomputer (1T/s)", rate: 1e12 },
  ];
  function fmt(seconds) {
    if (seconds < 0.001) return "Instantly";
    if (seconds < 1) return "Under a second";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    if (seconds < 86400 * 365) return `${Math.round(seconds / 86400)}d`;
    const years = seconds / (86400 * 365);
    if (years < 1000) return `${Math.round(years)}yr`;
    if (years < 1e6) return `${(years / 1000).toFixed(0)}Kyr`;
    if (years < 1e9) return `${(years / 1e6).toFixed(0)}Myr`;
    if (years < 1e12) return `${(years / 1e9).toFixed(0)}Gyr`;
    return "∞";
  }
  return scenarios.map(s => ({ name: s.name, time: fmt(guesses / s.rate) }));
}

function analyzePassword(m, password) {
  const padded = "\x00\x00" + password;
  const results = [];
  for (let i = 2; i < padded.length; i++) {
    const c0 = padded[i - 2], c1 = padded[i - 1], c2 = padded[i];
    const prob = getProbability(m, c0 + c1, c2);
    results.push({
      index: i - 2, char: c2, prob,
      classification: classifyTransition(prob),
      bits: -Math.log2(Math.max(prob, 1e-10)),
    });
  }
  return results;
}

function initHeatmapOverlay(input) {
  let lastResults = null;
  let panelOpen = false;
  let panelEl = null;
  let badgeEl = null;
  let tilesEl = null;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;z-index:9998;pointer-events:none;opacity:0;transition:opacity 0.2s ease;";

  /* ── thin tile strip (sits INSIDE the input area, non-blocking) ── */
  tilesEl = document.createElement("div");
  tilesEl.style.cssText =
    "display:flex;gap:1px;padding:1px 0;pointer-events:none;";

  /* ── small floating badge (clickable) ── */
  badgeEl = document.createElement("div");
  badgeEl.style.cssText =
    "position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:auto;cursor:pointer;z-index:9999;" +
    "width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;" +
    "background:rgba(10,10,20,0.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);" +
    "transition:all 0.2s ease;opacity:0;";
  badgeEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  badgeEl.addEventListener("mouseenter", () => {
    badgeEl.style.background = "rgba(10,10,20,0.9)";
    badgeEl.style.borderColor = "rgba(255,255,255,0.2)";
    badgeEl.style.transform = "translateY(-50%) scale(1.1)";
  });
  badgeEl.addEventListener("mouseleave", () => {
    badgeEl.style.background = "rgba(10,10,20,0.7)";
    badgeEl.style.borderColor = "rgba(255,255,255,0.1)";
    badgeEl.style.transform = "translateY(-50%) scale(1)";
  });
  badgeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    panelOpen ? closePanel() : openPanel();
  });

  /* ── stats panel (hidden until clicked) ── */
  function buildPanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement("div");
    panelEl.style.cssText =
      "position:absolute;pointer-events:auto;z-index:10000;" +
      "width:360px;opacity:0;transform:translateY(8px) scale(0.97);" +
      "transition:all 0.25s cubic-bezier(0.4,0,0.2,1);" +
      "background:rgba(12,12,24,0.96);backdrop-filter:blur(20px) saturate(1.5);" +
      "border-radius:16px;border:1px solid rgba(255,255,255,0.1);" +
      "box-shadow:0 20px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.05);" +
      "overflow:hidden;max-height:80vh;overflow-y:auto;";

    panelEl.innerHTML = `
      <div style="padding:16px 18px 14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div id="el-icon" style="width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;"></div>
            <div>
              <div id="el-strength" style="font-size:15px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.3px;"></div>
              <div id="el-bits" style="font-size:10px;color:#64748b;font-family:system-ui,-apple-system,sans-serif;margin-top:1px;cursor:help;border-bottom:1px dashed rgba(255,255,255,0.15);display:inline-block;"></div>
            </div>
          </div>
          <div id="el-close" style="width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(255,255,255,0.06);transition:background 0.15s;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;margin-bottom:14px;">
          <div id="el-meter" style="height:100%;width:0%;border-radius:4px;transition:width 0.5s cubic-bezier(0.4,0,0.2,1),background 0.5s ease;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;" id="el-crack"></div>
        <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;margin-bottom:10px;">
          <div style="font-size:10px;color:#475569;font-family:system-ui,-apple-system,sans-serif;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;font-weight:600;">Character Heatmap</div>
          <div id="el-tiles" style="display:flex;gap:2px;flex-wrap:wrap;margin-bottom:6px;"></div>
          <div style="display:flex;gap:10px;font-size:9px;color:#64748b;font-family:system-ui,-apple-system,sans-serif;">
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:rgba(239,68,68,0.6);display:inline-block;"></span> Predictable</span>
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:rgba(245,158,11,0.5);display:inline-block;"></span> Somewhat common</span>
            <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:rgba(16,185,129,0.4);display:inline-block;"></span> Unpredictable</span>
          </div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
          <div style="font-size:10px;color:#475569;font-family:system-ui,-apple-system,sans-serif;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;font-weight:600;">What does this mean?</div>
          <div id="el-explain" style="font-size:11px;line-height:1.6;color:#94a3b8;font-family:system-ui,-apple-system,sans-serif;"></div>
        </div>
      </div>`;

    panelEl.querySelector("#el-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closePanel();
    });

    document.body.appendChild(panelEl);
    return panelEl;
  }

  function openPanel() {
    if (!lastResults) return;
    const panel = buildPanel();
    positionPanel();
    requestAnimationFrame(() => {
      panel.style.opacity = "1";
      panel.style.transform = "translateY(0) scale(1)";
    });
    panelOpen = true;
    updatePanel(lastResults);
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.style.opacity = "0";
    panelEl.style.transform = "translateY(8px) scale(0.97)";
    setTimeout(() => { if (panelEl) panelEl.style.display = "none"; }, 250);
    panelOpen = false;
  }

  function positionPanel() {
    if (!panelEl) return;
    const rect = input.getBoundingClientRect();
    const panelW = 360;
    let left = rect.left + rect.width / 2 - panelW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    const top = rect.bottom + 10;
    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
    panelEl.style.display = "block";
  }

  function buildExplanation(bits, results) {
    const info = entropyLabel(bits);
    const redCount = results.filter(r => r.classification === "high").length;
    const greenCount = results.filter(r => r.classification === "low").length;
    const total = results.length;
    const redPct = total > 0 ? Math.round((redCount / total) * 100) : 0;
    const greenPct = total > 0 ? Math.round((greenCount / total) * 100) : 0;

    const tierDescriptions = {
      0: {
        headline: "This password would be broken almost instantly.",
        detail: "It matches patterns seen millions of times in leaked password databases. Attackers try these sequences first.",
        tip: "Mix uppercase, lowercase, numbers, and symbols. Avoid common words and sequential characters.",
      },
      1: {
        headline: "This password is weak and vulnerable to automated attacks.",
        detail: "Most characters follow predictable patterns found in common passwords. A basic cracking tool would find this quickly.",
        tip: "Replace predictable parts with random characters. Try using a passphrase of 4+ random words instead.",
      },
      2: {
        headline: "This password offers moderate protection but has weak spots.",
        detail: "Some characters add real unpredictability, but others follow common patterns that reduce overall strength.",
        tip: "Look at the red tiles above — those characters are the weakest links. Replace them with something unexpected.",
      },
      3: {
        headline: "This is a strong password that would resist most attacks.",
        detail: "The majority of characters contribute meaningful entropy. Only a well-resourced attacker with significant computing power could crack this.",
        tip: "You're in good shape. To make it even stronger, ensure no part of it is a common word or pattern.",
      },
      4: {
        headline: "This password is very strong and would take enormous computing power to crack.",
        detail: "Almost every character adds significant randomness. Even dedicated GPU cracking rigs would need years.",
        tip: "Excellent. Just make sure you can remember it or store it in a password manager.",
      },
      5: {
        headline: "This password is essentially uncrackable with current technology.",
        detail: "The entropy is so high that even the world's most powerful supercomputers would need longer than the age of the universe to brute-force it.",
        tip: "Perfect. This is as strong as it gets.",
      },
    };

    const desc = tierDescriptions[info.tier];
    let html = `<div style="margin-bottom:8px;"><span style="color:#e2e8f0;font-weight:600;">${desc.headline}</span></div>`;
    html += `<div style="margin-bottom:8px;color:#64748b;">${desc.detail}</div>`;
    html += `<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:8px 10px;margin-bottom:8px;">`;
    html += `<div style="font-size:9px;color:#8b5cf6;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px;">💡 Tip</div>`;
    html += `<div style="color:#94a3b8;">${desc.tip}</div>`;
    html += `</div>`;
    html += `<div style="display:flex;gap:12px;margin-top:8px;">`;
    html += `<div style="flex:1;background:rgba(255,255,255,0.03);border-radius:6px;padding:6px 8px;text-align:center;">`;
    html += `<div style="font-size:16px;font-weight:700;color:#ef4444;">${redPct}%</div>`;
    html += `<div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.3px;">Predictable</div>`;
    html += `</div>`;
    html += `<div style="flex:1;background:rgba(255,255,255,0.03);border-radius:6px;padding:6px 8px;text-align:center;">`;
    html += `<div style="font-size:16px;font-weight:700;color:#10b981;">${greenPct}%</div>`;
    html += `<div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.3px;">Unpredictable</div>`;
    html += `</div>`;
    html += `</div>`;

    return html;
  }

  function updatePanel(results) {
    const probs = results.map(r => r.prob);
    const bits = computePasswordEntropy(probs);
    const info = entropyLabel(bits);
    const color = tierColor(info.tier);
    const gradient = tierGradient(info.tier);
    const crackTimes = formatCrackTime(bits);

    const icons = ["🔓","🔓","⚠️","🔒","🛡️","💎"];
    const elIcon = panelEl.querySelector("#el-icon");
    elIcon.textContent = icons[info.tier];
    elIcon.style.background = `rgba(${info.tier >= 3 ? "16,185,129" : info.tier >= 2 ? "245,158,11" : "239,68,68"},0.15)`;

    const elStrength = panelEl.querySelector("#el-strength");
    elStrength.textContent = info.label;
    elStrength.style.background = gradient;
    elStrength.style.webkitBackgroundClip = "text";
    elStrength.style.webkitTextFillColor = "transparent";

    const elBits = panelEl.querySelector("#el-bits");
    elBits.textContent = `${bits.toFixed(1)} bits · ${results.length} characters`;
    elBits.title = "Bits of entropy: higher = more unpredictable. Each bit doubles the search space. 40+ bits is strong.";

    const meter = panelEl.querySelector("#el-meter");
    meter.style.width = `${Math.min((bits / 100) * 100, 100)}%`;
    meter.style.background = gradient;

    const crackGrid = panelEl.querySelector("#el-crack");
    crackGrid.innerHTML = "";
    const crackLabels = {
      0: "A website login form — slowest attack",
      1: "A stolen password database cracked on a laptop",
      2: "A rig with 8 high-end GPUs running Hashcat",
      3: "A nation-state supercomputer cluster",
    };
    crackTimes.forEach((ct, i) => {
      const row = document.createElement("div");
      row.style.cssText = "background:rgba(255,255,255,0.03);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.04);cursor:help;";
      row.title = crackLabels[i];
      row.innerHTML = `<div style="font-size:9px;color:#475569;font-family:system-ui,-apple-system,sans-serif;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;" title="${crackLabels[i]}">${ct.name}</div><div style="font-size:13px;font-weight:700;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;">${ct.time}</div>`;
      crackGrid.appendChild(row);
    });

    const tilesDiv = panelEl.querySelector("#el-tiles");
    tilesDiv.innerHTML = "";
    results.forEach(r => {
      const tile = document.createElement("div");
      tile.style.cssText = `width:${TILE_WIDTH_PX}px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;font-size:9px;font-weight:600;transition:all 0.15s ease;cursor:help;`;
      tile.textContent = "\u2022";
      if (r.classification === "high") {
        tile.style.background = "rgba(239,68,68,0.25)";
        tile.style.border = "1px solid rgba(239,68,68,0.35)";
        tile.style.color = "rgba(252,165,165,0.9)";
        tile.title = `"${r.char}" — highly predictable (${(r.prob * 100).toFixed(1)}% chance, ${r.bits.toFixed(1)} bits)`;
      } else if (r.classification === "medium") {
        tile.style.background = "rgba(245,158,11,0.2)";
        tile.style.border = "1px solid rgba(245,158,11,0.3)";
        tile.style.color = "rgba(253,224,71,0.8)";
        tile.title = `"${r.char}" — somewhat common (${(r.prob * 100).toFixed(1)}% chance, ${r.bits.toFixed(1)} bits)`;
      } else {
        tile.style.background = "rgba(16,185,129,0.15)";
        tile.style.border = "1px solid rgba(16,185,129,0.25)";
        tile.style.color = "rgba(110,231,183,0.7)";
        tile.title = `"${r.char}" — unpredictable (${(r.prob * 100).toFixed(1)}% chance, ${r.bits.toFixed(1)} bits)`;
      }
      tilesDiv.appendChild(tile);
    });

    const explainDiv = panelEl.querySelector("#el-explain");
    explainDiv.innerHTML = buildExplanation(bits, results);
  }

  /* ── positioning ── */
  const parent = input.parentElement;
  if (parent) {
    if (window.getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    wrapper.appendChild(tilesEl);
    wrapper.appendChild(badgeEl);
    parent.appendChild(wrapper);
  }

  function reposition() {
    const rect = input.getBoundingClientRect();
    const parentEl = input.parentElement;
    if (!parentEl) return;
    const parentRect = parentEl.getBoundingClientRect();
    wrapper.style.left = `${rect.left - parentRect.left}px`;
    wrapper.style.top = `${rect.top - parentRect.top}px`;
    wrapper.style.width = `${rect.width}px`;
    wrapper.style.height = `${rect.height}px`;
    badgeEl.style.opacity = "1";
  }

  function render(results) {
    lastResults = results;
    tilesEl.innerHTML = "";

    const probs = results.map(r => r.prob);
    const bits = computePasswordEntropy(probs);
    const info = entropyLabel(bits);
    const color = tierColor(info.tier);

    results.forEach(r => {
      const tile = document.createElement("span");
      tile.style.cssText = `width:${TILE_WIDTH_PX}px;height:4px;border-radius:2px;transition:all 0.2s ease;display:inline-block;`;
      if (r.classification === "high") {
        tile.style.background = "rgba(239,68,68,0.6)";
        tile.style.boxShadow = "0 0 6px rgba(239,68,68,0.3)";
      } else if (r.classification === "medium") {
        tile.style.background = "rgba(245,158,11,0.5)";
        tile.style.boxShadow = "0 0 4px rgba(245,158,11,0.2)";
      } else {
        tile.style.background = "rgba(16,185,129,0.4)";
        tile.style.boxShadow = "0 0 3px rgba(16,185,129,0.15)";
      }
      tilesEl.appendChild(tile);
    });

    badgeEl.style.borderColor = `${color}55`;
    badgeEl.style.boxShadow = `0 0 12px ${color}22`;

    if (panelOpen) {
      updatePanel(results);
    }

    wrapper.style.opacity = "1";
  }

  function clear() {
    tilesEl.innerHTML = "";
    badgeEl.style.opacity = "0";
    wrapper.style.opacity = "0";
    if (panelOpen) closePanel();
  }

  function destroy() {
    if (panelEl) panelEl.remove();
    wrapper.remove();
  }

  reposition();
  new ResizeObserver(reposition).observe(parent || input);

  return { render, clear, reposition, destroy };
}

const PASSWORD_INPUTS = new Set();
const OVERLAYS = new Map();

function findPasswordInputs() {
  return document.querySelectorAll('input[type="password"]');
}

async function attachToInput(input) {
  if (PASSWORD_INPUTS.has(input)) return;
  PASSWORD_INPUTS.add(input);

  const overlay = initHeatmapOverlay(input);
  OVERLAYS.set(input, overlay);

  const m = await loadModel();
  if (!m) return;

  let lastAnalysisTime = 0;
  input.addEventListener("input", () => {
    const now = performance.now();
    if (now - lastAnalysisTime < 80) return;
    lastAnalysisTime = now;
    const value = input.value;
    if (!value) { overlay.clear(); return; }
    overlay.render(analyzePassword(m, value));
  });
}

function scanPage() { findPasswordInputs().forEach(attachToInput); }
function scanWithRetry(a) { scanPage(); if (a < 3) setTimeout(() => scanWithRetry(a + 1), 500 * (a + 1)); }
scanWithRetry(0);

const observer = new MutationObserver((mutations) => {
  let added = false;
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches && node.matches('input[type="password"]')) added = true;
        if (node.querySelectorAll && node.querySelectorAll('input[type="password"]').length > 0) added = true;
      }
    }
  }
  if (added) scanPage();
});
const target = document.body || document.documentElement;
if (target) observer.observe(target, { childList: true, subtree: true });
