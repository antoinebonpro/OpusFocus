"""Génère build/icon.ico (cible concentrique) sans dépendre d'un fichier image externe."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "icon.ico"
SIZE = 256

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=56, fill=(17, 24, 39, 255))
for i, color in enumerate([(99, 102, 241), (17, 24, 39), (99, 102, 241), (17, 24, 39), (236, 72, 153)]):
    pad = 36 + i * 19
    draw.ellipse((pad, pad, SIZE - pad, SIZE - pad), fill=color + (255,))
img.save(OUT, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(OUT)
