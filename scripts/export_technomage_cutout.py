"""Export the technomage from the source artwork using its reviewed mask."""

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/artwork/source/layoutTamarind.png"
MASK = ROOT / "public/artwork/masks/technomage.png"
OUTPUT = ROOT / "public/artwork/cutouts/tecnomago.png"


def main():
    with Image.open(SOURCE) as source_image:
        source = source_image.convert("RGBA")
        width, height = source.size

    with Image.open(MASK) as mask_image:
        if mask_image.mode != "L":
            raise SystemExit(f"A máscara precisa estar em grayscale L, recebida: {mask_image.mode}")
        if mask_image.size != (width, height + 3):
            raise SystemExit(
                f"A máscara precisa medir {(width, height + 3)}, recebida: {mask_image.size}"
            )
        alpha = mask_image.crop((0, 0, width, height))

    if alpha.getbbox() is None:
        raise SystemExit("A máscara do Tecnomago está vazia.")

    rgba = source.copy()
    source_alpha = source.getchannel("A")
    rgba.putalpha(ImageChops.multiply(source_alpha, alpha))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(OUTPUT, format="PNG", optimize=True)

    print(f"Recorte RGBA salvo: {OUTPUT}")
    print(f"Resolução: {width}x{height}")


if __name__ == "__main__":
    main()
