#!/usr/bin/env python3
"""Extract only Column B embedded photos from Deluxe Arte Excel and map by exact row.

No costing, shipping, formulas, or hidden-sheet data is exported.
Input file is READ-ONLY. Output contains compressed WebP photos and a map of
DA-REF-### -> image path, matching the existing selling-price-only snapshot.

Usage:
  python -m pip install Pillow
  python scripts/extract-deluxe-arte-column-b.py \
    "/path/to/Deluxe Arte (Price Structure)(1).xlsx" --repo-root .

The workbook must contain tab "Deluxe Update Price (2025)".
Only B-column anchored images in rows named by deluxe-arte.json are exported.
"""
import argparse
import io
import json
import posixpath
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
DRAW_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
SHEET_NAME = "Deluxe Update Price (2025)"


def archive_target(base: str, target: str) -> str:
    # Absolute Office relationship paths must remain *inside* the ZIP.
    if target.startswith("/"):
        result = target.lstrip("/")
    elif target.startswith("xl/"):
        result = target
    else:
        result = posixpath.normpath(posixpath.join(posixpath.dirname(base), target))
    if not result.startswith("xl/") or ".." in result.split("/"):
        raise ValueError(f"Unsafe Excel archive relationship target: {target!r}")
    return result


def relationships(zf: zipfile.ZipFile, parent: str):
    d, basename = posixpath.split(parent)
    rels = posixpath.join(d, "_rels", basename + ".rels")
    if rels not in zf.namelist():
        return {}
    root = ET.fromstring(zf.read(rels))
    return {
        child.attrib["Id"]: (child.attrib.get("Target", ""), child.attrib.get("Type", ""))
        for child in root.findall(f"{{{PKG_REL}}}Relationship")
        if child.attrib.get("TargetMode") != "External"
    }


def find_target_sheet(zf: zipfile.ZipFile):
    root = ET.fromstring(zf.read("xl/workbook.xml"))
    refs = relationships(zf, "xl/workbook.xml")
    matches = [
        el for el in root.findall(f".//{{{MAIN}}}sheet")
        if el.attrib.get("name") == SHEET_NAME
    ]
    if len(matches) != 1:
        names = [el.attrib.get("name") for el in root.findall(f".//{{{MAIN}}}sheet")]
        raise ValueError(f"Couldn't find tab {SHEET_NAME!r}. Workbook tabs: {names!r}")
    rel_id = matches[0].attrib.get(f"{{{OFFICE_REL}}}id", "")
    if rel_id not in refs:
        raise ValueError("The target sheet is missing its workbook relationship")
    return archive_target("xl/workbook.xml", refs[rel_id][0])


def target_drawings(zf: zipfile.ZipFile, sheet_part: str):
    root = ET.fromstring(zf.read(sheet_part))
    rels = relationships(zf, sheet_part)
    for el in root.findall(f".//{{{MAIN}}}drawing"):
        rel_id = el.attrib.get(f"{{{OFFICE_REL}}}id", "")
        if rel_id in rels:
            target = archive_target(sheet_part, rels[rel_id][0])
            if target in zf.namelist():
                yield target


def pictures_by_row(zf: zipfile.ZipFile, sheet_part: str):
    result = defaultdict(list)
    for drawing_path in target_drawings(zf, sheet_part):
        drawing = ET.fromstring(zf.read(drawing_path))
        image_relationships = relationships(zf, drawing_path)
        for anchor in list(drawing):
            anchor_type = anchor.tag.split("}")[-1]
            if anchor_type not in ("oneCellAnchor", "twoCellAnchor"):
                continue  # absolute-positioned images have no reliable row link
            origin = anchor.find(f"{{{DRAWING}}}from")
            if origin is None:
                continue
            row_el = origin.find(f"{{{DRAWING}}}row")
            col_el = origin.find(f"{{{DRAWING}}}col")
            if row_el is None or col_el is None:
                continue
            try:
                row_no, col_no = int(row_el.text) + 1, int(col_el.text)
            except (TypeError, ValueError):
                continue
            if col_no != 1:  # Column B is zero-based index 1
                continue
            pics = anchor.findall(f"{{{DRAWING}}}pic")
            for pic in pics:
                blip = pic.find(f".//{{{DRAW_A}}}blip")
                if blip is None:
                    continue
                r_id = blip.attrib.get(f"{{{OFFICE_REL}}}embed", "")
                rel = image_relationships.get(r_id)
                if not rel or not rel[1].endswith("/image"):
                    continue
                media_path = archive_target(drawing_path, rel[0])
                if media_path in zf.namelist():
                    result[row_no].append(media_path)
    return result


def convert_image(data: bytes, destination: Path):
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise RuntimeError("Install Pillow first: python -m pip install Pillow") from exc
    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((1050, 1050), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        elif image.mode == "L":
            image = image.convert("RGB")
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=81, method=5)
        return image.width, image.height


def extract(source: Path, repo: Path, min_count: int, dry_run: bool):
    if not source.is_file():
        raise FileNotFoundError(source)
    sales_data = json.loads(
        (repo / "assets/price-reference/deluxe-arte.json").read_text(encoding="utf-8")
    )
    if sales_data.get("kind") != "reference_only":
        raise ValueError("Expected selling-price-only Deluxe Arte reference JSON")
    expected = {int(item["id"].split("-")[-1]): item["id"] for item in sales_data["items"]}
    if len(expected) != len(sales_data["items"]):
        raise ValueError("Duplicate reference row IDs")
    with zipfile.ZipFile(source) as zf:
        # Read only the selected worksheet's drawing parts and referenced B images.
        # Avoid testzip(): it inflates every other (possibly private) workbook part.
        sheet = find_target_sheet(zf)
        anchors = pictures_by_row(zf, sheet)
        matches = {row: parts for row, parts in anchors.items() if row in expected}
        ambiguous = {row: parts for row, parts in matches.items() if len(parts) != 1}
        missing = sorted(set(expected) - set(matches))
        print(f"Sheet: {sheet}")
        print(f"References: {len(expected)} | unique image anchors: {len(matches)-len(ambiguous)}")
        print(f"Missing image rows: {missing[:35]}")
        if ambiguous:
            print(f"Multiple pictures at same B-row: {ambiguous}")
        if len(matches) - len(ambiguous) < min_count:
            raise ValueError(
                f"Only {len(matches)-len(ambiguous)} unambiguous Column B photos found; "
                f"minimum {min_count}. Stopping to prevent incorrect design assignments."
            )
        if dry_run:
            return
        out_dir = repo / "assets/price-reference/deluxe-arte-row-images"
        images = {}
        errors = {}
        for row, parts in sorted(matches.items()):
            if len(parts) != 1:
                continue
            ref = expected[row]
            relative = f"assets/price-reference/deluxe-arte-row-images/{ref}.webp"
            destination = repo / relative
            try:
                convert_image(zf.read(parts[0]), destination)
                images[ref] = relative
            except Exception as exc:
                errors[ref] = str(exc)
        if len(images) < min_count:
            raise ValueError(
                f"Converted only {len(images)} photos: {errors}. "
                "Check source image formats before releasing."
            )
        # Separate sale-facing manifest: never read/export Euro costing columns.
        manifest = {
            "kind": "deluxe_arte_row_photos",
            "version": 1,
            "imageCount": len(images),
            "images": images,
        }
        target = repo / "assets/price-reference/deluxe-arte-row-photos.json"
        target.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"Saved {len(images)} verified B-column photos")
        print(f"Manifest: {target}")
        if missing:
            print(f"Unmapped reference rows: {missing}")
        if errors:
            print(f"Image conversion errors: {errors}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--min-images", type=int, default=175)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        extract(args.workbook, args.repo_root, args.min_images, args.dry_run)
    except (ValueError, RuntimeError, FileNotFoundError, zipfile.BadZipFile) as err:
        print(f"ERROR: {err}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
