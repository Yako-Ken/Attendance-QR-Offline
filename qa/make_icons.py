"""Generate the PWA icon set from the brand mark.

Kept as a script rather than committed binaries so the icons stay in sync with
the design tokens and the repository stays free of opaque assets.
"""

from pathlib import Path

import segno

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

INK = "#101216"
ACCENT = "#5f9dff"
PAPER = "#f2f5f8"


def qr_matrix() -> tuple[list[list[int]], list[list[int]]]:
    """Two layers: the light structural mark, and the accent scan bar."""
    size = 21
    light = [[0] * size for _ in range(size)]
    accent = [[0] * size for _ in range(size)]

    def finder(grid: list[list[int]], row: int, col: int) -> None:
        for dy in range(7):
            for dx in range(7):
                edge = dy in (0, 6) or dx in (0, 6)
                core = 2 <= dy <= 4 and 2 <= dx <= 4
                grid[row + dy][col + dx] = 1 if (edge or core) else 0

    # Three finder patterns in the corners a reader expects.
    finder(light, 0, 0)
    finder(light, 0, 14)
    finder(light, 14, 0)

    # Timing lines between the top pair and the left pair.
    for i in range(8, 13):
        light[6][i] = i % 2
        light[i][6] = i % 2

    # Alignment pattern, bottom right.
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if max(abs(dx), abs(dy)) != 1:
                light[14 + dy][14 + dx] = 1

    # A clean reading beam across the middle of the data region.
    for i in range(8, 13):
        accent[10][i] = 1
    accent[9][10] = 1
    accent[11][10] = 1
    return light, accent


def render_png(path: Path, size: int, maskable: bool) -> None:
    from PIL import Image, ImageDraw

    light, accent = qr_matrix()
    modules = len(light)
    # Maskable icons need their content inside the safe zone (80% diameter).
    inset = 0.24 if maskable else 0.13
    inner = int(size * (1 - inset * 2))
    cell = max(1, inner // modules)
    drawn = cell * modules
    offset = (size - drawn) // 2

    image = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(image)

    def paint(grid: list[list[int]], colour: str) -> None:
        for r, row in enumerate(grid):
            for c, value in enumerate(row):
                if not value:
                    continue
                x0 = offset + c * cell
                y0 = offset + r * cell
                draw.rectangle([x0, y0, x0 + cell, y0 + cell], fill=colour)

    paint(light, PAPER)
    paint(accent, ACCENT)
    image.save(path, "PNG", optimize=True)
    print(f"wrote {path.name} ({size}x{size}, maskable={maskable})")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render_png(OUT / "icon-192.png", 192, maskable=False)
    render_png(OUT / "icon-512.png", 512, maskable=False)
    render_png(OUT / "maskable-192.png", 192, maskable=True)
    render_png(OUT / "maskable-512.png", 512, maskable=True)
    render_png(OUT.parent / "apple-touch-icon.png", 180, maskable=True)

    # A real, scannable QR pointing at the app icon, used as the favicon fallback.
    qr = segno.make("Attendance QR", error="m")
    qr.save(OUT.parent / "icon-preview.png", scale=6, border=2, dark="#101216", light="#ffffff")
    print("wrote icon-preview.png")


if __name__ == "__main__":
    main()