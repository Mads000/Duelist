# Erzeugt die Maps "Vulkanschmiede" und "Frostgipfel" aus der Original-Arena (Arena2.png)
# durch Umfärben der Bereiche Himmel / Boden / Steine / Pflanzen.
# Aufruf: python tools/make_maps.py
import colorsys
import os
import random
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
src = Image.open(os.path.join(ROOT, "ui", "Arena2.png")).convert("RGB")
W, H = src.size
px = src.load()
random.seed(7)


def hsv(c):
    r, g, b = (v / 255 for v in c)
    return colorsys.rgb_to_hsv(r, g, b)


def is_sky(c):
    h, s, v = hsv(c)
    blue = 0.52 < h < 0.7 and s > 0.25
    cloud = s < 0.22 and v > 0.78 and c[2] >= c[0]
    return blue or cloud


# Himmel per Flood-Fill vom Rand aus finden (damit helle Steine nicht als Wolke zählen)
sky = bytearray(W * H)
q = deque()
for x in range(W):
    q.append((x, 0))
    q.append((x, H - 1))
for y in range(H):
    q.append((0, y))
    q.append((W - 1, y))
while q:
    x, y = q.popleft()
    i = y * W + x
    if sky[i] or not is_sky(px[x, y]):
        continue
    sky[i] = 1
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < W and 0 <= ny < H and not sky[ny * W + nx]:
            q.append((nx, ny))


def classify(x, y):
    if sky[y * W + x]:
        return "sky"
    c = px[x, y]
    h, s, v = hsv(c)
    if 0.17 < h < 0.45 and s > 0.3:
        return "plant"
    # Pokal (gold) und rotes Banner oben in der Mitte bleiben original
    if 680 < x < 860 and 130 < y < 290:
        gold = 0.1 < h < 0.18 and s > 0.45 and v > 0.55
        banner = (h < 0.04 or h > 0.9) and s > 0.35 and 700 < x < 840 and y < 275
        if gold or banner:
            return "keep"
    if 0.03 < h < 0.13 and s > 0.38 and 250 < y < 840 and 110 < x < 1430:
        return "floor"
    return "stone"


def noise_field(scale):
    small = Image.effect_noise((W // scale + 2, H // scale + 2), 64).resize((W, H), Image.BICUBIC)
    return small.load()


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make(name, recolor):
    out = Image.new("RGB", (W, H))
    o = out.load()
    n1 = noise_field(24)
    n2 = noise_field(6)
    for y in range(H):
        for x in range(W):
            kind = classify(x, y)
            o[x, y] = recolor(kind, px[x, y], x, y, n1[x, y] / 255, n2[x, y] / 255)
    path = os.path.join(ROOT, "ui", name)
    out.save(path, optimize=True)
    print("gespeichert:", path)


# ---------------- Vulkanschmiede ----------------
def volcano(kind, c, x, y, n, fine):
    h, s, v = hsv(c)
    if kind == "sky":
        # Lava-Meer unten, Rauch & Glut oben
        cloud = s < 0.25
        if cloud:
            return lerp((38, 26, 30), (92, 66, 62), v)
        t = min(1, max(0, (y / H) * 0.9 + (n - 0.5) * 0.6))
        base = lerp((26, 10, 14), (120, 20, 8), t)
        if fine > 0.62 and t > 0.45:
            base = lerp(base, (255, 140, 30), (fine - 0.62) * 2.2)
        if fine > 0.8 and t > 0.55:
            base = (255, 210, 90)
        return base
    if kind == "floor":
        # dunkler Basalt mit glühenden Rissen
        g = int(40 + v * 70)
        base = (g + 8, int(g * 0.82), int(g * 0.78))
        if 0.497 < n < 0.503 or (fine > 0.86 and n > 0.55):
            base = lerp(base, (255, 110, 20), 0.85)
        return base
    if kind == "stone":
        g = v * 0.75
        base = (int(70 * g + 18), int(52 * g + 12), int(52 * g + 14))
        if s < 0.5 and v > 0.78:  # Steinkanten leicht glühend
            base = lerp(base, (255, 120, 50), 0.25)
        return base
    if kind == "plant":
        return lerp((40, 22, 18), (150, 60, 20), v)
    return c


# ---------------- Frostgipfel ----------------
def frost(kind, c, x, y, n, fine):
    h, s, v = hsv(c)
    if kind == "sky":
        cloud = s < 0.25
        if cloud:
            return lerp((150, 170, 205), (235, 242, 255), v)
        t = min(1, max(0, y / H + (n - 0.5) * 0.3))
        base = lerp((22, 30, 70), (70, 96, 150), t)
        if fine > 0.93:
            base = (230, 240, 255)  # Sterne / Schneeflocken
        return base
    if kind == "floor":
        # festgetretener Schnee und blankes Eis
        ice = n > 0.56
        if ice:
            return lerp((150, 196, 228), (205, 232, 250), v)
        g = 0.75 + v * 0.3
        return (min(255, int(205 * g)), min(255, int(218 * g)), min(255, int(236 * g)))
    if kind == "stone":
        g = v
        base = (int(90 * g + 30), int(108 * g + 34), int(140 * g + 40))
        if v > 0.82:  # Schnee auf den Steinkanten
            base = (232, 240, 252)
        return base
    if kind == "plant":
        return lerp((60, 110, 120), (200, 235, 245), v)
    return c


make("Map-Vulkan.png", volcano)
make("Map-Frost.png", frost)
