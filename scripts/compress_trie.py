#!/usr/bin/env python3
"""
compress_trie.py — Compress trigrams.json for Chrome extension distribution.

Reads trigrams.json, applies final pruning, and outputs a gzip-compressed
version optimized for fast browser-side decompression.

Usage:
    python scripts/compress_trie.py [--input data/trigrams.json] [--output extension/data/trigrams.json.gz]
"""

import argparse
import gzip
import json
import os
import sys
from pathlib import Path


MIN_PROB = 0.001
PROBABILITY_DECIMALS = 4


def compress_model(input_path: Path, output_path: Path) -> None:
    """Load JSON, prune, and write gzip-compressed output."""
    print(f"Reading model from {input_path}...", file=sys.stderr)
    with open(input_path, "r", encoding="utf-8") as f:
        model = json.load(f)

    original_size = os.path.getsize(input_path) / (1024 * 1024)
    print(f"  Original size: {original_size:.2f} MB", file=sys.stderr)
    print(f"  Contexts before pruning: {len(model):,}", file=sys.stderr)

    # Final pruning pass: round and drop sub-floor probabilities
    pruned_contexts = 0
    pruned_chars = 0

    compact_model = {}
    for context, next_chars in model.items():
        compact_chars = {}
        for char, prob in next_chars.items():
            rounded = round(float(prob), PROBABILITY_DECIMALS)
            if rounded >= MIN_PROB:
                compact_chars[char] = rounded
            else:
                pruned_chars += 1

        if compact_chars:
            compact_model[context] = compact_chars
        else:
            pruned_contexts += 1

    print(f"  Pruned contexts (empty after filtering): {pruned_contexts:,}", file=sys.stderr)
    print(f"  Pruned (context, char) pairs: {pruned_chars:,}", file=sys.stderr)
    print(f"  Final contexts: {len(compact_model):,}", file=sys.stderr)

    # Serialize to compact JSON (no whitespace)
    json_bytes = json.dumps(compact_model, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_size_mb = len(json_bytes) / (1024 * 1024)
    print(f"  JSON size (uncompressed): {json_size_mb:.2f} MB", file=sys.stderr)

    # Gzip compress
    compressed = gzip.compress(json_bytes, compresslevel=9)
    compressed_size_mb = len(compressed) / (1024 * 1024)
    print(f"  Gzip size: {compressed_size_mb:.2f} MB", file=sys.stderr)
    print(f"  Compression ratio: {original_size / compressed_size_mb:.1f}x", file=sys.stderr)

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(compressed)

    print(f"  Written to {output_path}", file=sys.stderr)

    if compressed_size_mb > 1.8:
        print(f"\nWARNING: Compressed model exceeds 1.8MB ({compressed_size_mb:.2f} MB)", file=sys.stderr)
        print("Consider increasing MIN_PROB or MIN_CONTEXT_THRESHOLD in build_model.py", file=sys.stderr)


def verify_roundtrip(gz_path: Path) -> None:
    """Verify the gzip file can be decompressed and parsed as valid JSON."""
    print(f"\nVerifying round-trip for {gz_path}...", file=sys.stderr)
    with open(gz_path, "rb") as f:
        compressed = f.read()

    decompressed = gzip.decompress(compressed)
    model = json.loads(decompressed)
    print(f"  Decompressed successfully: {len(model):,} contexts", file=sys.stderr)

    # Spot-check
    checks = [("12", "3"), ("pa", "s")]
    for ctx, char in checks:
        if ctx in model and char in model[ctx]:
            print(f"  P('{char}' | '{ctx}') = {model[ctx][char]}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Compress trigram model for Chrome extension")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/trigrams.json"),
        help="Path to trigrams.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("extension/data/trigrams.json.gz"),
        help="Output path for compressed model",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip round-trip verification",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        print("Run build_model.py first to generate trigrams.json", file=sys.stderr)
        sys.exit(1)

    compress_model(args.input, args.output)

    if not args.no_verify:
        verify_roundtrip(args.output)


if __name__ == "__main__":
    main()
