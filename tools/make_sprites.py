# Wertet die Champion-Sprites auf (Pixel-Art-Stil) und schreibt sie nach assets/characters-hd/:
#  - dunkler 1-Pixel-Umriss (4er-Nachbarschaft, wie handgepixelt)
#  - etwas kräftigere Farben und mehr Kontrast
#  - helle Lichtkante an der Oberseite, Schattenkante an der Unterseite (mehr Volumen)
# Effekt-Sheets (…_Effect) werden unverändert kopiert.
# Aufruf: python tools/make_sprites.py
import os
import shutil

from PIL import Image, ImageChops, ImageEnhance

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
SRC = os.path.join(ROOT, "characters")
DST = os.path.join(ROOT, "characters-hd")
OUTLINE = (20, 14, 30, 235)


def shift(mask, dx, dy):
    # Verschieben ohne Umbruch: was über den Rand läuft, fällt weg
    out = ImageChops.offset(mask, dx, dy)
    w, h = mask.size
    if dx > 0:
        out.paste(0, (0, 0, dx, h))
    if dx < 0:
        out.paste(0, (w + dx, 0, w, h))
    if dy > 0:
        out.paste(0, (0, 0, w, dy))
    if dy < 0:
        out.paste(0, (0, h + dy, w, h))
    return out


def enhance(path, out_path):
    img = Image.open(path).convert("RGBA")
    alpha = img.split()[3]
    solid = alpha.point(lambda a: 255 if a > 40 else 0)

    rgb = img.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.25)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)

    # Lichtkante: Pixel, über denen nichts ist, werden heller
    top_edge = ImageChops.subtract(solid, shift(solid, 0, 1))
    light = Image.blend(rgb, Image.new("RGB", rgb.size, (255, 250, 230)), 0.4)
    rgb = Image.composite(light, rgb, top_edge)
    # Schattenkante: Pixel, unter denen nichts ist, werden dunkler
    bottom_edge = ImageChops.subtract(solid, shift(solid, 0, -1))
    dark = Image.blend(rgb, Image.new("RGB", rgb.size, (30, 20, 50)), 0.3)
    rgb = Image.composite(dark, rgb, bottom_edge)

    out = rgb.convert("RGBA")
    out.putalpha(alpha)

    # Umriss: leere Pixel direkt neben der Figur (oben/unten/links/rechts)
    grown = solid
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        grown = ImageChops.lighter(grown, shift(solid, dx, dy))
    ring = ImageChops.subtract(grown, solid)
    out = Image.composite(Image.new("RGBA", out.size, OUTLINE), out, ring)
    out.save(out_path, optimize=True)


count = 0
for folder in sorted(os.listdir(SRC)):
    src_dir = os.path.join(SRC, folder)
    if not os.path.isdir(src_dir):
        continue
    dst_dir = os.path.join(DST, folder)
    os.makedirs(dst_dir, exist_ok=True)
    for name in os.listdir(src_dir):
        if not name.lower().endswith(".png"):
            continue
        src = os.path.join(src_dir, name)
        dst = os.path.join(dst_dir, name)
        if "Effect" in name:
            shutil.copyfile(src, dst)
        else:
            enhance(src, dst)
        count += 1
print(count, "Sprites geschrieben nach", DST)
