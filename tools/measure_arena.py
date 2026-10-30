# Vermisst die begehbare Bodenfläche der Arena (Arena2.png – alle Maps teilen die Form)
# und schreibt sie als Zeilen-Tabelle nach public/duelist/js/arena_shape.js.
# Aufruf: python tools/measure_arena.py
import colorsys
import json
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
img = Image.open(os.path.join(ROOT, "assets", "ui", "Arena2.png")).convert("RGB")
W, H = img.size
px = img.load()
CX = W // 2
STEP = 8          # Zeilenabstand der Tabelle (Weltpixel)
WALL_RUN = 14     # so viele Nicht-Boden-Pixel am Stück = Mauer (Steinchen sind kleiner)


def is_floor(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    sand = 0.03 < h < 0.14 and s > 0.36 and v > 0.35
    grass = 0.17 < h < 0.45 and s > 0.3   # Grasbüschel am Rand zählen noch zum Boden
    return sand or grass


def edge(y, direction):
    run = 0
    last = CX
    x = CX
    while 0 <= x < W:
        if is_floor(px[x, y]):
            run = 0
            last = x
        else:
            run += 1
            if run >= WALL_RUN:
                return last
        x += direction
    return last


rows = {}
for y in range(0, H, 2):
    if not is_floor(px[CX, y]) and not any(is_floor(px[CX + d, y]) for d in range(-40, 41, 8)):
        continue
    l, r = edge(y, -1), edge(y, 1)
    if r - l > 400:
        rows[y] = (l, r)

ys = sorted(rows)
# zusammenhängenden Hauptbereich um die Mitte nehmen
mid = min(ys, key=lambda y: abs(y - 560))
top = bot = mid
while top - 2 in rows:
    top -= 2
while bot + 2 in rows:
    bot += 2


def smooth(y, i):
    vals = sorted(rows[yy][i] for yy in range(y - 12, y + 13, 2) if top <= yy <= bot)
    return vals[len(vals) // 2]


SIDE = 30    # halbe Körperbreite: Figur bleibt vor der Seitenmauer
TOP = 18     # Füße dürfen bis knapp an die hintere Mauer
BOTTOM = 16  # nicht auf die vordere Mauer treten
y0 = top + TOP
y1 = bot - BOTTOM
table = []
for y in range(y0 - y0 % STEP, y1 + STEP, STEP):
    yy = max(top, min(bot, y - y % 2))
    table.append([smooth(yy, 0) + SIDE, smooth(yy, 1) - SIDE])

# Kanten glätten (gleitender Mittelwert über ±3 Zeilen), damit die Grenze nicht "zackig" ist
raw = table
table = []
for i in range(len(raw)):
    near = raw[max(0, i - 3):i + 4]
    table.append([round(sum(r[0] for r in near) / len(near)), round(sum(r[1] for r in near) / len(near))])

shape = {"y0": y0, "y1": y1, "first": y0 - y0 % STEP, "step": STEP, "rows": table}
out = os.path.join(ROOT, "duelist", "js", "arena_shape.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("// Automatisch vermessen aus Arena2.png (tools/measure_arena.py) – nicht von Hand ändern\n")
    f.write("const ARENA_SHAPE = " + json.dumps(shape, separators=(",", ":")) + "\n")
print("Boden y", top, "-", bot, "| begehbar y", y0, "-", y1, "| x", min(r[0] for r in table), "-", max(r[1] for r in table))
print(table[0], table[len(table) // 2], table[-1])
