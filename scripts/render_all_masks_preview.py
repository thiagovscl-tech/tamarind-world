"""Render a color-coded composite of all independent visible-region masks."""

from pathlib import Path
import argparse

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/artwork/source/layoutTamarind.png"
MASKS = ROOT / "public/artwork/masks"
OUTPUT = ROOT / "public/artwork/previews/all-masks-overlay.png"
LAYERS = [
    ("sky", (64, 180, 255)),
    ("sun", (255, 211, 55)),
    ("far-mountains", (104, 110, 230)),
    ("mid-mountains", (30, 210, 190)),
    ("castle", (255, 133, 40)),
    ("waterfalls", (100, 235, 255)),
    ("bridge", (248, 92, 178)),
    ("technomage", (255, 63, 55)),
    ("guardian", (185, 93, 255)),
    ("explorer", (255, 155, 50)),
    ("bear", (120, 232, 70)),
    ("foreground", (235, 235, 235)),
]
CRITICAL = {"technomage", "guardian", "explorer", "bear", "castle", "bridge", "waterfalls"}


def main():
    parser = argparse.ArgumentParser(description="Render a color-coded composite of mask layers.")
    parser.add_argument("--critical", action="store_true", help="Render only the seven critical layers.")
    args = parser.parse_args()
    source = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.float32)
    height, width = source.shape[:2]
    total = np.zeros((height, width, 3), dtype=np.float32)
    weights = np.zeros((height, width, 1), dtype=np.float32)
    membership = np.zeros((height, width), dtype=np.uint8)
    missing = []

    layers = [entry for entry in LAYERS if not args.critical or entry[0] in CRITICAL]
    output_path = OUTPUT.with_name("critical-masks-overlay.png") if args.critical else OUTPUT
    for name, color in layers:
        path = MASKS / f"{name}.png"
        if not path.exists():
            missing.append(name)
            continue
        mask = np.asarray(Image.open(path).convert("L"), dtype=np.float32) / 255.0
        if mask.shape != (height + 3, width):
            raise SystemExit(f"Dimensão incorreta em {path.name}: {mask.shape[::-1]}; esperado {(width, height + 3)}")
        mask = mask[:height, :]
        membership += (mask >= 128).astype(np.uint8)
        alpha = (mask * 0.54)[..., None]
        total += np.asarray(color, dtype=np.float32) * alpha
        weights += alpha

    # Average colors at overlaps so each mask remains visible in the composite.
    color_overlay = total / np.maximum(weights, 1e-6)
    alpha = np.clip(weights, 0, 0.75)
    composite = source * (1 - alpha) + color_overlay * alpha
    overlaps = membership > 1
    overlap_color = np.array((255, 245, 110), dtype=np.float32)
    composite[overlaps] = composite[overlaps] * 0.38 + overlap_color * 0.62
    output = Image.fromarray(np.clip(composite, 0, 255).astype(np.uint8))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path, optimize=True)

    overlap = membership > 1
    print(f"Preview: {output_path}")
    print(f"Tamanho: {width} x {height}; pixels cobertos por múltiplas máscaras: {int(overlap.sum())}")
    if missing:
        print("Máscaras ausentes: " + ", ".join(missing))


if __name__ == "__main__":
    main()
