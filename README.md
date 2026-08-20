# Buy Online Report Counter v2 — Browser OCR only

No OCR.Space. No API key. No backend.

## Business rules
- Yoghurt: ONLY VBY + CBY. GYOG is excluded.
- Water: Total minus KIDSML and standalone 500ml WATER.
- Coffee: CONTIBF.
- Paper Tray/Plate and Cutlery: ONLY configured hot meal codes.
- Sandwich/SW codes are excluded from tray/cutlery.
- GYOG, MINIDO, FRUITS are excluded from tray/cutlery.
- HALOUM is excluded even though its description contains the word HOT.

Hot meal codes configured from the supplied reports:
BUTERC, RAJMA, CPASTA, CBY, CHANA, CNOODL, CPOP, JAINVG, CONTIBF, EGGPIE.

The parser itself is not limited to these codes: new meal codes are still detected as normal rows. The hot-meal classification is deliberately restricted to the operational rules above.

## Deploy
Upload `index.html` to the existing `calc` GitHub repository and let Vercel redeploy. No environment variables are required.

The browser downloads Tesseract.js from jsDelivr, so internet access is required.
