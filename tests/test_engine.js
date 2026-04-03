import { getProbability, classifyTransition } from "../extension/lib/trigram_engine.js";

const LAPLACE_FLOOR = 0.0001;

function mockModel() {
  return {
    "12": { "3": 0.71, "a": 0.02, "z": 0.005 },
    "pa": { "s": 0.38, "r": 0.04, "u": 0.015 },
    "\x00\x00": { "1": 0.09, "p": 0.07, "a": 0.05 },
  };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("\n=== trigram_engine.js tests ===\n");

const model = mockModel();

console.log("Known high-probability transitions:");
assert(getProbability(model, "12", "3") > 0.5, 'P("3"|"12") > 0.5');
assert(getProbability(model, "pa", "s") > 0.3, 'P("s"|"pa") > 0.3');

console.log("\nKnown low-probability transitions:");
assert(getProbability(model, "zq", "7") < 0.01, 'P("7"|"zq") < 0.01 (unseen context)');
assert(getProbability(model, "12", "z") < 0.01, 'P("z"|"12") < 0.01');

console.log("\nLaplace floor for unseen contexts:");
assert(getProbability(model, "xx", "y") === LAPLACE_FLOOR, "Unseen context returns LAPLACE_FLOOR");
assert(getProbability(model, "12", "q") === LAPLACE_FLOOR, "Unseen char in known context returns LAPLACE_FLOOR");

console.log("\nClassification thresholds:");
assert(classifyTransition(0.15) === "high", "0.15 → high");
assert(classifyTransition(0.10) === "medium", "0.10 → medium (boundary)");
assert(classifyTransition(0.05) === "medium", "0.05 → medium");
assert(classifyTransition(0.01) === "low", "0.01 → low (boundary)");
assert(classifyTransition(0.001) === "low", "0.001 → low");

console.log("\nProbability bounds:");
for (const [ctx, chars] of Object.entries(model)) {
  const totalProb = Object.values(chars).reduce((s, p) => s + p, 0);
  assert(totalProb <= 1.0, `Context "${ctx}" total prob = ${totalProb.toFixed(4)} ≤ 1.0`);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
