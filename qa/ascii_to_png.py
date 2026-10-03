"""Rasterise the ASCII matrix emitted by the encoder into a PNG.

Used as an independent visual check that the generated symbol is a real,
conformant QR code (finder patterns, timing, quiet zone) rather than a
plausible-looking grid.
"""

import sys
from PIL import Image


def parse(ascii_text: str, quiet: int = 4) -> list[list[int]]:
    """`matrixToAscii` emits one border line top and bottom, and `quiet * 2`
    characters of quiet zone on each side of every data line."""
    rows = [line for line in ascii_text.strip().split("\n") if line]
    data_rows = rows[1:-1]
    pad = quiet * 2
    modules: list[list[int]] = []
    for line in data_rows:
        modules.append(
            [1 if line[2 * c : 2 * c + 2] == "##" else 0 for c in range(quiet, len(line) // 2 - quiet)]
        )
    return modules


def to_png(modules: list[list[int]], scale: int = 8, quiet: int = 4, out: str = "qr.png") -> None:
    n = len(modules)
    side = (n + quiet * 2) * scale
    img = Image.new("L", (side, side), 255)
    px = img.load()
    for r, row in enumerate(modules):
        for c, v in enumerate(row):
            if not v:
                continue
            for dy in range(scale):
                for dx in range(scale):
                    px[(c + quiet) * scale + dx, (r + quiet) * scale + dy] = 0
    img.save(out)
    print(f"wrote {out} ({side}x{side}) modules={n}x{n}")


if __name__ == "__main__":
    data = sys.stdin.read()
    to_png(parse(data), out=sys.argv[1] if len(sys.argv) > 1 else "qr.png")