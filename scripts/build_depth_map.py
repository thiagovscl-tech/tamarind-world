import argparse
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "public/artwork/world-layers.json"


def main():
    parser = argparse.ArgumentParser(description="Combina máscaras em um mapa de profundidade de 16 bits.")
    parser.add_argument("--output", help="Caminho de saída relativo ao projeto.")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    width = manifest["canvas"]["width"]
    height = manifest["canvas"]["height"]
    encoding = manifest["depthEncoding"]
    z_min = encoding["zMin"]
    z_max = encoding["zMax"]
    output = ROOT / args.output if args.output else ROOT / "public/artwork/depth/scene-depth-16.png"
    depth = Image.new("I;16", (width, height), 0)
    ready = 0
    pending = []

    for layer in sorted(manifest["layers"], key=lambda item: item["z"]):
        mask_path = ROOT / "public/artwork/masks" / f"{layer['id']}.png"
        if not mask_path.exists():
            pending.append(layer["id"])
            continue

        with Image.open(mask_path) as image:
            if image.size != (width, height):
                raise SystemExit(f"{layer['id']}: tamanho {image.size}; esperado {(width, height)}")
            alpha = image.getchannel("A") if "A" in image.getbands() else image.convert("L")
            if alpha.getbbox() is None:
                pending.append(layer["id"])
                continue
            value = round((layer["z"] - z_min) / (z_max - z_min) * 65535)
            plane = Image.new("I;16", (width, height), value)
            depth.paste(plane, (0, 0), alpha)
            ready += 1

    if ready == 0:
        raise SystemExit("Nenhuma máscara preenchida. Faça e exporte máscaras antes de gerar o depth map.")

    output.parent.mkdir(parents=True, exist_ok=True)
    depth.save(output, format="PNG")
    print(f"Depth map 16-bit criado: {output}")
    print(f"Camadas incluídas: {ready}/{len(manifest['layers'])}")
    print("Regra de sobreposição: o maior Z (mais próximo da câmera) prevalece.")
    if pending:
        print("Máscaras ainda pendentes: " + ", ".join(pending))


if __name__ == "__main__":
    main()
