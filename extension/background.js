import { getProbability, classifyTransition } from "./lib/trigram_engine.js";

let model = null;
let modelPromise = null;

async function loadModel() {
  if (model) return model;
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    const url = chrome.runtime.getURL("data/trigrams.json.gz");
    const response = await fetch(url);
    const ds = new DecompressionStream("gzip");
    const decompressed = response.body.pipeThrough(ds);
    const text = await new Response(decompressed).text();
    model = JSON.parse(text);
    console.log(`[EntropyLens] Model loaded: ${Object.keys(model).length} contexts`);
    return model;
  })();

  return modelPromise;
}

loadModel();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ANALYZE_CHAR") {
    if (!model) {
      sendResponse({ error: "model_loading" });
      return true;
    }
    const prob = getProbability(model, msg.context, msg.char);
    const classification = classifyTransition(prob);
    sendResponse({ prob, classification });
    return true;
  }

  if (msg.type === "ANALYZE_PASSWORD") {
    (async () => {
      const m = await loadModel();
      const results = [];
      const padded = "\x00\x00" + msg.password;
      for (let i = 2; i < padded.length; i++) {
        const c0 = padded[i - 2];
        const c1 = padded[i - 1];
        const c2 = padded[i];
        const prob = getProbability(m, c0 + c1, c2);
        results.push({
          index: i - 2,
          char: c2,
          prob,
          classification: classifyTransition(prob),
        });
      }
      sendResponse({ results });
    })();
    return true;
  }

  if (msg.type === "MODEL_STATUS") {
    sendResponse({ loaded: model !== null });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[EntropyLens] Extension installed/updated");
});
