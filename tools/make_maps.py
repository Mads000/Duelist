# Erzeugt die Maps "Vulkanschmiede", "Frostgipfel" und "Wolkenhof" aus der Original-Arena (Arena2.png)
# durch Umfärben der Bereiche Himmel / Boden / Steine / Pflanzen.
# Aufruf: python tools/make_maps.py [Dateiname ...]   (ohne Angabe: alle Maps)
import colorsys
import math
import os
import random
import sys
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


# ---------------- Wolkenhof ----------------
# Marmorhof im Abendrot: helle Steinplatten, Emblem in der Mitte, Blütenbüsche
EMBLEM = (768, 560)


def clamp(c):
    return tuple(max(0, min(255, int(v))) for v in c)


def wolkenhof(kind, c, x, y, n, fine):
    h, s, v = hsv(c)
    if kind == "sky":
        if s < 0.25:  # Wolken rosa angehaucht
            return lerp((246, 196, 206), (255, 244, 238), v)
        t = min(1, max(0, y / H * 1.1 + (n - 0.5) * 0.25))
        return lerp((112, 128, 214), (255, 178, 150), t)
    if kind == "floor":
        cx, cy = EMBLEM
        d = math.hypot(x - cx, (y - cy) * 1.3)
        a = math.atan2((y - cy) * 1.3, x - cx)
        if d < 172:
            if d >= 162:
                return (52, 78, 156)
            if d >= 150:
                return clamp(lerp((196, 150, 50), (255, 222, 120), v))
            if d < 26:
                return (255, 236, 170)
            if 92 <= d < 98:
                return clamp(lerp((196, 150, 50), (255, 222, 120), v))
            if abs(math.sin(4 * a)) < 0.09 + 6 / max(d, 1):
                return clamp(lerp((206, 160, 60), (255, 226, 130), 1 - d / 150))
            return clamp(lerp((120, 156, 226), (176, 204, 246), v * 0.8 + fine * 0.2))
        size = 72
        lx, ly = x % size, (y + (size // 2 if (x // size) % 2 else 0)) % size
        tone = 0.92 + (((x // size) * 7 + (y // size) * 13) % 5) * 0.022
        g = (0.8 + v * 0.28) * tone
        base = (222 * g, 214 * g, 204 * g)
        if lx < 3 or ly < 3:
            base = lerp(clamp(base), (150, 148, 170), 0.55)
        elif fine > 0.9:
            base = lerp(clamp(base), (196, 196, 214), 0.45)  # Marmor-Adern
        return clamp(base)
    if kind == "stone":
        return clamp((150 * v + 72, 152 * v + 76, 172 * v + 82))
    if kind == "plant":
        if fine > 0.68:
            return clamp(lerp((240, 120, 170), (255, 214, 232), v))
        return clamp(lerp((34, 100, 70), (120, 196, 120), v))
    return c


# ---------------- Schwebende Insel (Menü-Hintergrund) ----------------
# Original-Arena ohne Himmel, verkleinert, mit transparentem Rand
def make_float(name):
    # nur den zusammenhängenden Teil um die Mitte (keine Wolkenreste)
    keep = bytearray(W * H)
    q = deque([(W // 2, H // 2)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if keep[i] or sky[i]:
            continue
        keep[i] = 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not keep[ny * W + nx]:
                q.append((nx, ny))
    out = Image.new("RGBA", (W, H))
    o = out.load()
    for y in range(H):
        for x in range(W):
            if keep[y * W + x]:
                o[x, y] = px[x, y] + (255,)
    box = out.getbbox()
    out = out.crop(box)
    out = out.resize((out.width * 2 // 3, out.height * 2 // 3), Image.NEAREST)
    path = os.path.join(ROOT, "ui", name)
    out.save(path, optimize=True)
    print("gespeichert:", path)


ALL = {"Map-Vulkan.png": volcano, "Map-Frost.png": frost, "Map-Wolkenhof.png": wolkenhof, "Arena-Insel.png": None}
for name in (sys.argv[1:] or ALL):
    if ALL[name]:
        make(name, ALL[name])
    else:
        make_float(name)
