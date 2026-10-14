"""Build a manual pixel-clone test plate for the technomage only."""

from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/artwork/source/layoutTamarind.png"
MASK = ROOT / "public/artwork/masks/technomage.png"
OUTPUT = ROOT / "public/artwork/cleanplates/tecnomago-clean.png"
SIZE = (1672, 941)


def mirrored_band(position, width):
    period = 2 * (width - 1)
    offset = position % period
    return offset if offset < width else period - offset


def main():
    with Image.open(SOURCE) as image:
        if image.size != SIZE:
            raise SystemExit(f"Arte original com resolução inesperada: {image.size}")
        source = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    with Image.open(MASK) as image:
        if image.mode != "L" or image.size != (1672, 944):
            raise SystemExit(f"Máscara incompatível: {image.mode}, {image.size}")
        alpha = np.asarray(image.crop((0, 0, *SIZE)), dtype=np.uint8)

    yy, xx = np.indices(SIZE[::-1])
    donor_x = xx.copy()
    donor_y = yy.copy()

    torso = (xx >= 78) & (xx < 246) & (yy >= 477) & (yy <= 630)
    early_torso = torso & (yy < 485)
    later_torso = torso & ~early_torso
    donor_x[early_torso] = np.where(
        ((xx[early_torso] - 78) % 118) < 60,
        (xx[early_torso] - 78) % 118,
        118 - ((xx[early_torso] - 78) % 118),
    )
    donor_x[later_torso] = np.where(
        ((xx[later_torso] - 78) % 154) < 78,
        (xx[later_torso] - 78) % 154,
        154 - ((xx[later_torso] - 78) % 154),
    )

    lower_torso = (xx >= 78) & (xx < 246) & (yy > 630) & (yy <= 691)
    donor_y[lower_torso] = 2 * 691 - yy[lower_torso]

    staff = (xx >= 237) & (xx < 306) & (yy >= 377) & (yy <= 626)
    staff_phase = (xx[staff] - 237) % 118
    donor_x[staff] = np.where(staff_phase < 60, staff_phase, 118 - staff_phase)

    donor = source[donor_y, donor_x]
    mix = alpha[:, :, None].astype(np.float32) / 255
    result = np.rint(source.astype(np.float32) * (1 - mix) + donor.astype(np.float32) * mix)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.clip(result, 0, 255).astype(np.uint8), "RGBA").save(OUTPUT)
    print(f"Clean plate salvo: {OUTPUT} ({SIZE[0]}x{SIZE[1]})")
    print(f"Pixels de máscara usados: {int(np.count_nonzero(alpha))}")


if __name__ == "__main__":
    main()
