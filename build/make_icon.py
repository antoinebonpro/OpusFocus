"""Génère build/icon.ico : la cible dorée sur fond sombre, identique à l'icône de l'app mobile."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "icon.ico"
SIZE = 256
BG = (14, 16, 20, 255)
GOLD = (226, 182, 107, 255)

# Dessiné en 4x puis réduit : bords lisses à toutes les tailles.
big = SIZE * 4
img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.22, fill=BG)
c, r, w = big / 2, big * 0.33, big * 0.07
draw.ellipse((c - r, c - r, c + r, c + r), outline=GOLD, width=round(w))
dot = big * 0.12
draw.ellipse((c - dot, c - dot, c + dot, c + dot), fill=GOLD)
img = img.resize((SIZE, SIZE), Image.LANCZOS)
img.save(OUT, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(OUT)
