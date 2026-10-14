from pathlib import Path

from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MASK_DIR = ROOT / "public/artwork/masks"


def main():
    converted = 0
    for path in sorted(MASK_DIR.glob("*.png")):
        with Image.open(path) as source:
            if source.mode == "L":
                continue
            rgba = source.convert("RGBA")
            gray = ImageOps.grayscale(rgba)
            gray = ImageChops.multiply(gray, rgba.getchannel("A"))
        temp = path.with_name(f"{path.stem}.normalized.tmp.png")
        gray.save(temp, format="PNG", optimize=True)
        temp.replace(path)
        converted += 1
    print(f"PNG grayscale normalizados: {converted}")


if __name__ == "__main__":
    main()
