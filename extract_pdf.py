import fitz
import sys

def extract_pdf_data(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text() + "\n---PAGE_BREAK---\n"
    print(text)

if __name__ == "__main__":
    pdf_path = r"C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1\.zenflow-attachments\1cdf0a80-160b-4273-b054-fafdb51c5170.pdf"
    extract_pdf_data(pdf_path)