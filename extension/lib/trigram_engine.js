const LAPLACE_FLOOR = 0.0001;

export function getProbability(model, context, char) {
  const ctx = model[context];
  if (!ctx) return LAPLACE_FLOOR;
  return ctx[char] ?? LAPLACE_FLOOR;
}

export function classifyTransition(prob) {
  if (prob > 0.10) return "high";
  if (prob > 0.01) return "medium";
  return "low";
}
