import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "public/artwork/world-layers.json"


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    source_size = (manifest["canvas"]["width"], manifest["canvas"]["height"])
    expected_size = (source_size[0], source_size[1] + 3)
    errors = []
    pending = []
    ready = 0

    for layer in manifest["layers"]:
        mask_path = ROOT / "public/artwork/masks" / f"{layer['id']}.png"
        if not mask_path.exists():
            pending.append(layer["id"])
            continue

        try:
            with Image.open(mask_path) as image:
                if image.size != expected_size:
                    errors.append(f"{layer['id']}: tamanho {image.size}, esperado {expected_size}")
                elif image.mode == "L":
                    if image.crop((0, source_size[1], expected_size[0], expected_size[1])).getbbox() is not None:
                        errors.append(f"{layer['id']}: padding inferior deve permanecer preto")
                    elif image.crop((0, 0, *source_size)).getbbox() is None:
                        errors.append(f"{layer['id']}: máscara vazia")
                    else:
                        ready += 1
                elif image.mode in ("RGBA", "LA"):
                    if image.mode == "LA":
                        gray, alpha = image.split()
                        signal = ImageChops.multiply(gray, alpha)
                    else:
                        red, green, blue, alpha = image.split()
                        if ImageChops.difference(red, green).getbbox() or ImageChops.difference(red, blue).getbbox():
                            errors.append(f"{layer['id']}: canais de cor divergem; esperado grayscale")
                            continue
                        signal = ImageChops.multiply(red, alpha)
                    if signal.getbbox() is None:
                        errors.append(f"{layer['id']}: máscara vazia")
                    else:
                        ready += 1
                else:
                    errors.append(f"{layer['id']}: esperado PNG grayscale; recebido {image.mode}")
        except Exception as error:
            errors.append(f"{layer['id']}: não foi possível ler ({error})")

    print(f"Máscaras prontas: {ready}/{len(manifest['layers'])}")
    if pending:
        print("Aguardando traçado: " + ", ".join(pending))
    if errors:
        print("Problemas encontrados:")
        for error in errors:
            print(f"- {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
