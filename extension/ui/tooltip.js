const KNOWN_PATTERNS = {
  "123": { freq: "38%", suggestion: "Try inserting a symbol here to break the pattern." },
  "pas": { freq: "12%", suggestion: "Common prefix. Consider a less predictable start." },
  "qwe": { freq: "9%", suggestion: "Keyboard row pattern detected." },
  "abc": { freq: "7%", suggestion: "Alphabetical sequence — easy to guess." },
  "wor": { freq: "6%", suggestion: "Common word fragment." },
  "asd": { freq: "5%", suggestion: "Keyboard row pattern detected." },
  "zxc": { freq: "4%", suggestion: "Keyboard row pattern detected." },
  "000": { freq: "8%", suggestion: "Repetitive digits are highly predictable." },
  "111": { freq: "7%", suggestion: "Repetitive digits are highly predictable." },
  "999": { freq: "5%", suggestion: "Repetitive digits are highly predictable." },
  "tes": { freq: "4%", suggestion: "Common word fragment." },
  "lov": { freq: "4%", suggestion: "Common word fragment." },
  "god": { freq: "3%", suggestion: "Common word fragment." },
  "sun": { freq: "3%", suggestion: "Common word fragment." },
  "mon": { freq: "3%", suggestion: "Common word fragment." },
  "!!!": { freq: "6%", suggestion: "Trailing symbols alone don't add much entropy." },
  "123": { freq: "38%", suggestion: "Try inserting a symbol here to break the pattern." },
  "321": { freq: "11%", suggestion: "Reverse sequential digits are very common." },
  "69": { freq: "3%", suggestion: "Common number pair." },
  "666": { freq: "4%", suggestion: "Repetitive digits are highly predictable." },
  "12": { freq: "45%", suggestion: "Sequential digits — very predictable." },
  "23": { freq: "30%", suggestion: "Sequential digits — very predictable." },
  "34": { freq: "15%", suggestion: "Sequential digits — very predictable." },
  "45": { freq: "12%", suggestion: "Sequential digits — very predictable." },
  "56": { freq: "10%", suggestion: "Sequential digits — very predictable." },
  "78": { freq: "9%", suggestion: "Sequential digits — very predictable." },
  "89": { freq: "8%", suggestion: "Sequential digits — very predictable." },
  "90": { freq: "7%", suggestion: "Sequential digits — very predictable." },
};

export function initTooltip(container) {
  let tooltipEl = null;

  function createTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "el-tooltip";
    tooltipEl.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.92);
      color: #f8f9fa;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 280px;
      z-index: 10000;
      pointer-events: none;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: none;
    `;
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function show(event, result, password) {
    if (result.classification !== "high") return;

    const tip = createTooltip();
    const idx = result.index;
    const seq = password.slice(idx, idx + 3);
    const pattern = KNOWN_PATTERNS[seq];

    let message;
    if (pattern) {
      message = `The sequence "${seq}" appears in ${pattern.freq} of leaked passwords. ${pattern.suggestion}`;
    } else {
      const pct = (result.prob * 100).toFixed(1);
      message = `This transition has a ${pct}% probability — highly predictable.`;
    }

    tip.textContent = message;
    tip.style.display = "block";

    const rect = event.target.getBoundingClientRect();
    tip.style.left = `${rect.left}px`;
    tip.style.top = `${rect.bottom + 6}px`;
  }

  function hide() {
    if (tooltipEl) {
      tooltipEl.style.display = "none";
    }
  }

  return { show, hide };
}
