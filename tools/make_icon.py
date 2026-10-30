# Erzeugt das App-Icon als Pixel-Art (64x64, ohne Glättung hochskaliert):
# Gloop, der Wolkenschleim, mit Krone auf dem Wolkenteppich vor dem Himmel.
# Aufruf: python tools/make_icon.py
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
OUT_DIR = os.path.join(ROOT, "duelist", "icons")
SLIME = os.path.join(ROOT, "assets", "characters-hd", "Slime")
N = 64
OUTLINE = (14, 18, 46)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGBA", (N, N))
px = img.load()

# Himmel: oben tiefblau, unten hell, mit Sonnenschein oben rechts und Pixel-Dithering
for y in range(N):
    for x in range(N):
        c = lerp((40, 92, 214), (150, 205, 255), y / (N - 1))
        sun = max(0, 1 - math.hypot(x - 50, y - 12) / 26)
        c = lerp(c, (255, 246, 210), sun * 0.75)
        if sun > 0.15 and (x + y) % 2 == 0:
            c = lerp(c, (255, 255, 255), 0.12)
        px[x, y] = c + (255,)

d = ImageDraw.Draw(img)


def cloud(cx, cy, w, shade=(214, 230, 250)):
    # Pixel-Wolke aus Kreisen, unten flach, mit Schattenkante
    for r, dx, dy in ((w * 0.32, -w * 0.25, 0), (w * 0.42, 0, -w * 0.12), (w * 0.3, w * 0.28, 0.02 * w)):
        d.ellipse([cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r], fill=(255, 255, 255, 255))
    d.rectangle([cx - w * 0.55, cy, cx + w * 0.55, cy + w * 0.22], fill=(255, 255, 255, 255))
    d.rectangle([cx - w * 0.55, cy + w * 0.16, cx + w * 0.55, cy + w * 0.22], fill=shade + (255,))


cloud(10, 18, 14)
cloud(58, 34, 12)
# Wolkenteppich unten, auf dem Gloop sitzt
for x in range(N):
    h = 50 + int(2.5 * math.sin(x * 0.45) + 1.5 * math.sin(x * 1.3))
    d.line([(x, h), (x, N)], fill=(255, 255, 255, 255))
    d.line([(x, h + 6), (x, N)], fill=(206, 224, 248, 255))
    d.point((x, h + 11), fill=(176, 200, 236, 255))

# Gloop, doppelt so groß
frame = Image.open(os.path.join(SLIME, "Slime-Idle.png")).convert("RGBA").crop((0, 0, 100, 100))
frame = frame.crop(frame.getbbox())
k = 2
gloop = frame.resize((frame.width * k, frame.height * k), Image.NEAREST)
# Weißer Umriss (2 Pixel) für Sticker-Look
alpha = gloop.split()[3]
mask = Image.new("L", gloop.size, 0)
for dx in range(-2, 3):
    for dy in range(-2, 3):
        if abs(dx) + abs(dy) <= 2:
            mask.paste(255, (0, 0), alpha.transform(alpha.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy)))
sticker = Image.new("RGBA", (gloop.width + 4, gloop.height + 4), (0, 0, 0, 0))
outline_layer = Image.new("RGBA", gloop.size, (255, 255, 255, 255))
sticker.paste(outline_layer, (2, 2), mask)
sticker.alpha_composite(gloop, (2, 2))
gx = (N - sticker.width) // 2
gy = 54 - sticker.height + 2
img.alpha_composite(sticker, (gx, gy))

# Augen – damit Gloop auch als kleines Icon ein Gesicht hat
top = gy + 2
mid = N // 2
for ex in (mid - 8, mid + 5):
    d.rectangle([ex - 1, top + 9, ex + 5, top + 17], fill=OUTLINE + (255,))
    d.rectangle([ex, top + 10, ex + 4, top + 16], fill=(255, 255, 255, 255))
    d.rectangle([ex + 1, top + 12, ex + 3, top + 16], fill=(20, 30, 70, 255))
    px[ex + 1, top + 12] = (255, 255, 255, 255)

# Goldene Krone (doppelt so groß) auf dem Kopf
crown = [
    "Y...Y...Y",
    "YY.YYY.YY",
    "YYYYYYYYY",
    "YRYYBYYRY",
    "YYYYYYYYY",
]
cols = {"Y": (255, 214, 72), "R": (230, 60, 70), "B": (90, 170, 255)}
cw = len(crown[0]) * 2
cx, cy = mid - cw // 2 + 2, top - 9
cells = {(x, y) for y, row in enumerate(crown) for x, ch in enumerate(row) if ch != "."}
for (x, y) in cells:
    for ox in range(-1, 2):
        for oy in range(-1, 2):
            if (x + ox, y + oy) not in cells:
                d.rectangle([cx + (x + ox) * 2, cy + (y + oy) * 2, cx + (x + ox) * 2 + 1, cy + (y + oy) * 2 + 1], fill=OUTLINE + (255,))
for (x, y) in cells:
    c = cols[crown[y][x]]
    if crown[y][x] == "Y" and y == 2:
        c = (255, 240, 160)
    d.rectangle([cx + x * 2, cy + y * 2, cx + x * 2 + 1, cy + y * 2 + 1], fill=c + (255,))

# Funkeln
for sx, sy in ((50, 8), (8, 34), (42, 22)):
    for ox, oy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        px[sx + ox, sy + oy] = (255, 255, 255, 255)

img = img.convert("RGB")
img.resize((512, 512), Image.NEAREST).save(os.path.join(OUT_DIR, "icon-512.png"), optimize=True)
img.resize((192, 192), Image.NEAREST).save(os.path.join(OUT_DIR, "icon-192.png"), optimize=True)
print("Icons gespeichert")
