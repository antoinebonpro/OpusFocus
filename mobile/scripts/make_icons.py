"""Génère les icônes de l'app mobile (cible dorée sur fond sombre, comme le logo de l'interface PC).

Usage : ..\\.venv-build\\Scripts\\python.exe scripts\\make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"
BG = (14, 16, 20, 255)
GOLD = (226, 182, 107, 255)
WHITE = (255, 255, 255, 255)


def target(size, color, scale=1.0):
    """Cercle extérieur + point central, dessinés en 4x puis réduits (bords lisses)."""
    big = size * 4
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c, r, w = big / 2, big * 0.30 * scale, big * 0.055 * scale
    d.ellipse((c - r, c - r, c + r, c + r), outline=color, width=round(w))
    dot = big * 0.095 * scale
    d.ellipse((c - dot, c - dot, c + dot, c + dot), fill=color)
    return img.resize((size, size), Image.LANCZOS)


def on_background(size, scale=1.0):
    img = Image.new("RGBA", (size, size), BG)
    img.alpha_composite(target(size, GOLD, scale))
    return img


on_background(1024, 1.25).save(ASSETS / "icon.png")
on_background(1024, 1.0).convert("RGB").save(ASSETS / "splash-icon.png")
on_background(48, 1.25).save(ASSETS / "favicon.png")
# Icône adaptative Android : avant-plan transparent (zone sûre ≈ 66 % du centre), fond uni, version monochrome.
target(1024, GOLD, 0.95).save(ASSETS / "android-icon-foreground.png")
Image.new("RGBA", (1024, 1024), BG).save(ASSETS / "android-icon-background.png")
target(1024, WHITE, 0.95).save(ASSETS / "android-icon-monochrome.png")
print("icônes générées dans", ASSETS)
