# Buy Online Report Counter — NO OCR API

This version does NOT use OCR.Space.

It uses Tesseract.js directly in the browser.

## Important

There is:
- no OCR API key
- no server
- no backend
- no OCR.Space account

The browser downloads Tesseract.js and English language data from jsDelivr the first time it is used.

An internet connection is therefore required when the OCR library/language data is not already cached.

## GitHub / Vercel

This can be deployed as a static site.

Put `index.html` in the GitHub repository `calc`.

No environment variables are required.

Vercel can deploy it as a normal static site.

## Daily workflow

1. Open your Vercel URL on iPhone.
2. Upload one or more Buy Online Report photos.
3. Confirm the thumbnails appear.
4. Tap Calculate.
5. Browser OCR reads the report.
6. Review detected rows if necessary.
7. Copy the six final counts.

## Business logic

Total:
sum of all detected report rows.

Water:
Total minus KIDSML and standalone 500ml WATER rows.

Yoghurt:
yoghurt rows are detected by known codes and by descriptions containing YOGHURT/YOGURT.

Coffee:
coffee rows are detected by known codes and descriptions containing COFFEE.

Paper Tray / Plate:
hot-meal rows are detected using known hot-meal codes plus description-based rules.

Cutlery:
same hot-meal count.

The meal-code parser is NOT limited to a fixed list of all possible meal codes. It reads the meal code from the report row after the EASC code.
