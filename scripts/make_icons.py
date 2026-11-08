#!/usr/bin/env python3
"""Generoi sovelluksen ikonit kansioon icons/. Vaatii Pillow-kirjaston (pip install pillow).

Ajo projektin juuresta:  python3 scripts/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BG = "#ffe6a3"   # sama kuin 2048-laatta
FG = "#7a5200"
OUT = Path(__file__).resolve().parent.parent / "icons"
FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def font(size):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


def make(size, text_width_ratio, radius_ratio=0.0):
    scale = 4  # piirretään isona ja pienennetään -> pehmeät reunat
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_ratio:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * radius_ratio), fill=BG)
    else:
        d.rectangle((0, 0, S, S), fill=BG)
    # Etsitään fonttikoko, jolla teksti on halutun levyinen.
    fs = S
    f = font(fs)
    w = d.textlength("2048", font=f)
    fs = int(fs * (S * text_width_ratio) / w)
    f = font(fs)
    d.text((S / 2, S / 2), "2048", font=f, fill=FG, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    make(192, 0.74).save(OUT / "icon-192.png")
    make(512, 0.74).save(OUT / "icon-512.png")
    # Maskable: teksti pysyy 80 %:n turva-alueen sisällä.
    make(512, 0.56).save(OUT / "icon-maskable-512.png")
    # iOS pyöristää kulmat itse, joten tausta täyttää koko neliön (ei läpinäkyvyyttä).
    make(180, 0.74).convert("RGB").save(OUT / "apple-touch-icon.png")
    print("Ikonit kirjoitettu:", OUT)


if __name__ == "__main__":
    main()
