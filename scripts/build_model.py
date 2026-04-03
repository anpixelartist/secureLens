#!/usr/bin/env python3
"""
build_model.py — Trigram frequency model builder for EntropyLens.

Reads rockyou.txt, counts trigrams, applies Laplace smoothing,
and outputs a compact nested JSON model.

Usage:
    python scripts/build_model.py [--input data/rockyou.txt] [--output data/trigrams.json]
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


PAD_CHAR = "\x00"
MIN_PASSWORD_LENGTH = 3
MIN_CONTEXT_THRESHOLD = 50
LAPLACE_ALPHA = 1.0
PROBABILITY_DECIMALS = 4


def count_trigrams(input_path: Path) -> dict:
    """Count all trigrams from the password corpus."""
    counts: dict = defaultdict(lambda: defaultdict(int))
    total_passwords = 0
    skipped = 0

    with open(input_path, "r", encoding="utf-8", errors="replace") as f:
        for line_num, line in enumerate(f, 1):
            password = line.rstrip("\n\r")
            total_passwords += 1

            if len(password) < MIN_PASSWORD_LENGTH:
                skipped += 1
                continue

            padded = PAD_CHAR * 2 + password

            for i in range(2, len(padded)):
                c0, c1, c2 = padded[i - 2], padded[i - 1], padded[i]
                counts[c0 + c1][c2] = counts[c0 + c1][c2] + 1

            if line_num % 1_000_000 == 0:
                print(f"  Processed {line_num:,} passwords...", file=sys.stderr)

    print(f"  Total passwords: {total_passwords:,}", file=sys.stderr)
    print(f"  Skipped (< {MIN_PASSWORD_LENGTH} chars): {skipped:,}", file=sys.stderr)
    print(f"  Unique contexts: {len(counts):,}", file=sys.stderr)

    return counts


def compute_probabilities(
    counts: dict, min_threshold: int = MIN_CONTEXT_THRESHOLD
) -> dict:
    """
    Convert raw counts to conditional probabilities with Laplace smoothing.

    Only includes contexts with total observations >= min_threshold.
    Only includes next-chars with probability above the pruning floor.
    """
    model = {}
    pruned_pairs = 0
    kept_pairs = 0

    for context, next_char_counts in counts.items():
        total = sum(next_char_counts.values())

        if total < min_threshold:
            continue

        unique_chars = len(next_char_counts)
        laplace_total = total + LAPLACE_ALPHA * unique_chars

        context_probs = {}
        for char, count in next_char_counts.items():
            prob = (count + LAPLACE_ALPHA) / laplace_total
            prob = round(prob, PROBABILITY_DECIMALS)
            if prob >= 0.001:
                context_probs[char] = prob
                kept_pairs += 1
            else:
                pruned_pairs += 1

        if context_probs:
            model[context] = context_probs

    print(f"  Kept context entries: {len(model):,}", file=sys.stderr)
    print(f"  Kept (context, char) pairs: {kept_pairs:,}", file=sys.stderr)
    print(f"  Pruned pairs (prob < 0.001): {pruned_pairs:,}", file=sys.stderr)

    return model


def main():
    parser = argparse.ArgumentParser(description="Build trigram model from password corpus")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/rockyou.txt"),
        help="Path to rockyou.txt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/trigrams.json"),
        help="Output path for the JSON model",
    )
    parser.add_argument(
        "--min-threshold",
        type=int,
        default=MIN_CONTEXT_THRESHOLD,
        help="Minimum context observation count",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        print("Place rockyou.txt in data/ or use --input to specify the path.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading corpus from {args.input}...", file=sys.stderr)
    counts = count_trigrams(args.input)

    print(f"Computing probabilities (Laplace alpha={LAPLACE_ALPHA})...", file=sys.stderr)
    model = compute_probabilities(counts, min_threshold=args.min_threshold)

    print(f"Writing model to {args.output}...", file=sys.stderr)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, separators=(",", ":"))

    import os
    size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"Done. Model size: {size_mb:.2f} MB", file=sys.stderr)

    # Spot-check known sequences
    print("\nSpot-check:", file=sys.stderr)
    checks = [("12", "3"), ("pa", "s"), ("qw", "e"), ("ab", "c")]
    for ctx, char in checks:
        prob = model.get(ctx, {}).get(char, "not found")
        print(f"  P('{char}' | '{ctx}') = {prob}", file=sys.stderr)


if __name__ == "__main__":
    main()
