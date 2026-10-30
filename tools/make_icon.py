# Erzeugt das App-Icon: P1 (blau) gegen P2 (rot), Blitz in der Mitte, zwei Pixel-Champions.
# Aufruf: python tools/make_icon.py
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
CHARS = os.path.join(ROOT, "assets", "characters")
S = 512


def sprite(folder, sheet, frame=0):
    img = Image.open(os.path.join(CHARS, folder, f"{folder}-{sheet}.png")).convert("RGBA")
    f = img.crop((frame * 100, 0, frame * 100 + 100, 100))
    return f.crop(f.getbbox())


def outline(img, color, width):
    # Umriss um die Figur (wie Sticker), damit sie sich vom Hintergrund abhebt
    alpha = img.split()[3]
    grown = alpha.filter(ImageFilter.MaxFilter(width * 2 + 1))
    base = Image.new("RGBA", img.size, color)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(base, mask=grown)
    out.alpha_composite(img)
    return out


def gradient(size, top, bottom):
    g = Image.new("RGBA", size)
    d = ImageDraw.Draw(g)
    for y in range(size[1]):
        t = y / (size[1] - 1)
        d.line([(0, y), (size[0], y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    return g


icon = Image.new("RGBA", (S, S))
blue = gradient((S, S), (40, 80, 190), (12, 32, 96))
red = gradient((S, S), (230, 70, 70), (120, 20, 24))
icon.alpha_composite(blue)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).polygon([(S * 0.64, 0), (S, 0), (S, S), (S * 0.4, S)], fill=255)
icon.paste(red, mask=mask)

# Glas-Glanz oben
gloss = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(gloss).ellipse([-S * 0.3, -S * 0.75, S * 1.3, S * 0.42], fill=(255, 255, 255, 34))
icon.alpha_composite(gloss.filter(ImageFilter.GaussianBlur(18)))

# Blitz entlang der Trennlinie
bolt = Image.new("RGBA", (S, S), (0, 0, 0, 0))
pts = [(S * 0.6, -10), (S * 0.72, -10), (S * 0.57, S * 0.43), (S * 0.67, S * 0.43), (S * 0.34, S + 10), (S * 0.47, S * 0.55), (S * 0.36, S * 0.55)]
ImageDraw.Draw(bolt).polygon(pts, fill=(255, 244, 200, 255))
glow = bolt.filter(ImageFilter.GaussianBlur(14))
icon.alpha_composite(glow)
icon.alpha_composite(glow)
icon.alpha_composite(bolt)

# Champions: Vanguard links, Warbrute rechts (gespiegelt, schaut nach links)
k = 7
knight = sprite("Knight Templar", "Idle")
orc = sprite("Elite Orc", "Idle").transpose(Image.FLIP_LEFT_RIGHT)
for spr, cx in ((knight, 0.29), (orc, 0.71)):
    big = spr.resize((spr.width * k, spr.height * k), Image.NEAREST)
    big = outline(big, (255, 255, 255, 255), 6)
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    x = int(S * cx - big.width / 2)
    y = int(S * 0.86 - big.height)
    ImageDraw.Draw(shadow).ellipse([x + 10, S * 0.84, x + big.width - 10, S * 0.9], fill=(0, 0, 0, 90))
    icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(4)))
    icon.alpha_composite(big, (x, y))

# "VS" oben in der Mitte
font = ImageFont.truetype("impact.ttf", 150)
d = ImageDraw.Draw(icon)
d.text((S / 2, S * 0.27), "VS", font=font, anchor="mm", fill=(255, 255, 255), stroke_width=10, stroke_fill=(16, 28, 72))

out = os.path.join(ROOT, "duelist", "icons")
icon.convert("RGB").save(os.path.join(out, "icon-512.png"), optimize=True)
icon.resize((192, 192), Image.LANCZOS).convert("RGB").save(os.path.join(out, "icon-192.png"), optimize=True)
print("Icons gespeichert")
