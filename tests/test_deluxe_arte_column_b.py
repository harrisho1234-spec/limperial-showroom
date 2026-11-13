"""Check that extracting Excel image anchors is row-exact and does not copy costs."""
import io
import json
import runpy
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] /
                          "scripts/extract-deluxe-arte-column-b.py"))
extract = MODULE["extract"]

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"


def fixture_xlsx(filename, pic_col=1, pic_row=3):
    with io.BytesIO() as stream:
        Image.new("RGB", (16, 16), (200, 160, 110)).save(stream, "PNG")
        photo = stream.getvalue()
    workbook = f'<workbook xmlns="{MAIN}" xmlns:r="{OFFICE_REL}"><sheets><sheet name="Deluxe Update Price (2025)" sheetId="1" r:id="rId1"/></sheets></workbook>'
    workbook_rels = f'<Relationships xmlns="{PACKAGE_REL}"><Relationship Id="rId1" Type="{OFFICE_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    sheet = f'<worksheet xmlns="{MAIN}" xmlns:r="{OFFICE_REL}"><sheetData/><drawing r:id="rId2"/></worksheet>'
    sheet_rels = f'<Relationships xmlns="{PACKAGE_REL}"><Relationship Id="rId2" Type="{OFFICE_REL}/drawing" Target="../drawings/drawing1.xml"/></Relationships>'
    drawing = f'<xdr:wsDr xmlns:xdr="{DRAW}" xmlns:a="{A}" xmlns:r="{OFFICE_REL}"><xdr:oneCellAnchor><xdr:from><xdr:col>{pic_col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{pic_row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="rId3"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>'
    drawing_rels = f'<Relationships xmlns="{PACKAGE_REL}"><Relationship Id="rId3" Type="{OFFICE_REL}/image" Target="../media/image1.png"/></Relationships>'
    with zipfile.ZipFile(filename, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, content in {
            "xl/workbook.xml": workbook,
            "xl/_rels/workbook.xml.rels": workbook_rels,
            "xl/worksheets/sheet1.xml": sheet,
            "xl/worksheets/_rels/sheet1.xml.rels": sheet_rels,
            "xl/drawings/drawing1.xml": drawing,
            "xl/drawings/_rels/drawing1.xml.rels": drawing_rels,
            "xl/media/image1.png": photo,
            "xl/secret-costing-dummy.txt": "This confidential costing value MUST NOT be exported."
        }.items():
            z.writestr(name, content)


class ExcelImageImportTest(unittest.TestCase):
    def setup_case(self, root):
        photos = root / "assets/price-reference"
        photos.mkdir(parents=True)
        (photos / "deluxe-arte.json").write_text(
            json.dumps({"kind": "reference_only", "items": [
                {"id": "DA-REF-004", "name": "Roslinda 4 Seater", "priceUsd": 19990}
            ]}), encoding="utf-8")

    def test_row_match_exports_only_photo_without_cost(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.setup_case(root)
            file = root / "source.xlsx"
            fixture_xlsx(file)
            extract(file, root, min_count=1, dry_run=False)
            mapping = json.loads((root / "assets/price-reference/deluxe-arte-row-photos.json").read_text())
            self.assertEqual(mapping["images"], {
                "DA-REF-004": "assets/price-reference/deluxe-arte-row-images/DA-REF-004.webp"
            })
            image = root / mapping["images"]["DA-REF-004"]
            self.assertTrue(image.is_file())
            self.assertLess(image.stat().st_size, 30000)
            self.assertNotIn("cost", json.dumps(mapping).lower())
            self.assertEqual(list((root/"assets/price-reference/deluxe-arte-row-images").glob("*.webp"))[0].name,
                             "DA-REF-004.webp")

    def test_wrong_column_fails_safe_without_photos(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.setup_case(root)
            file = root / "source.xlsx"
            fixture_xlsx(file, pic_col=2)
            with self.assertRaises(ValueError):
                extract(file, root, min_count=1, dry_run=False)
            self.assertFalse((root/"assets/price-reference/deluxe-arte-row-photos.json").exists())

    def test_shifted_row_fails_safe_without_photos(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.setup_case(root)
            file = root / "source.xlsx"
            fixture_xlsx(file, pic_row=4)
            with self.assertRaises(ValueError):
                extract(file, root, min_count=1, dry_run=False)
            self.assertFalse((root/"assets/price-reference/deluxe-arte-row-photos.json").exists())


if __name__ == "__main__":
    unittest.main()
