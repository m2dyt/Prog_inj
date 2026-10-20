import os
import glob
from docx2pdf import convert

reports = [
    "ProgInzh_LR1_Энгельгардт.docx",
    "ProgInzh_LR1_Прохоров.docx",
    "ProgInzh_LR1_Кочетков.docx",
    "ProgInzh_LR2_Энгельгардт.docx",
    "ProgInzh_LR2_Прохоров.docx",
    "ProgInzh_LR2_Кочетков.docx",
    "ProgInzh_LR3_Энгельгардт.docx",
    "ProgInzh_LR3_Прохоров.docx",
    "ProgInzh_LR3_Кочетков.docx",
]

for docx_path in reports:
    pdf_path = docx_path.replace(".docx", ".pdf")
    print(f"Converting {docx_path} -> {pdf_path}...")
    try:
        convert(docx_path, pdf_path)
        print(f"SUCCESS: {pdf_path} ({os.path.getsize(pdf_path)} bytes)")
    except Exception as e:
        print(f"ERROR converting {docx_path}: {e}")

print("All conversions complete!")
