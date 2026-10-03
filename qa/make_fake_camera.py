"""Generate a Y4M video containing a scannable QR code.

Chromium's `--use-file-for-fake-video-capture` consumes a raw Y4M stream, so the
browser's real getUserMedia -> MediaStream -> video element path can be driven
with an actual QR symbol. The code is produced by segno, an unrelated encoder,
which also makes this a genuine interoperability test rather than a round trip
through our own writer.
"""

from __future__ import annotations

import sys
from pathlib import Path

import segno
from PIL import Image

# Arabic payloads are printed for the log, and the default Windows console
# encoding cannot represent them.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WIDTH = 640
HEIGHT = 480
FRAMES = 30
FPS = 30

# QR module size and placement inside the frame.
MODULES = 0
CELL = 8
QR_PX = 0



def build_payload(device_id: str, name: str, student_id: str, year: str) -> str:
    import json

    return json.dumps(
        {
            "version": 1,
            "type": "attendance-student",
            "name": name,
            "studentId": student_id,
            "academicYear": year,
            "deviceId": device_id,
        },
        separators=(",", ":"),
    )


def render(payload: str) -> Image.Image:
    qr = segno.make(payload, error="m", boost_error=False)
    image = Image.new("L", (WIDTH, HEIGHT), 235)
    modules = qr.matrix
    cell = CELL
    drawn = cell * len(modules)
    ox = (WIDTH - drawn) // 2
    oy = (HEIGHT - drawn) // 2
    for r, row in enumerate(modules):
        for c, value in enumerate(row):
            if value:
                x0 = ox + c * cell
                y0 = oy + r * cell
                image.paste(0, [x0, y0, x0 + cell, y0 + cell])
    return image


def to_y4m(image: Image.Image, path: Path, frames: int) -> None:
    y_plane = image.tobytes()
    chroma = bytes([128]) * ((WIDTH // 2) * (HEIGHT // 2))
    header = f"YUV4MPEG2 W{WIDTH} H{HEIGHT} F{FPS}:1 Ip A1:1 C420mpeg2\n".encode()
    with path.open("wb") as handle:
        handle.write(header)
        for _ in range(frames):
            handle.write(b"FRAME\n")
            handle.write(y_plane)
            handle.write(chroma)
            handle.write(chroma)


def main() -> None:
    if len(sys.argv) < 6:
        raise SystemExit(
            "usage: make_fake_camera.py <out.y4m> <name> <studentId> <year> <deviceId>"
        )
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload(sys.argv[5], sys.argv[2], sys.argv[3], sys.argv[4])
    render(payload).save(out.with_suffix(".png"))
    to_y4m(render(payload), out, FRAMES)
    print(f"wrote {out} ({WIDTH}x{HEIGHT}, {FRAMES} frames)")
    print(f"payload: {payload}")


if __name__ == "__main__":
    main()