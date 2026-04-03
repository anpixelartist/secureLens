import { initTooltip } from "./tooltip.js";

const TILE_WIDTH_PX = 14;

export function initHeatmapOverlay(input) {
  const container = document.createElement("div");
  container.className = "entropy-overlay";
  container.style.position = "absolute";
  container.style.pointerEvents = "none";
  container.style.display = "flex";
  container.style.gap = "1px";
  container.style.zIndex = "9999";
  container.style.borderRadius = "4px";
  container.style.overflow = "hidden";
  container.style.opacity = "0";
  container.style.transition = "opacity 0.15s ease";

  input.style.position = input.style.position || "relative";
  input.parentElement.style.position = input.parentElement.style.position || "relative";
  input.parentElement.appendChild(container);

  reposition(input, container);

  const tooltip = initTooltip(container);

  function reposition(inputEl, containerEl) {
    const rect = inputEl.getBoundingClientRect();
    const parentRect = inputEl.parentElement.getBoundingClientRect();
    containerEl.style.left = `${rect.left - parentRect.left}px`;
    containerEl.style.top = `${rect.top - parentRect.top}px`;
    containerEl.style.width = `${rect.width}px`;
    containerEl.style.height = `${rect.height}px`;
  }

  function render(results) {
    container.innerHTML = "";

    const classifications = results.map((r) => r.classification);

    for (let i = 0; i < results.length; i++) {
      const tile = document.createElement("span");
      tile.className = `el-tile el-tile--${results[i].classification}`;
      tile.dataset.index = results[i].index;
      tile.dataset.prob = results[i].prob;
      tile.style.width = `${TILE_WIDTH_PX}px`;
      tile.style.height = "100%";
      tile.style.display = "inline-block";
      tile.textContent = "\u2022";

      tile.addEventListener("mouseenter", (e) => {
        tooltip.show(e, results[i], input.value);
      });
      tile.addEventListener("mouseleave", () => {
        tooltip.hide();
      });

      container.appendChild(tile);
    }

    container.style.opacity = "1";
  }

  function clear() {
    container.innerHTML = "";
    container.style.opacity = "0";
  }

  function destroy() {
    container.remove();
  }

  return { render, clear, reposition: () => reposition(input, container), destroy };
}
