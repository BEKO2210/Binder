#!/usr/bin/env python3
"""Turns raw device captures into a complete Play Store listing kit.

A screenshot straight off the phone is evidence, not a listing. The store page
is the first thing a stranger sees, so every frame gets the brand ground, one
sentence that says what the screen is for, and the device shot placed on a
measured axis — the same discipline the app itself is held to.

    python3 scripts/store-assets.py <capture-dir> <output-dir>

Captures are named NN-name.png; the caption comes from a sibling NN-name.txt
(first line = eyebrow, second line = headline) or falls back to the file name.
Also writes the 512x512 icon and the 1024x500 feature graphic Play asks for.

Nothing here paints over what the app actually rendered: the system status bar
and the gesture pill are cropped away because they are the phone's, not the
product's, and that is the only pixel of the capture that is touched.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CANVAS = (1080, 1920)
BG_TOP = (18, 20, 27)
BG_BOTTOM = (9, 10, 15)
ACCENT = (199, 255, 74)
TEXT = (247, 248, 243)
MUTED = (158, 164, 176)
SHOT_W = 840
# Source captures are 1440x3088 on the S23; the status bar and the gesture pill
# measure about 150 and 90 pixels there.
STATUS_H = 150
GESTURE_H = 90
RADIUS = 46

REPO = Path(__file__).resolve().parent.parent
FONTS = REPO / "node_modules/@expo-google-fonts/manrope"
BOLD = FONTS / "800ExtraBold/Manrope_800ExtraBold.ttf"
BODY = FONTS / "500Medium/Manrope_500Medium.ttf"
ICON = REPO / "assets/brand/icon.png"


def font(path, size):
    if not path.exists():
        raise SystemExit(f"{path} is missing — run npm install first.")
    return ImageFont.truetype(str(path), size)


def ground(size):
    """The brand ground: vertical wash plus the lime bloom the app uses."""
    width, height = size
    base = Image.new("RGB", (1, height))
    for y in range(height):
        t = y / max(height - 1, 1)
        base.putpixel((0, y), tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    canvas = base.resize(size)
    bloom = Image.new("L", size, 0)
    draw = ImageDraw.Draw(bloom)
    radius = int(width * 0.52)
    cx, cy = int(width * 0.84), int(height * 0.05)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=20)
    bloom = bloom.filter(ImageFilter.GaussianBlur(int(radius * 0.55)))
    canvas.paste(Image.new("RGB", size, ACCENT), (0, 0), bloom)
    # A flat 8-bit gradient bands visibly on a phone screen; a trace of noise
    # breaks the steps without being visible as grain.
    grain = Image.effect_noise(size, 6).convert("L")
    canvas = Image.blend(canvas, Image.merge("RGB", (grain, grain, grain)), 0.018)
    return canvas


def rounded(image, radius):
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.size[0] - 1, image.size[1] - 1), radius=radius, fill=255)
    out = image.convert("RGBA")
    out.putalpha(mask)
    return out


def device_shot(path, width):
    shot = Image.open(path).convert("RGB")
    scale = shot.size[0] / 1440
    top = round(STATUS_H * scale)
    bottom = shot.size[1] - round(GESTURE_H * scale)
    shot = shot.crop((0, top, shot.size[0], bottom))
    height = round(width * shot.size[1] / shot.size[0])
    return rounded(shot.resize((width, height), Image.Resampling.LANCZOS), RADIUS)


def paste_with_shadow(canvas, image, position):
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    block = Image.new("RGBA", image.size, (0, 0, 0, 150))
    block.putalpha(Image.eval(image.getchannel("A"), lambda v: int(v * 0.58)))
    shadow.paste(block, (position[0], position[1] + 26), block)
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(image.convert("RGBA"), position)
    # A hairline rim keeps the shot from bleeding into the ground.
    rim = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle((0, 0, image.size[0] - 1, image.size[1] - 1), radius=RADIUS, outline=(255, 255, 255, 46), width=2)
    canvas.alpha_composite(rim, position)


def tracked(draw, position, text, fnt, fill, tracking):
    x, y = position
    for character in text:
        draw.text((x, y), character, font=fnt, fill=fill)
        x += draw.textlength(character, font=fnt) + tracking
    return x


def wrap(draw, text, fnt, max_width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=fnt) <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def frame(capture, eyebrow, headline, out_path):
    canvas = ground(CANVAS).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    margin = 84

    eyebrow_font = font(BODY, 27)
    headline_font = font(BOLD, 66)
    tracked(draw, (margin, 128), eyebrow.upper(), eyebrow_font, ACCENT, 3.4)

    lines = wrap(draw, headline, headline_font, CANVAS[0] - margin * 2)
    y = 188
    for line in lines:
        draw.text((margin, y), line, font=headline_font, fill=TEXT)
        y += 76

    shot = device_shot(capture, SHOT_W)
    # The device sits on the same axis in every frame: a listing where the phone
    # jumps up and down between screenshots reads as five separate posters.
    top = 470
    # The shot is centred horizontally and allowed to run off the bottom edge:
    # a phone screen that ends mid-canvas reads as a thumbnail, not a product.
    paste_with_shadow(canvas, shot, ((CANVAS[0] - SHOT_W) // 2, top))
    canvas.convert("RGB").save(out_path, quality=95)


def icon(out_path):
    Image.open(ICON).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS).save(out_path)


def feature_graphic(out_path, capture=None):
    """Play crops this banner hard on some surfaces, so everything that carries
    meaning lives in the left two thirds and the device is decoration."""
    size = (1024, 500)
    canvas = ground(size).convert("RGBA")

    if capture is not None:
        shot = device_shot(capture, 300)
        shot = shot.rotate(-8, expand=True, resample=Image.Resampling.BICUBIC)
        paste_with_shadow(canvas, shot, (700, 92))

    draw = ImageDraw.Draw(canvas)
    mark = rounded(Image.open(ICON).convert("RGB").resize((132, 132), Image.Resampling.LANCZOS), 30)
    canvas.alpha_composite(mark, (78, 92))
    tracked(draw, (80, 52), "FREE · NO ADS · NO PAID REACH", font(BODY, 21), ACCENT, 3.0)

    wordmark_font = font(BOLD, 92)
    draw.text((76, 268), "BINDER", font=wordmark_font, fill=TEXT)
    dot_x = 76 + draw.textlength("BINDER", font=wordmark_font)
    draw.text((dot_x, 268), ".", font=wordmark_font, fill=ACCENT)
    draw.text((80, 386), "Both choose. Then you talk.", font=font(BODY, 33), fill=MUTED)
    canvas.convert("RGB").save(out_path, quality=95)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: store-assets.py <capture-dir> <output-dir>")
    captures = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    made = []
    for capture in sorted(captures.glob("*.png")):
        caption = capture.with_suffix(".txt")
        if caption.exists():
            parts = [line.strip() for line in caption.read_text(encoding="utf8").splitlines() if line.strip()]
            eyebrow = parts[0] if parts else capture.stem
            headline = parts[1] if len(parts) > 1 else capture.stem
        else:
            eyebrow, headline = "Binder", capture.stem.split("-", 1)[-1]
        target = out / f"{capture.stem}.png"
        frame(capture, eyebrow, headline, target)
        made.append(target.name)

    icon(out / "icon-512.png")
    first = sorted(captures.glob("*.png"))
    feature_graphic(out / "feature-graphic-1024x500.png", first[0] if first else None)
    print(f"Wrote {len(made)} phone screenshots plus icon and feature graphic to {out}:")
    for name in made:
        print(f"  {name}")


if __name__ == "__main__":
    main()
