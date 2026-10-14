"""Build low-poly extrusion outlines from the existing grayscale masks."""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MASKS = ROOT / "public/artwork/masks"
OUTPUT = ROOT / "public/artwork/geometry/spatial-volumes.json"
SOURCE_SIZE = (1672, 941)
VOLUMES = {
    "castle": {"epsilon": 2.2, "minArea": 28, "thickness": 0.38},
    "bridge": {"epsilon": 1.5, "minArea": 18, "thickness": 0.28},
    "foreground": {"epsilon": 12.0, "minArea": 700, "thickness": 0.2},
}


def signed_area(points):
    return sum(
        points[index][0] * points[(index + 1) % len(points)][1]
        - points[(index + 1) % len(points)][0] * points[index][1]
        for index in range(len(points))
    ) / 2


def main():
    output = {"sourceSize": list(SOURCE_SIZE), "volumes": {}}
    for name, settings in VOLUMES.items():
        path = MASKS / f"{name}.png"
        with Image.open(path) as image:
            if image.mode != "L" or image.size != (SOURCE_SIZE[0], SOURCE_SIZE[1] + 3):
                raise SystemExit(f"Máscara incompatível: {path.name} ({image.mode}, {image.size})")
            mask = np.asarray(image.crop((0, 0, *SOURCE_SIZE)), dtype=np.uint8)
        binary = np.where(mask >= 128, 255, 0).astype(np.uint8)
        contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is None:
            raise SystemExit(f"Máscara sem contornos: {name}")
        hierarchy = hierarchy[0]
        simplified = []
        for index, contour in enumerate(contours):
            if hierarchy[index][3] != -1 or abs(cv2.contourArea(contour)) < settings["minArea"]:
                continue
            outer = cv2.approxPolyDP(contour, settings["epsilon"], True).reshape(-1, 2)
            outer_points = [[int(x), int(y)] for x, y in outer]
            holes = []
            child = hierarchy[index][2]
            while child != -1:
                hole_contour = contours[child]
                if abs(cv2.contourArea(hole_contour)) >= settings["minArea"]:
                    hole = cv2.approxPolyDP(hole_contour, settings["epsilon"], True).reshape(-1, 2)
                    holes.append([[int(x), int(y)] for x, y in hole])
                child = hierarchy[child][0]
            simplified.append({"outer": outer_points, "holes": holes})

        if not simplified:
            raise SystemExit(f"Contornos simplificados vazios: {name}")
        output["volumes"][name] = {**settings, "shapes": simplified}
        vertex_count = sum(len(shape["outer"]) + sum(len(hole) for hole in shape["holes"]) for shape in simplified)
        print(f"{name}: {len(simplified)} volumes, {vertex_count} contorno vertices")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
    print(f"Salvo: {OUTPUT}")


if __name__ == "__main__":
    main()
