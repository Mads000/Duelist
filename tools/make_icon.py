# Erzeugt das App-Icon als Pixel-Art (64x64, ohne Glättung hochskaliert):
# dunkles Emblem – Gloop mit grimmigem Blick vor seiner Sense, leuchtende Kante, Blau/Rot-Lichtschein.
# Aufruf: python tools/make_icon.py
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
OUT_DIR = os.path.join(ROOT, "duelist", "icons")
SLIME = os.path.join(ROOT, "assets", "characters-hd", "Slime")
N = 64
OUTLINE = (6, 8, 20)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGBA", (N, N))
px = img.load()

# Hintergrund: fast schwarz, links blaues, rechts rotes Gegenlicht, Vignette
for y in range(N):
    for x in range(N):
        d = math.hypot(x - 31.5, y - 34) / 44
        c = lerp((22, 30, 64), (5, 6, 16), min(1, d))
        blue = max(0, 1 - math.hypot(x - 6, y - 40) / 34)
        red = max(0, 1 - math.hypot(x - 58, y - 40) / 34)
        c = lerp(c, (40, 90, 220), blue * 0.55)
        c = lerp(c, (200, 40, 50), red * 0.55)
        px[x, y] = c + (255,)

d = ImageDraw.Draw(img)

# Sense diagonal hinter Gloop: Stiel von unten links nach oben rechts, Klinge oben
for i in range(46):
    x, y = 10 + i, 58 - i
    d.point((x, y), fill=(120, 84, 52, 255))
    d.point((x + 1, y), fill=(78, 52, 32, 255))
    d.point((x - 1, y), fill=OUTLINE + (255,))
    d.point((x + 2, y), fill=OUTLINE + (255,))
# Klinge: setzt oben am Stiel an und biegt sich nach links unten
blade = [(56, 13), (53, 9), (49, 7), (44, 6), (39, 6), (34, 7), (30, 9), (27, 12), (25, 15)]
for i in range(len(blade) - 1):
    w = max(1, 4 - i // 2)
    (x0, y0), (x1, y1) = blade[i], blade[i + 1]
    d.line([(x0, y0 - 1), (x1, y1 - 1)], fill=OUTLINE + (255,), width=w + 2)
for i in range(len(blade) - 1):
    w = max(1, 4 - i // 2)
    (x0, y0), (x1, y1) = blade[i], blade[i + 1]
    d.line([(x0, y0), (x1, y1)], fill=(170, 184, 206, 255), width=w)
    d.line([(x0, y0 - (w // 2)), (x1, y1 - (w // 2))], fill=(240, 246, 255, 255), width=1)

# Gloop, doppelt so groß, mit leuchtend blauer Kante statt weißem Sticker-Rand
frame = Image.open(os.path.join(SLIME, "Slime-Idle.png")).convert("RGBA").crop((0, 0, 100, 100))
frame = frame.crop(frame.getbbox())
gloop = frame.resize((frame.width * 2, frame.height * 2), Image.NEAREST)
alpha = gloop.split()[3]
glow = Image.new("L", gloop.size, 0)
for dx in range(-2, 3):
    for dy in range(-2, 3):
        if 0 < abs(dx) + abs(dy) <= 2:
            glow.paste(255, (0, 0), alpha.transform(alpha.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy)))
layer = Image.new("RGBA", (gloop.width + 4, gloop.height + 4), (0, 0, 0, 0))
layer.paste(Image.new("RGBA", gloop.size, (90, 210, 255, 255)), (2, 2), glow)
layer.alpha_composite(gloop, (2, 2))
gx = (N - layer.width) // 2
gy = 58 - layer.height
img.alpha_composite(layer, (gx, gy))

# Grimmiger Blick: schmale, leuchtende Augen mit schrägen Brauen
top = gy + 2
mid = N // 2 + 1
for side in (-1, 1):
    ex = mid + side * 7 - (3 if side < 0 else 0)
    ey = top + 13
    d.rectangle([ex - 1, ey - 1, ex + 4, ey + 3], fill=OUTLINE + (255,))
    d.rectangle([ex, ey, ex + 3, ey + 2], fill=(255, 240, 150, 255))
    d.rectangle([ex + (2 if side < 0 else 0), ey + 1, ex + (3 if side < 0 else 1), ey + 2], fill=(255, 150, 40, 255))
    # Braue fällt zur Mitte hin ab
    for k in range(6):
        bx = ex - 1 + k
        by = ey - 3 + (k // 2 if side < 0 else (5 - k) // 2)
        d.point((bx, by), fill=OUTLINE + (255,))
        d.point((bx, by - 1), fill=OUTLINE + (255,))

# Bodenschatten und feiner Rahmen
d.ellipse([gx + 4, 56, gx + layer.width - 4, 61], fill=(0, 0, 0, 120))
d.rectangle([0, 0, N - 1, N - 1], outline=(70, 90, 140, 255))

img = img.convert("RGB")
img.resize((512, 512), Image.NEAREST).save(os.path.join(OUT_DIR, "icon-512.png"), optimize=True)
img.resize((192, 192), Image.NEAREST).save(os.path.join(OUT_DIR, "icon-192.png"), optimize=True)
print("Icons gespeichert")
