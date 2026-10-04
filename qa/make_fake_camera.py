"""Generate a Y4M video containing a scannable, rotating QR code.

Chromium's `--use-file-for-fake-video-capture` consumes a raw Y4M stream, so the
browser's real getUserMedia -> MediaStream -> video element path can be driven
with an actual QR symbol. The code is produced by segno, an unrelated encoder,
which also makes this a genuine interoperability test rather than a round trip
through our own writer.

The clip rotates its payload on the same cadence a student phone does. The app
refuses a code older than `QR_MAX_AGE_MS`, so a single frozen symbol would expire
part-way through a long run and the scanner would correctly reject it.
"""

from __future__ import annotations

import math
import sys
import time
from pathlib import Path

import segno
from PIL import Image

# Arabic payloads are printed for the log, and the default Windows console
# encoding cannot represent them.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WIDTH = 640
HEIGHT = 480
FPS = 5
# Must match the student's rotation interval; a slower clip would leave the code
# on screen for longer than the app is willing to accept it.
ROTATION_MS = 5000
SECONDS = 40

# QR module size and placement inside the frame.
MODULES = 0
CELL = 8
QR_PX = 0

# The clip is written immediately before the browser starts and plays back in
# real time, so each code reaches the lens at roughly the moment it was stamped.
LEAD_MS = 0


def build_payload(
    device_id: str, name: str, student_id: str, year: str, issued_at: int
) -> str:
    import json

    return json.dumps(
        {
            "version": 1,
            "type": "attendance-student",
            "name": name,
            "studentId": student_id,
            "academicYear": year,
            "deviceId": device_id,
            "issuedAt": issued_at,
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


def to_y4m(plan: list[tuple[Image.Image, int]], path: Path) -> int:
    """Write frames in order; `plan` is a list of (image, repeat_count) pairs."""
    chroma = bytes([128]) * ((WIDTH // 2) * (HEIGHT // 2))
    header = f"YUV4MPEG2 W{WIDTH} H{HEIGHT} F{FPS}:1 Ip A1:1 C420mpeg2\n".encode()
    total = sum(repeat for _, repeat in plan)
    with path.open("wb") as handle:
        handle.write(header)
        for image, repeat in plan:
            y_plane = image.tobytes()
            for _ in range(repeat):
                handle.write(b"FRAME\n")
                handle.write(y_plane)
                handle.write(chroma)
                handle.write(chroma)

    return total


def main() -> None:
    if len(sys.argv) < 6:
        raise SystemExit(
            "usage: make_fake_camera.py <out.y4m> <name> <studentId> <year> <deviceId>"
        )
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)

    device_id, name, student_id, year = (
        sys.argv[5],
        sys.argv[2],
        sys.argv[3],
        sys.argv[4],
    )

    started = int(time.time() * 1000) + LEAD_MS
    frames_per_code = max(1, round(ROTATION_MS / 1000 * FPS))
    rotations = math.ceil(SECONDS * FPS / frames_per_code)

    plan = [
        (
            render(build_payload(device_id, name, student_id, year, started + i * ROTATION_MS)),
            frames_per_code,
        )
        for i in range(rotations)
    ]

    first = build_payload(device_id, name, student_id, year, started)
    render(first).save(out.with_suffix(".png"))
    total = to_y4m(plan, out)

    print(
        f"wrote {out} ({WIDTH}x{HEIGHT}, {total} frames, {SECONDS}s,"
        f" rotating every {ROTATION_MS}ms)"
    )
    print(f"payload: {first}")


if __name__ == "__main__":
    main()