"""Create first-pass, grayscale masks from hand-traced visible regions only."""

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/artwork/source/layoutTamarind.png"
OUTPUT = ROOT / "public/artwork/masks"
SCALE = 3
TRACE_SIZE = (1680, 945)
SIZE = (1672, 941)


def px(value):
    return value * SIZE[0] / TRACE_SIZE[0]


def py(value):
    return value * SIZE[1] / TRACE_SIZE[1]


def canvas():
    return Image.new("L", (SIZE[0] * SCALE, SIZE[1] * SCALE), 0)


def draw_polygon(draw, points, fill=255):
    draw.polygon([(round(px(x) * SCALE), round(py(y) * SCALE)) for x, y in points], fill=fill)


def draw_rect(draw, box, fill=0):
    left, top, right, bottom = box
    draw.rectangle((round(px(left) * SCALE), round(py(top) * SCALE), round(px(right) * SCALE), round(py(bottom) * SCALE)), fill=fill)


def finish(mask):
    return mask.resize(SIZE, Image.Resampling.LANCZOS)


def save(name, mask):
    path = OUTPUT / f"{name}.png"
    finish(mask).save(path, format="PNG", optimize=True)
    return path


def carve_visible_occlusions(target, blockers):
    target_path = OUTPUT / f"{target}.png"
    visible = np.asarray(Image.open(target_path).convert("L")).copy()
    for blocker in blockers:
        blocker_path = OUTPUT / f"{blocker}.png"
        hidden_by_front = np.asarray(Image.open(blocker_path).convert("L"))
        visible[hidden_by_front > 0] = 0
    Image.fromarray(visible).save(target_path, format="PNG", optimize=True)


def build_sun(source):
    rgb = np.asarray(source.convert("RGB"))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    warm = cv2.inRange(hsv, np.array([0, 55, 72], np.uint8), np.array([29, 255, 255], np.uint8))
    roi = np.zeros((SIZE[1], SIZE[0]), dtype=np.uint8)
    cv2.ellipse(roi, (round(px(1345)), round(py(244))), (round(px(238)), round(py(145))), 0, 0, 360, 255, -1, cv2.LINE_AA)
    sun = cv2.bitwise_and(warm, roi)

    # The dragon crosses the disk; keep its visible pixels out of the sun mask.
    dragon = np.zeros_like(sun)
    dragon_points = np.array([
        [1370, 141], [1404, 154], [1435, 141], [1460, 156], [1490, 151],
        [1522, 129], [1558, 114], [1608, 102], [1679, 105], [1679, 298],
        [1625, 294], [1587, 284], [1554, 279], [1520, 258], [1491, 247],
        [1465, 229], [1434, 226], [1410, 206], [1380, 188],
    ], dtype=np.float32)
    dragon_points *= np.array([SIZE[0] / TRACE_SIZE[0], SIZE[1] / TRACE_SIZE[1]], dtype=np.float32)
    cv2.fillPoly(dragon, [dragon_points.astype(np.int32)], 255)
    sun[dragon > 0] = 0

    # Suppress isolated orange pixels outside the connected disk texture.
    count, labels, stats, _ = cv2.connectedComponentsWithStats((sun > 0).astype(np.uint8), 8)
    keep = np.zeros_like(sun)
    for component in range(1, count):
        if stats[component, cv2.CC_STAT_AREA] > 80:
            keep[labels == component] = 255
    return Image.fromarray(keep).resize(SIZE, Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description="Gera máscaras iniciais por polígonos traçados, sem alterar a fonte.")
    parser.add_argument("--force", action="store_true", help="Substitui máscaras já existentes.")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    existing = [name for name in ("sky", "sun", "far-mountains", "mid-mountains", "castle", "waterfalls", "bridge", "technomage", "guardian", "explorer", "bear", "foreground") if (OUTPUT / f"{name}.png").exists()]
    if existing and not args.force:
        raise SystemExit("Máscaras já existem e podem conter revisão manual. Use --force somente para regenerá-las.")
    source = Image.open(SOURCE).convert("RGB")
    if source.size != SIZE:
        raise SystemExit(f"Imagem fonte {source.size}; esperado {SIZE}.")

    sun = build_sun(source)
    sun.save(OUTPUT / "sun.png", format="PNG", optimize=True)

    sky = canvas()
    draw = ImageDraw.Draw(sky)
    draw_polygon(draw, [
        (0, 0), (1680, 0), (1680, 277), (1644, 268), (1608, 252),
        (1574, 257), (1546, 248), (1515, 253), (1483, 266), (1453, 277),
        (1420, 276), (1390, 260), (1360, 255), (1326, 263), (1294, 277),
        (1261, 272), (1227, 269), (1193, 275), (1163, 276), (1134, 265),
        (1108, 246), (1080, 226), (1052, 214), (1024, 207), (994, 213),
        (965, 221), (936, 230), (907, 231), (878, 224), (848, 225),
        (817, 235), (788, 249), (761, 263), (735, 252), (704, 251),
        (675, 258), (644, 258), (613, 251), (584, 248), (556, 257),
        (529, 265), (500, 261), (470, 260), (440, 268), (409, 269),
        (379, 266), (348, 270), (319, 276), (290, 274), (261, 280),
        (232, 285), (204, 280), (176, 276), (147, 278), (118, 280),
        (87, 274), (58, 281), (28, 277), (0, 284),
    ])

    # Leave known foreground artwork and interface out of the sky selection.
    draw_polygon(draw, [
        (0, 0), (169, 0), (153, 26), (131, 48), (120, 83), (105, 117),
        (91, 160), (72, 205), (52, 251), (29, 292), (0, 322),
    ], 0)
    for box in [(125, 22, 657, 190), (116, 187, 516, 291), (827, 20, 1428, 70)]:
        draw_rect(draw, box, 0)

    # Prevent the separate sun and dragon silhouettes from being swallowed by sky.
    sun_l = sun.resize((SIZE[0] * SCALE, SIZE[1] * SCALE), Image.Resampling.NEAREST)
    sky.paste(0, (0, 0), sun_l)
    draw = ImageDraw.Draw(sky)
    draw_polygon(draw, [
        (1370, 141), (1404, 154), (1435, 141), (1460, 156), (1490, 151),
        (1522, 129), (1558, 114), (1608, 102), (1679, 105), (1679, 298),
        (1625, 294), (1587, 284), (1554, 279), (1520, 258), (1491, 247),
        (1465, 229), (1434, 226), (1410, 206), (1380, 188),
    ], 0)

    # Distant ridge silhouettes. They intentionally overlap the intermediate ridge mask.
    far = canvas()
    draw = ImageDraw.Draw(far)
    draw_polygon(draw, [
        (0, 421), (31, 401), (72, 386), (119, 376), (156, 349), (190, 353),
        (216, 330), (241, 342), (269, 311), (290, 330), (311, 365), (340, 369),
        (370, 391), (398, 367), (421, 331), (445, 340), (464, 372), (491, 380),
        (519, 357), (550, 351), (577, 322), (601, 343), (624, 381), (651, 394),
        (688, 375), (718, 366), (749, 389), (778, 416), (764, 441), (731, 451),
        (698, 449), (665, 460), (632, 451), (601, 468), (570, 457), (539, 467),
        (508, 456), (476, 466), (444, 451), (411, 466), (379, 452), (347, 466),
        (315, 449), (284, 461), (252, 445), (220, 458), (188, 444), (156, 460),
        (124, 446), (91, 461), (59, 445), (29, 458), (0, 448),
    ])
    draw_polygon(draw, [
        (1067, 380), (1095, 354), (1124, 341), (1154, 338), (1175, 315),
        (1197, 321), (1220, 304), (1242, 324), (1261, 349), (1288, 363),
        (1314, 340), (1343, 334), (1373, 309), (1401, 328), (1423, 354),
        (1454, 367), (1482, 348), (1512, 333), (1539, 305), (1562, 329),
        (1595, 342), (1629, 356), (1658, 353), (1680, 364), (1680, 451),
        (1644, 452), (1612, 463), (1578, 444), (1546, 464), (1513, 447),
        (1481, 466), (1449, 448), (1418, 464), (1384, 449), (1347, 464),
        (1312, 447), (1278, 462), (1244, 441), (1209, 447), (1175, 432),
        (1139, 452), (1107, 428),
    ])
    save("far-mountains", far)

    mid = canvas()
    draw = ImageDraw.Draw(mid)
    draw_polygon(draw, [
        (0, 463), (34, 448), (70, 464), (105, 439), (140, 453), (173, 424),
        (202, 441), (234, 418), (261, 430), (286, 451), (315, 457), (342, 432),
        (370, 445), (397, 460), (424, 442), (451, 457), (479, 440), (508, 455),
        (536, 431), (565, 442), (590, 465), (619, 451), (647, 462), (675, 440),
        (704, 446), (735, 467), (759, 462), (779, 489), (758, 511), (731, 502),
        (704, 525), (675, 506), (647, 536), (618, 512), (590, 529), (562, 510),
        (535, 534), (506, 514), (475, 539), (445, 516), (413, 535), (381, 511),
        (349, 523), (318, 496), (288, 507), (256, 484), (223, 501), (191, 477),
        (159, 493), (127, 477), (95, 500), (62, 474), (29, 491), (0, 479),
    ])
    draw_polygon(draw, [
        (1075, 435), (1107, 421), (1138, 438), (1168, 417), (1198, 430),
        (1229, 405), (1260, 420), (1292, 402), (1323, 423), (1355, 412),
        (1387, 438), (1418, 420), (1450, 438), (1483, 418), (1513, 439),
        (1545, 423), (1577, 444), (1610, 427), (1642, 448), (1680, 437),
        (1680, 516), (1647, 510), (1613, 527), (1579, 506), (1546, 526),
        (1513, 507), (1480, 529), (1447, 509), (1413, 529), (1380, 511),
        (1346, 534), (1313, 512), (1280, 534), (1245, 512), (1213, 531),
        (1180, 514), (1147, 531), (1115, 514), (1080, 528),
    ])
    save("mid-mountains", mid)

    castle = canvas()
    draw = ImageDraw.Draw(castle)
    draw_polygon(draw, [
        (754, 383), (765, 362), (776, 343), (783, 313), (794, 287),
        (807, 280), (811, 258), (819, 232), (825, 202), (833, 183),
        (841, 154), (851, 141), (859, 168), (866, 198), (871, 223),
        (877, 245), (889, 258), (896, 235), (903, 207), (909, 180),
        (918, 157), (927, 146), (937, 168), (945, 194), (953, 220),
        (959, 241), (966, 213), (970, 182), (978, 150), (988, 132),
        (999, 153), (1005, 178), (1010, 208), (1015, 240), (1027, 263),
        (1036, 285), (1043, 266), (1047, 232), (1053, 203), (1061, 177),
        (1071, 164), (1080, 189), (1087, 217), (1092, 248), (1097, 278),
        (1105, 295), (1112, 271), (1117, 245), (1123, 224), (1133, 218),
        (1142, 244), (1150, 282), (1156, 322), (1151, 350), (1135, 371),
        (1101, 387), (1070, 383), (1038, 375), (1003, 380), (971, 384),
        (940, 377), (906, 386), (876, 379), (841, 389), (810, 381),
        (781, 392),
    ])
    save("castle", castle)

    falls = canvas()
    draw = ImageDraw.Draw(falls)
    draw_polygon(draw, [(949, 376), (1006, 377), (1010, 405), (1000, 433), (1007, 466), (995, 489), (1001, 516), (986, 543), (973, 515), (978, 488), (963, 463), (970, 434), (954, 410)])
    draw_polygon(draw, [(1538, 393), (1608, 398), (1600, 425), (1608, 450), (1598, 478), (1604, 504), (1591, 533), (1579, 506), (1584, 476), (1569, 451), (1577, 426), (1547, 420)])
    draw_polygon(draw, [(1362, 588), (1418, 591), (1411, 617), (1422, 644), (1408, 673), (1399, 703), (1385, 678), (1390, 649), (1375, 623)])
    save("waterfalls", falls)

    bridge = canvas()
    draw = ImageDraw.Draw(bridge)
    # Each deck and arch band is traced independently; openings remain black.
    spans = [
        ((1173, 370, 1519, 396), [1200, 1264, 1328, 1392, 1456]),
        ((822, 571, 1157, 598), [850, 914, 978, 1042, 1106]),
        ((1070, 632, 1425, 659), [1100, 1168, 1236, 1304, 1372]),
    ]
    for (left, top, right, deck_bottom), centers in spans:
        draw_polygon(draw, [(left, top), (right, top + 4), (right - 2, deck_bottom), (left + 2, deck_bottom - 2)])
        for center in centers:
            draw_polygon(draw, [(center - 9, deck_bottom - 1), (center + 9, deck_bottom), (center + 6, deck_bottom + 30), (center - 6, deck_bottom + 30)])
        for center in centers[:-1]:
            a, b = center + 9, center + 55
            arch = [(a, deck_bottom + 33), (a, deck_bottom + 17)]
            arch += [(round(a + (b - a) * t), round(deck_bottom + 2 + 15 * (1 - (2 * t - 1) ** 2))) for t in np.linspace(0, 1, 9)]
            arch += [(b, deck_bottom + 33)]
            draw_polygon(draw, arch)
    save("bridge", bridge)

    characters = {
        "technomage": [
            [(131, 523), (112, 510), (137, 495), (123, 489), (142, 471), (164, 463), (190, 469), (209, 484), (221, 501), (214, 513), (202, 520), (220, 532), (235, 555), (231, 574), (244, 588), (232, 605), (218, 608), (228, 635), (215, 659), (224, 685), (211, 697), (96, 697), (77, 687), (88, 667), (95, 644), (105, 627), (108, 608), (100, 592), (105, 574), (121, 555), (136, 543), (119, 533)],
            [(250, 393), (267, 379), (290, 389), (306, 416), (299, 458), (282, 482), (270, 502), (266, 561), (257, 624), (246, 624), (252, 562), (255, 508), (263, 475), (247, 460), (236, 438)],
        ],
        "guardian": [[
            (368, 365), (377, 348), (392, 340), (409, 343), (425, 352), (434, 367),
            (444, 381), (460, 390), (472, 408), (462, 423), (449, 428), (468, 447),
            (481, 484), (477, 518), (466, 552), (469, 589), (481, 630), (467, 673),
            (456, 704), (421, 701), (409, 678), (402, 639), (389, 654), (362, 653),
            (342, 639), (321, 643), (285, 631), (259, 621), (287, 600), (314, 573),
            (329, 539), (336, 506), (333, 474), (334, 443), (339, 418), (353, 394),
        ]],
        "explorer": [[
            (628, 346), (647, 347), (668, 355), (687, 370), (696, 389), (702, 414),
            (715, 437), (704, 466), (713, 497), (728, 525), (714, 544), (711, 570),
            (724, 608), (719, 643), (733, 681), (719, 710), (681, 715), (660, 694),
            (644, 663), (613, 672), (589, 661), (559, 678), (531, 687), (497, 667),
            (476, 651), (487, 629), (510, 603), (527, 575), (545, 546), (554, 515),
            (550, 482), (559, 448), (566, 419), (582, 398), (592, 375), (610, 356),
        ]],
        "bear": [[
            (775, 486), (795, 474), (819, 473), (842, 485), (860, 504), (878, 521),
            (893, 539), (900, 559), (892, 583), (887, 612), (900, 642), (889, 676),
            (866, 699), (834, 713), (802, 718), (778, 705), (760, 684), (741, 668),
            (727, 641), (723, 612), (732, 588), (736, 558), (747, 533), (758, 509),
        ]],
    }
    for name, polygons in characters.items():
        mask = canvas()
        draw = ImageDraw.Draw(mask)
        for points in polygons:
            draw_polygon(draw, points)
        save(name, mask)

    foreground = canvas()
    draw = ImageDraw.Draw(foreground)
    draw_polygon(draw, [
        (0, 649), (37, 654), (74, 681), (108, 684), (141, 690), (166, 670),
        (197, 682), (230, 701), (260, 684), (294, 691), (322, 709), (350, 693),
        (380, 706), (413, 683), (450, 698), (486, 702), (529, 681), (572, 702),
        (601, 688), (638, 712), (680, 695), (718, 715), (754, 701), (787, 720),
        (829, 708), (873, 732), (913, 727), (952, 749), (986, 750), (1016, 775),
        (1054, 780), (1091, 820), (1080, 945), (0, 945),
    ])
    draw_polygon(draw, [
        (1288, 766), (1333, 749), (1375, 731), (1415, 723), (1455, 719),
        (1496, 697), (1534, 702), (1571, 682), (1607, 671), (1643, 663),
        (1680, 667), (1680, 945), (1288, 945),
    ])
    save("foreground", foreground)

    # Only source pixels visibly belonging to the rear object remain selected.
    carve_visible_occlusions("far-mountains", ["mid-mountains", "castle", "waterfalls", "bridge", "technomage", "guardian", "explorer", "bear", "foreground"])
    carve_visible_occlusions("mid-mountains", ["castle", "waterfalls", "bridge", "technomage", "guardian", "explorer", "bear", "foreground"])
    carve_visible_occlusions("waterfalls", ["bridge"])
    carve_visible_occlusions("foreground", ["technomage", "guardian", "explorer", "bear", "bridge"])

    # The upper sky is a visible-only region. UI, sun, mountains, castle, and
    # dragon are carved from it without synthesizing any pixels beneath them.
    sky_l = finish(sky)
    sky_arr = np.asarray(sky_l).copy()
    for name in ("far-mountains", "mid-mountains", "castle", "waterfalls", "bridge", "technomage", "guardian", "explorer", "bear", "foreground"):
        other = np.asarray(Image.open(OUTPUT / f"{name}.png").convert("L"))
        sky_arr[other > 0] = 0
    sun_arr = np.asarray(sun)
    sky_arr[sun_arr > 0] = 0
    Image.fromarray(sky_arr).save(OUTPUT / "sky.png", format="PNG", optimize=True)

    created = sorted(path.name for path in OUTPUT.glob("*.png"))
    print(f"Máscaras em escala de cinza criadas ({len(created)}):")
    for name in created:
        with Image.open(OUTPUT / name) as image:
            print(f"- {name}: {image.mode} {image.size}")
    print("Traçados iniciais para revisão manual; pixels ocultos não foram preenchidos.")


if __name__ == "__main__":
    main()
