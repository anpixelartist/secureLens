import { computeEntropy, entropyLabel, entropyColor } from "../extension/lib/entropy_calc.js";

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

console.log("\n=== entropy_calc.js tests ===\n");

console.log("Uniform distribution (max entropy):");
const uniform = [0.25, 0.25, 0.25, 0.25];
const uniformEntropy = computeEntropy(uniform);
assert(Math.abs(uniformEntropy - 2.0) < 0.001, `Uniform 4-way = ${uniformEntropy.toFixed(4)} ≈ 2.0 bits`);

console.log("\nDeterministic (zero entropy):");
const deterministic = [1.0];
const detEntropy = computeEntropy(deterministic);
assert(Math.abs(detEntropy - 0.0) < 0.001, `Deterministic = ${detEntropy.toFixed(4)} ≈ 0.0 bits`);

console.log("\nSkewed distribution:");
const skewed = [0.9, 0.05, 0.03, 0.02];
const skewedEntropy = computeEntropy(skewed);
assert(skewedEntropy > 0 && skewedEntropy < 2.0, `Skewed = ${skewedEntropy.toFixed(4)} bits (0 < H < 2)`);

console.log("\nHighly predictable sequence (low entropy):");
const predictable = [0.71, 0.02, 0.005, 0.001, 0.001];
const predEntropy = computeEntropy(predictable);
assert(predEntropy < 1.5, `Predictable = ${predEntropy.toFixed(4)} bits (< 1.5)`);

console.log("\nEntropy labels:");
assert(entropyLabel(65) === "Very Strong", "65 bits → Very Strong");
assert(entropyLabel(50) === "Strong", "50 bits → Strong");
assert(entropyLabel(30) === "Moderate", "30 bits → Moderate");
assert(entropyLabel(10) === "Weak", "10 bits → Weak");

console.log("\nEntropy colors:");
assert(entropyColor(65) === "#198754", "65 bits → green");
assert(entropyColor(50) === "#20c997", "50 bits → teal");
assert(entropyColor(30) === "#ffc107", "30 bits → yellow");
assert(entropyColor(10) === "#dc3545", "10 bits → red");

console.log("\nGuard against log(0):");
const withZero = [0.5, 0.5, 0.0];
const zeroEntropy = computeEntropy(withZero);
assert(!isNaN(zeroEntropy) && isFinite(zeroEntropy), `Zero prob handled: ${zeroEntropy.toFixed(4)} (finite)`);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
