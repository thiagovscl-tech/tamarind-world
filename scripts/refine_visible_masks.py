"""Apply conservative, manually defined cleanup to existing visible masks.

This script does not inspect image color or infer regions. The exclusion boxes
below are hand-entered rectangles around embedded label plates seen in the
reference. Three black rows are appended to satisfy the requested export size
without scaling or altering the 1672 x 941 source-aligned area.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
MASK_DIR = ROOT / "public/artwork/masks"
SOURCE_SIZE = (1672, 941)
OUTPUT_SIZE = (1672, 944)

# Bounds follow the visible parchment labels in layoutTamarind.png.
LABEL_CUTS = {
    "technomage": [(61, 418, 223, 484)],
    "guardian": [(443, 309, 603, 373)],
    "explorer": [(885, 470, 1107, 534)],
    "bear": [(885, 470, 1107, 534)],
    "waterfalls": [(885, 470, 1107, 534)],
    "far-mountains": [(61, 418, 223, 484), (443, 309, 603, 373), (885, 470, 1107, 534)],
    "mid-mountains": [(61, 418, 223, 484), (443, 309, 603, 373), (885, 470, 1107, 534)],
    "foreground": [(61, 418, 223, 484), (443, 309, 603, 373), (885, 470, 1107, 534)],
}

SCALE = 3

# Hand-traced visible silhouettes in source pixel coordinates. These are
# intentionally simple cutouts; no hidden contour is extended behind occluders.
CHARACTER_SHAPES = {
    "technomage": [
        [(168, 477), (190, 481), (212, 490), (228, 505), (239, 520), (222, 527), (206, 534), (194, 547), (174, 554), (153, 553), (131, 549), (108, 552), (88, 545), (111, 536), (126, 526), (111, 494), (123, 491), (146, 502)],
        [(194, 543), (213, 549), (225, 565), (234, 590), (246, 613), (241, 633), (227, 648), (222, 681), (209, 691), (83, 691), (78, 683), (88, 664), (95, 638), (100, 612), (111, 591), (129, 572), (148, 558), (171, 551)],
        [(264, 377), (281, 382), (296, 396), (306, 416), (301, 438), (291, 458), (279, 474), (274, 493), (273, 548), (266, 567), (259, 562), (256, 535), (259, 506), (255, 484), (246, 474), (237, 457), (239, 435), (245, 411), (252, 390)],
        [(263, 466), (273, 470), (274, 506), (270, 548), (265, 586), (259, 616), (250, 626), (246, 618), (250, 581), (253, 542), (253, 504)],
    ],
    "guardian": [[
        (391, 341), (407, 342), (421, 350), (432, 364), (438, 379),
        (451, 385), (463, 399), (466, 414), (459, 427), (468, 439),
        (477, 462), (481, 485), (476, 511), (469, 535), (470, 559),
        (478, 591), (478, 615), (468, 649), (458, 683), (451, 707),
        (429, 710), (418, 695), (411, 666), (405, 645), (394, 638),
        (381, 644), (364, 642), (346, 636), (327, 626), (309, 621),
        (286, 625), (260, 620), (282, 603), (302, 581), (318, 560),
        (329, 538), (337, 515), (339, 492), (330, 475), (323, 458),
        (328, 440), (342, 423), (352, 403), (359, 381), (373, 359),
    ]],
    "explorer": [[
        (626, 344), (642, 346), (659, 354), (675, 364), (688, 378),
        (694, 396), (701, 414), (712, 430), (719, 451), (714, 468),
        (719, 489), (730, 514), (732, 531), (719, 545), (716, 565),
        (721, 589), (729, 611), (723, 635), (733, 663), (739, 686),
        (728, 706), (705, 716), (683, 712), (674, 699), (668, 676),
        (653, 665), (640, 670), (627, 692), (617, 713), (595, 713),
        (581, 701), (579, 682), (590, 657), (602, 632), (606, 607),
        (598, 588), (584, 605), (568, 632), (553, 665), (542, 683),
        (523, 677), (500, 661), (481, 647), (476, 633), (491, 616),
        (514, 595), (533, 572), (548, 548), (556, 523), (551, 499),
        (557, 475), (564, 451), (570, 426), (584, 406), (590, 385),
        (604, 363),
    ], [
        (599, 374), (607, 375), (612, 389), (623, 396), (622, 406),
        (611, 408), (609, 427), (601, 444), (593, 464), (586, 484),
        (576, 505), (564, 521), (554, 519), (552, 509), (559, 488),
        (565, 469), (574, 447), (580, 427), (584, 405), (592, 391),
    ]],
    "bear": [[
        (763, 529), (775, 510), (791, 496), (804, 480), (817, 473),
        (826, 483), (841, 480), (858, 486), (871, 497), (886, 501),
        (902, 511), (906, 527), (898, 540), (886, 553), (880, 570),
        (886, 590), (889, 610), (888, 635), (892, 660), (887, 684),
        (875, 702), (855, 709), (840, 699), (833, 680), (824, 660),
        (818, 682), (809, 701), (789, 710), (768, 701), (757, 682),
        (741, 670), (730, 650), (724, 628), (727, 605), (736, 584),
        (741, 560), (751, 542),
    ]],
}

CASTLE_SHAPES = [[
    (752, 350), (757, 336), (761, 322), (770, 317), (772, 291),
    (779, 282), (788, 284), (796, 308), (803, 319), (810, 293),
    (817, 285), (824, 292), (829, 326), (837, 331), (840, 310),
    (847, 296), (851, 273), (857, 263), (864, 279), (869, 293),
    (876, 295), (881, 270), (887, 251), (893, 247), (900, 259),
    (904, 244), (911, 240), (918, 248), (923, 277), (930, 285),
    (936, 278), (942, 230), (948, 218), (954, 224), (959, 269),
    (967, 278), (972, 263), (976, 236), (982, 226), (989, 230),
    (995, 267), (1002, 278), (1007, 250), (1011, 207), (1017, 192),
    (1024, 198), (1030, 267), (1037, 280), (1043, 260), (1049, 237),
    (1056, 225), (1063, 234), (1068, 272), (1075, 282), (1082, 254),
    (1088, 241), (1096, 240), (1103, 252), (1110, 279), (1117, 284),
    (1122, 258), (1128, 244), (1135, 243), (1142, 266), (1148, 301),
    (1155, 326), (1161, 337), (1153, 346), (1125, 346), (1095, 342),
    (1065, 348), (1035, 344), (1005, 349), (976, 341), (949, 347),
    (925, 341), (900, 348), (878, 340), (854, 349), (832, 342),
    (810, 352), (790, 345), (770, 352),
], [
    (968, 307), (971, 269), (976, 235), (978, 202), (981, 169),
    (984, 144), (988, 133), (993, 148), (997, 181), (1000, 218),
    (1005, 264), (1010, 307),
], [
    (1029, 302), (1031, 263), (1033, 223), (1037, 186), (1041, 157),
    (1046, 151), (1051, 170), (1053, 207), (1057, 249), (1061, 302),
], [
    (1088, 307), (1091, 270), (1096, 235), (1101, 207), (1106, 185),
    (1112, 194), (1117, 226), (1120, 266), (1126, 309),
]]

WATERFALL_SHAPES = [
    [(958, 375), (977, 376), (1000, 378), (1008, 397), (1001, 415),
     (1005, 436), (998, 452), (1001, 472), (993, 491), (997, 509),
     (987, 530), (978, 548), (974, 527), (979, 504), (970, 484),
     (975, 463), (965, 444), (970, 425), (959, 407)],
    [(1543, 394), (1560, 396), (1581, 399), (1600, 402), (1606, 418),
     (1598, 436), (1603, 454), (1595, 471), (1600, 491), (1592, 510),
     (1593, 526), (1584, 539), (1578, 519), (1583, 499), (1574, 479),
     (1578, 459), (1568, 442), (1572, 425), (1552, 418)],
    [(1364, 586), (1382, 589), (1404, 592), (1416, 600), (1410, 617),
     (1417, 635), (1407, 651), (1411, 666), (1398, 686), (1388, 704),
     (1382, 685), (1387, 666), (1377, 649), (1383, 631), (1371, 614)],
]


def arch_bridge(deck, openings):
    left, top, right, deck_bottom, bottom = deck
    polygon = [(left, top), (right, top + 2), (right, bottom), (left, bottom)]
    holes = []
    for center, half_width in openings:
        arch = [(center - half_width, bottom), (center - half_width, deck_bottom + 17)]
        for step in range(13):
            t = step / 12
            x = center - half_width + 2 * half_width * t
            y = deck_bottom + 4 + 13 * (2 * t - 1) ** 2
            arch.append((round(x), round(y)))
        arch.extend([(center + half_width, bottom), (center - half_width, bottom)])
        holes.append(arch)
    return polygon, holes


BRIDGE_PARTS = [
    arch_bridge((1172, 370, 1520, 396, 432), [(1262, 25), (1330, 25), (1398, 25), (1466, 25)]),
    arch_bridge((820, 568, 1160, 589, 621), [(858, 24), (920, 24), (982, 24), (1044, 24), (1106, 24)]),
    arch_bridge((1067, 628, 1429, 650, 688), [(1110, 25), (1180, 25), (1250, 25), (1320, 25), (1390, 25)]),
]


def rasterize(polygons, holes=()):
    image = Image.new("L", (SOURCE_SIZE[0] * SCALE, SOURCE_SIZE[1] * SCALE), 0)
    draw = ImageDraw.Draw(image)
    for polygon in polygons:
        draw.polygon([(round(x * SCALE), round(y * SCALE)) for x, y in polygon], fill=255)
    for polygon in holes:
        draw.polygon([(round(x * SCALE), round(y * SCALE)) for x, y in polygon], fill=0)
    return image.resize(SOURCE_SIZE, Image.Resampling.LANCZOS)


def main():
    refined = []
    for path in sorted(MASK_DIR.glob("*.png")):
        with Image.open(path) as opened:
            if opened.size == OUTPUT_SIZE and opened.mode == "L":
                if opened.crop((0, SOURCE_SIZE[1], OUTPUT_SIZE[0], OUTPUT_SIZE[1])).getbbox() is not None:
                    raise SystemExit(f"Padding inferior não está vazio em {path.name}")
                mask = opened.crop((0, 0, *SOURCE_SIZE)).copy()
            elif opened.size == SOURCE_SIZE:
                mask = opened.convert("L")
            else:
                raise SystemExit(f"Dimensão anterior inesperada em {path.name}: {opened.size}")

        if path.stem in CHARACTER_SHAPES:
            mask = rasterize(CHARACTER_SHAPES[path.stem])
        elif path.stem == "castle":
            mask = rasterize(CASTLE_SHAPES)
        elif path.stem == "waterfalls":
            mask = rasterize(WATERFALL_SHAPES)
        elif path.stem == "bridge":
            polygons, holes = zip(*BRIDGE_PARTS)
            mask = rasterize(polygons, [hole for group in holes for hole in group])

        if path.stem in LABEL_CUTS:
            draw = ImageDraw.Draw(mask)
            for bounds in LABEL_CUTS[path.stem]:
                draw.rectangle(bounds, fill=0)

        padded = Image.new("L", OUTPUT_SIZE, 0)
        padded.paste(mask, (0, 0))
        padded.save(path, format="PNG", optimize=True)
        refined.append(path.name)

    # Nearer figures cover the bridge; the bridge covers the visible falls.
    bridge_path = MASK_DIR / "bridge.png"
    bridge = np.asarray(Image.open(bridge_path).convert("L").crop((0, 0, *SOURCE_SIZE))).copy()
    for name in ("technomage", "guardian", "explorer", "bear"):
        path = MASK_DIR / f"{name}.png"
        character = np.asarray(Image.open(path).convert("L").crop((0, 0, *SOURCE_SIZE)))
        bridge[character >= 128] = 0
    padded = Image.new("L", OUTPUT_SIZE, 0)
    padded.paste(Image.fromarray(bridge), (0, 0))
    padded.save(bridge_path, format="PNG", optimize=True)

    falls_path = MASK_DIR / "waterfalls.png"
    falls = np.asarray(Image.open(falls_path).convert("L").crop((0, 0, *SOURCE_SIZE))).copy()
    falls[bridge >= 128] = 0
    padded = Image.new("L", OUTPUT_SIZE, 0)
    padded.paste(Image.fromarray(falls), (0, 0))
    padded.save(falls_path, format="PNG", optimize=True)

    print(f"Máscaras ajustadas e padronizadas: {len(refined)}")
    print("Região alinhada à fonte: 1672 x 941; padding inferior preto: 3 px.")
    print("Canal: L (grayscale de canal único).")
    print("Limpeza manual de placas: " + ", ".join(sorted(LABEL_CUTS)))


if __name__ == "__main__":
    main()
