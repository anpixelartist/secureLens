function computeEntropy(probs) {
  return -probs.reduce((sum, p) => {
    const clamped = Math.max(p, 1e-10);
    return sum + clamped * Math.log2(clamped);
  }, 0);
}

function entropyLabel(bits) {
  if (bits >= 60) return "Very Strong";
  if (bits >= 40) return "Strong";
  if (bits >= 20) return "Moderate";
  return "Weak";
}

function entropyColor(bits) {
  if (bits >= 60) return "#198754";
  if (bits >= 40) return "#20c997";
  if (bits >= 20) return "#ffc107";
  return "#dc3545";
}

const overlayToggle = document.getElementById("overlayToggle");
const sensitivity = document.getElementById("sensitivity");
const meterFill = document.getElementById("meterFill");
const entropyReadout = document.getElementById("entropyReadout");
const modelStatus = document.getElementById("modelStatus");

chrome.storage.sync.get(["overlayEnabled", "sensitivity"], (result) => {
  if (result.overlayEnabled === false) {
    overlayToggle.classList.remove("active");
  }
  if (result.sensitivity) {
    sensitivity.value = result.sensitivity;
  }
});

overlayToggle.addEventListener("click", () => {
  const enabled = overlayToggle.classList.toggle("active");
  chrome.storage.sync.set({ overlayEnabled: enabled });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_OVERLAY", enabled });
    }
  });
});

sensitivity.addEventListener("change", () => {
  chrome.storage.sync.set({ sensitivity: sensitivity.value });
});

chrome.runtime.sendMessage({ type: "MODEL_STATUS" }, (response) => {
  if (response && response.loaded) {
    modelStatus.textContent = "Model loaded";
    modelStatus.style.color = "#198754";
  } else {
    modelStatus.textContent = "Model loading...";
    modelStatus.style.color = "#ffc107";
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ENTROPY_UPDATE") {
    const bits = computeEntropy(msg.probs);
    const pct = Math.min((bits / 80) * 100, 100);
    meterFill.style.width = `${pct}%`;
    meterFill.style.background = entropyColor(bits);
    entropyReadout.textContent = `${msg.charCount} characters, ${bits.toFixed(1)} bits — ${entropyLabel(bits)}`;
    entropyReadout.style.color = entropyColor(bits);
  }
});
