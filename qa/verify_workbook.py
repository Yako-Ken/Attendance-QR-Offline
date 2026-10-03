"""Independent verification of an exported attendance workbook.

Parsed with Python's zipfile and xml, so it does not share any code with the
TypeScript writer. Checks the column contract and the privacy rule that the
Device ID and any status column must be absent.
"""

import re
import sys
import zipfile
from pathlib import Path

FORBIDDEN = ["Device ID", "DeviceId", "deviceId", "device_id", "Status", "status"]
EXPECTED_HEADER = ["No.", "Full Name", "Student ID", "Academic Year", "Recorded At"]


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "qa/artifacts/export.xlsx")
    archive = zipfile.ZipFile(path)
    names = archive.namelist()
    print(f"archive: {path.name}")
    print(f"parts ({len(names)}): {', '.join(names)}")

    sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")

    texts = re.findall(r"<t[^>]*>(.*?)</t>", sheet)
    header = texts[: len(EXPECTED_HEADER)]
    print(f"header: {header}")
    print(f"header matches contract: {header == EXPECTED_HEADER}")

    leaked = [token for token in FORBIDDEN if token in sheet]
    print(f"forbidden tokens in sheet: {leaked if leaked else 'none'}")

    uuids = re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", sheet)
    print(f"uuid-shaped strings in sheet: {uuids if uuids else 'none'}")

    rows = re.findall(r"<row r=\"(\d+)\">", sheet)
    print(f"rows (including header): {len(rows)}")

    padded = [value for value in texts if re.fullmatch(r"0\d+", value)]
    print(f"leading-zero identifiers preserved: {padded}")

    hidden = "hidden" in sheet
    print(f"hidden sheet present: {hidden}")

    ok = (
        header == EXPECTED_HEADER
        and not leaked
        and not uuids
        and not hidden
        and len(padded) > 0
    )
    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())