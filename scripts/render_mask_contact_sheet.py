import argparse
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
NAMES = [
    "sky", "sun", "far-mountains", "mid-mountains", "castle", "waterfalls",
    "bridge", "technomage", "guardian", "explorer", "bear", "foreground",
]


def main():
    parser = argparse.ArgumentParser(description="Gera uma folha de revisão das máscaras sobre a arte fonte.")
    parser.add_argument("--output", default=str(ROOT.parent.parent / "work/mask-review.png"))
    args = parser.parse_args()

    source = Image.open(ROOT / "public/artwork/source/layoutTamarind.png").convert("RGB")
    tile_size = (560, 315)
    source = source.resize(tile_size, Image.Resampling.LANCZOS)
    title_height = 26
    sheet = Image.new("RGB", (tile_size[0] * 3, (tile_size[1] + title_height) * 4), (20, 24, 31))
    draw = ImageDraw.Draw(sheet)

    for index, name in enumerate(NAMES):
        mask_path = ROOT / "public/artwork/masks" / f"{name}.png"
        if not mask_path.exists():
            continue
        x = (index % 3) * tile_size[0]
        y = (index // 3) * (tile_size[1] + title_height)
        mask = Image.open(mask_path).convert("L").resize(tile_size, Image.Resampling.LANCZOS)
        red = Image.new("RGB", tile_size, (255, 55, 45))
        overlay = Image.blend(source, red, 0.48)
        sheet.paste(Image.composite(overlay, source, mask), (x, y + title_height))
        draw.text((x + 8, y + 5), name, fill=(255, 255, 255))

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    print(output)


if __name__ == "__main__":
    main()
