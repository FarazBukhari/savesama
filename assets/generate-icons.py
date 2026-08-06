#!/usr/bin/env python3
"""
Regenerates SaveSama's icon set.

The mark is a download arrow dropping into an open tray: the app takes media
off a page and puts it on your device, and that is the whole idea. It replaces
the old fox head, which said who made the app rather than what it does — the
fox now lives in the developer name instead.

Everything is drawn at 4x and downsampled, which is cheaper than hand-tuning
anti-aliasing and keeps the edges clean at launcher sizes.

Run:  python3 assets/generate-icons.py
"""

from PIL import Image, ImageDraw

REF = 1024
SS = 4  # supersampling factor

GROUND = (23, 18, 16, 255)  # #171210 — the dark theme's ground, warmed
GLYPH = (255, 122, 61, 255)  # #FF7A3D — the dark theme accent
WHITE = (255, 255, 255, 255)


def draw_glyph(img: Image.Image, colour, scale: float) -> None:
    """
    Draws the arrow-into-tray mark centred on `img`.

    `scale` is relative to a 1024 reference where the mark stands 590 tall.
    Android's adaptive foreground only guarantees the middle 66% is visible,
    so the foreground layer passes a smaller scale than the full icon does.
    """
    d = ImageDraw.Draw(img)
    w, h = img.size
    cx, cy = w / 2, h / 2
    u = (w / REF) * scale  # one reference unit in output pixels

    def X(v):
        return cx + (v - 512) * u

    def Y(v):
        return cy + (v - 512) * u

    # Arrow shaft — a rounded bar so the mark reads as drawn, not clip-arted.
    shaft_w = 92
    d.rounded_rectangle(
        [X(512 - shaft_w / 2), Y(196), X(512 + shaft_w / 2), Y(512)],
        radius=(shaft_w / 2) * u,
        fill=colour,
    )

    # Arrowhead — solid, because a chevron of this weight muddies at 48dp.
    d.polygon(
        [(X(356), Y(452)), (X(668), Y(452)), (X(512), Y(650))],
        fill=colour,
    )

    # Tray — an open U, drawn as three capsules so the corners stay round
    # without needing a stroked path.
    #
    # A version with the walls tapered into fox ears was tried and thrown away:
    # at launcher size the ears fused with the walls and the whole thing read as
    # a filled envelope. The brand lives in the name; the icon's job is to be
    # unmistakable at 48dp.
    tray_t = 84  # stroke thickness
    left, right = 288, 736
    top, bottom = 606, 800
    r = (tray_t / 2) * u
    # left wall
    d.rounded_rectangle(
        [X(left), Y(top), X(left + tray_t), Y(bottom)], radius=r, fill=colour
    )
    # right wall
    d.rounded_rectangle(
        [X(right - tray_t), Y(top), X(right), Y(bottom)], radius=r, fill=colour
    )
    # base
    d.rounded_rectangle(
        [X(left), Y(bottom - tray_t), X(right), Y(bottom)], radius=r, fill=colour
    )


def render(size: int, *, background, colour, scale: float) -> Image.Image:
    big = Image.new('RGBA', (size * SS, size * SS), background or (0, 0, 0, 0))
    draw_glyph(big, colour, scale)
    return big.resize((size, size), Image.LANCZOS)


def main() -> None:
    here = __file__.rsplit('/', 1)[0]

    # Full icon: iOS masks it, so the ground runs edge to edge.
    render(1024, background=GROUND, colour=GLYPH, scale=0.80).save(f'{here}/icon.png')

    # Adaptive foreground. The safe zone is the middle 66%, i.e. a 683px circle
    # on this canvas; at this scale the mark's diagonal is ~616px, so it fills
    # the launcher's circular mask properly without risking a clip.
    render(1024, background=None, colour=GLYPH, scale=0.82).save(
        f'{here}/android-icon-foreground.png'
    )

    # Themed icons key off this layer's alpha only, so it ships solid white.
    render(1024, background=None, colour=WHITE, scale=0.82).save(
        f'{here}/android-icon-monochrome.png'
    )

    # Kept for parity with the adaptive background colour in app.json.
    Image.new('RGBA', (1024, 1024), GROUND).save(f'{here}/android-icon-background.png')

    render(1024, background=None, colour=GLYPH, scale=0.70).save(
        f'{here}/splash-icon.png'
    )
    render(48, background=GROUND, colour=GLYPH, scale=0.72).save(f'{here}/favicon.png')

    print('wrote icon.png, android-icon-{foreground,monochrome,background}.png, '
          'splash-icon.png, favicon.png')


if __name__ == '__main__':
    main()
