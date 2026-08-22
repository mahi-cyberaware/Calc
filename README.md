# Calc — Final confirmed browser-only version

No OCR.Space and no API key.

Upload `index.html` to the existing Vercel/GitHub `calc` project.

Confirmed business rules:
- Yoghurt = VBY + CBY
- Coffee = CONTIBF + LASAGN
- Paper Tray / Plate = BUTERC + CPASTA + LASAGN + VBY + CBY + CONTIBF + CHANA + CPOP
- Cutlery = same as Paper Tray / Plate
- Water = Total - KIDSML - standalone WATER 500 ML
- Meal codes are detected generically; the code list is not used to decide whether a row exists.
- One OCR pass per image; rows are anchored by physical EASC coordinates to prevent duplicate rows from multiple OCR passes.
