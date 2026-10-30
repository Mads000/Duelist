# Wertet die Champion-Sprites auf (Pixel-Art-Stil) und schreibt sie nach assets/characters-hd/:
#  - dunkler 1-Pixel-Umriss (4er-Nachbarschaft, wie handgepixelt)
#  - etwas kräftigere Farben und mehr Kontrast
#  - helle Lichtkante an der Oberseite, Schattenkante an der Unterseite (mehr Volumen)
#  - eigene Farbpalette je Champion (Rüstung/Metall eingefärbt, Farbton verschoben),
#    damit die Figuren nicht mehr nach Standard-Pack aussehen
# Effekt-Sheets (…_Effect) werden unverändert kopiert.
# Aufruf: python tools/make_sprites.py
import colorsys
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


# Ordner -> (Tönung für graues Metall/Stoff, Stärke, Farbton-Verschiebung für bunte Pixel)
PALETTES = {
    "Knight Templar": ((60, 150, 255), 0.6, 0.0),      # Vanguard: Himmelsstahl
    "Elite Orc": ((150, 120, 90), 0.2, -0.04),           # Warbrute: Rostbronze
    "Armored Skeleton": ((160, 110, 240), 0.45, 0.0),   # Boneguard: Geisterviolett
    "Werebear": ((220, 140, 70), 0.3, 0.0),              # Rageclaw: Glutbraun
    "Werewolf": ((80, 110, 230), 0.4, 0.0),              # Nightfang: Mitternacht
    "Wizard": ((90, 200, 220), 0.25, -0.12),             # Arcanis: Türkis statt Lila
    "Greatsword Skeleton": ((230, 60, 70), 0.42, 0.0),  # Gravelord: Blutrot
    "Priest": ((255, 220, 120), 0.4, 0.0),               # Seraphina: Gold
    "Lancer": ((255, 205, 80), 0.6, 0.0),               # Valor: Goldrüstung
    "Slime": ((90, 200, 255), 0.0, 0.33),                # Gloop: Wolkenblau
}


def recolor(img, folder):
    tint, strength, shift = PALETTES.get(folder, ((255, 255, 255), 0, 0))
    if not strength and not shift:
        return img
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            h, s_, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s_ > 0.28 and shift:
                r2, g2, b2 = colorsys.hsv_to_rgb((h + shift) % 1, s_, v)
                r, g, b = int(r2 * 255), int(g2 * 255), int(b2 * 255)
            elif s_ <= 0.28 and 0.18 < v and strength:
                # graue Flächen (Metall, Stoff, Knochen) einfärben – Helligkeit bleibt
                k = strength * (1 - abs(v - 0.55))
                r = int(r + (tint[0] * v - r) * k)
                g = int(g + (tint[1] * v - g) * k)
                b = int(b + (tint[2] * v - b) * k)
            px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), a)
    return img


def enhance(path, out_path, folder=""):
    img = recolor(Image.open(path).convert("RGBA"), folder)
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
            enhance(src, dst, folder)
        count += 1
print(count, "Sprites geschrieben nach", DST)
