export function computeEntropy(probs) {
  return -probs.reduce((sum, p) => {
    const clamped = Math.max(p, 1e-10);
    return sum + clamped * Math.log2(clamped);
  }, 0);
}

export function entropyLabel(bits) {
  if (bits >= 60) return "Very Strong";
  if (bits >= 40) return "Strong";
  if (bits >= 20) return "Moderate";
  return "Weak";
}

export function entropyColor(bits) {
  if (bits >= 60) return "#198754";
  if (bits >= 40) return "#20c997";
  if (bits >= 20) return "#ffc107";
  return "#dc3545";
}
