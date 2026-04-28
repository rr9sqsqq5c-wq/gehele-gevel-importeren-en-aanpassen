import sys
try:
    import pypdf
    reader = pypdf.PdfReader(sys.argv[1])
    for page in reader.pages:
        print(page.extract_text())
    sys.exit(0)
except ImportError:
    pass
try:
    import PyPDF2
    with open(sys.argv[1], 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            print(page.extract_text())
    sys.exit(0)
except ImportError:
    pass
try:
    from pdfminer.high_level import extract_text
    print(extract_text(sys.argv[1]))
    sys.exit(0)
except ImportError:
    pass
print("NO_PDF_LIB")
