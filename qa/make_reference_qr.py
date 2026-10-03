"""Generate reference QR symbols with segno for encoder differential testing.

Writes both a PNG (for jsQR harness validation) and the same module matrix in
`matrixToAscii` format (for cell-by-cell comparison against our own encoder).
"""

import sys
import segno


def to_ascii(matrix, quiet: int = 4) -> str:
    n = len(matrix)
    border = "##" * (n + quiet * 2)
    rows = [border]
    for r in range(n):
        line = "##" * quiet
        for c in range(n):
            line += "##" if matrix[r][c] else ".."
        rows.append(line + "##" * quiet)
    rows.append(border)
    return "\n".join(rows)


def emit(text: str, out_png: str, out_ascii: str, version: int | None = None) -> None:
    kwargs = {"error": "m", "mode": "byte", "boost_error": False}
    if version is not None:
        kwargs["version"] = version
    qr = segno.make(text, **kwargs)
    qr.save(out_png, scale=8, border=4)
    with open(out_ascii, "w", encoding="utf-8") as handle:
        handle.write(to_ascii(qr.matrix))
    print(f"{out_png}: version={qr.version} error={qr.error!r} size={qr.symbol_size()}")


if __name__ == "__main__":
    payload = sys.argv[1] if len(sys.argv) > 1 else "HELLO"
    prefix = sys.argv[2] if len(sys.argv) > 2 else "qa/artifacts/ref"
    emit(payload, f"{prefix}.png", f"{prefix}-ascii.txt")