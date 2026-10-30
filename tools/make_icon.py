# Erzeugt das App-Icon als Pixel-Art (64x64, ohne Glättung hochskaliert):
# blau-roter Hintergrund mit Lichtschein, zwei gekreuzte Schwerter und ein großes Chrom-"D".
# Aufruf: python tools/make_icon.py
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "duelist", "icons")
N = 64

NAVY = (14, 22, 58)
OUT = (10, 14, 34)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new("RGB", (N, N))
px = img.load()

# Hintergrund: diagonal geteilt (P1 blau / P2 rot), Lichtschein in der Mitte, dunkler Rand
for y in range(N):
    for x in range(N):
        d = math.hypot(x - 31.5, y - 31.5) / 45
        blue = (x + y) < 64
        base = lerp((70, 120, 235), (20, 40, 120), d) if blue else lerp((240, 90, 90), (110, 18, 26), d)
        # Pixel-Raster-Schimmer (Dithering) im Lichtschein
        if d < 0.55 and (x + y) % 2 == 0:
            base = lerp(base, (255, 255, 255), 0.08)
        px[x, y] = base

d = ImageDraw.Draw(img)
# feine helle Trennlinie zwischen Blau und Rot
for x in range(N):
    y = 63 - x
    if 0 <= y < N:
        px[x, y] = lerp(px[x, y], (255, 245, 220), 0.55)


def sword(flip):
    """Langes Schwert von unten-außen nach oben-innen, kreuzt hinter dem D."""
    def P(x, y):
        return (63 - x, y) if flip else (x, y)
    # Klinge: 3 Pixel breit (hell, mittel, dunkel) mit Umriss
    for i in range(44):
        x, y = 12 + i, 51 - i
        if y < 3:
            break
        d.point(P(x - 1, y - 1), fill=OUT)
        d.point(P(x, y - 1), fill=(255, 255, 255))
        d.point(P(x, y), fill=(206, 216, 232))
        d.point(P(x + 1, y), fill=(130, 144, 170))
        d.point(P(x + 1, y + 1), fill=OUT)
        d.point(P(x + 2, y + 1), fill=OUT)
    # Spitze
    d.point(P(56, 6), fill=OUT)
    # Parierstange (gold, quer zur Klinge)
    for k in range(-5, 6):
        x, y = 12 + k, 51 + k
        d.point(P(x, y), fill=(255, 214, 90))
        d.point(P(x + 1, y), fill=(196, 132, 28))
        d.point(P(x - 1, y), fill=OUT)
        d.point(P(x + 2, y), fill=OUT)
    # Griff und Knauf
    for k in range(1, 6):
        d.point(P(11 - k, 52 + k), fill=(132, 78, 40))
        d.point(P(12 - k, 52 + k), fill=(92, 52, 26))
    for q in ((4, 58), (5, 58), (4, 59), (5, 59)):
        d.point(P(*q), fill=(255, 214, 90))


sword(False)
sword(True)

# Großes "D" als Pixel-Buchstabe (18 x 24), Chrom-Verlauf, dunkler Umriss + Schatten
D = [
    "11111111111110....",
    "111111111111111...",
    "1111111111111111..",
    "11111.......111111",
    "11111........11111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111.........1111",
    "11111........11111",
    "11111.......111111",
    "1111111111111111..",
    "111111111111111...",
    "11111111111110....",
    "",
]
ox, oy = 23, 18
cells = {(ox + x, oy + y) for y, row in enumerate(D) for x, c in enumerate(row) if c == "1"}
# Innenraum des D dunkel füllen (keine Schwerter sichtbar)
for y, row in enumerate(D):
    xs = [x for x, c in enumerate(row) if c == "1"]
    if xs:
        for x in range(xs[0], xs[-1] + 1):
            if (ox + x, oy + y) not in cells:
                px[ox + x, oy + y] = NAVY
# Schatten
for (x, y) in cells:
    for dx, dy in ((2, 2), (1, 2), (2, 1)):
        if (x + dx, y + dy) not in cells:
            px[x + dx, y + dy] = NAVY
# Umriss
for (x, y) in cells:
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        q = (x + dx, y + dy)
        if q not in cells and 0 <= q[0] < N and 0 <= q[1] < N:
            px[q] = OUT
# Chrom: hell oben, Kante in der Mitte, kühles Grau unten
for (x, y) in cells:
    t = (y - oy) / 22
    if t < 0.45:
        c = lerp((255, 255, 255), (222, 230, 242), t / 0.45)
    elif t < 0.52:
        c = (150, 164, 186)
    else:
        c = lerp((205, 214, 230), (130, 142, 168), (t - 0.52) / 0.48)
    if (x - ox) < 2:
        c = lerp(c, (255, 255, 255), 0.4)
    px[x, y] = c

big = img.resize((512, 512), Image.NEAREST)
big.save(os.path.join(ROOT, "icon-512.png"), optimize=True)
img.resize((192, 192), Image.NEAREST).save(os.path.join(ROOT, "icon-192.png"), optimize=True)
print("Icons gespeichert")
