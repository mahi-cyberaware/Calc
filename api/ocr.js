// api/ocr.js
const fetch = require('node-fetch'); // Vercel includes this, but we'll use it if needed

module.exports = async (req, res) => {
  // Allow CORS for development (optional)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { image, page } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: 'No image provided' });
  }

  // Get OCR API key from environment
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    console.error('OCR_SPACE_API_KEY not set');
    return res.status(500).json({ success: false, error: 'OCR service not configured' });
  }

  try {
    // Prepare the request to OCR.space
    const formData = new FormData();
    formData.append('apikey', apiKey);
    formData.append('base64Image', image.split(',')[1]); // remove data:image/jpeg;base64,
    formData.append('language', 'eng');
    formData.append('OCREngine', '3'); // Engine 3 is better for tables
    formData.append('scale', 'true');
    formData.append('isTable', 'true'); // hint for table detection
    formData.append('detectOrientation', 'true');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!data || data.IsErroredOnProcessing) {
      const errorMsg = data?.ErrorMessage || 'OCR processing error';
      return res.status(500).json({ success: false, error: errorMsg });
    }

    // Extract parsed text from all pages
    let fullText = '';
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      data.ParsedResults.forEach(pr => {
        if (pr.ParsedText) fullText += pr.ParsedText + '\n';
      });
    }

    // Parse rows from the text
    const rows = parseReportText(fullText);

    // If no rows found, try fallback: treat each line as a row if it contains numbers
    if (rows.length === 0) {
      // fallback: split by newline, try to find lines with a quantity at the end
      const lines = fullText.split('\n').filter(line => line.trim().length > 0);
      lines.forEach(line => {
        // Try to extract quantity (last number in line)
        const matches = line.match(/(\d+)$/);
        if (matches) {
          const qty = parseInt(matches[1], 10);
          // Extract meal code: look for pattern like T3L4... or any uppercase code
          const codeMatch = line.match(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6})\b/);
          const mealCode = codeMatch ? codeMatch[1] : 'UNKNOWN';
          // Description is the rest
          let desc = line.replace(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6})\b/, '').replace(/\d+$/, '').trim();
          if (desc === '') desc = line;
          rows.push({
            mealCode: mealCode,
            description: desc.substring(0, 80),
            quantity: qty,
            confidence: 'low' // because fallback
          });
        }
      });
    }

    // If still no rows, return empty
    return res.status(200).json({ success: true, rows });

  } catch (error) {
    console.error('OCR error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Parse the OCR text into structured rows.
 * Looks for lines that contain a meal code and a quantity.
 */
function parseReportText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Try to find table-like structures: columns separated by multiple spaces or tabs
  // We'll attempt to match patterns like:
  //   T3L4S075   ZINGER   CHICKEN ZINGER SANDWICH, WATER   17
  // Or:
  //   T3L4D123   BUTERC   BUTTER CHICKEN, JEERA RICE, WATER BOL   2

  // First, try to split by two or more spaces
  for (let line of lines) {
    // Remove extra spaces and split by multiple spaces
    const parts = line.split(/\s{2,}/).filter(p => p.length > 0);
    if (parts.length >= 3) {
      // Assume the first part is the code, last part is quantity, middle is description
      const code = parts[0].trim();
      const qtyPart = parts[parts.length-1].trim();
      const qty = parseInt(qtyPart, 10);
      if (!isNaN(qty) && qty >= 0) {
        // Description is everything between code and quantity
        const descParts = parts.slice(1, parts.length-1);
        const description = descParts.join(' ').trim();
        // Validate code pattern (optional)
        if (code.length > 2 && /^[A-Z0-9]+$/.test(code)) {
          rows.push({
            mealCode: code,
            description: description || 'Unknown',
            quantity: qty,
            confidence: 'high' // because we used table splitting
          });
          continue;
        }
      }
    }

    // Fallback: try to find a line that has a meal code and a trailing number
    // Example: "T3L4S075 ZINGER CHICKEN ZINGER SANDWICH, WATER 17"
    const codeMatch = line.match(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6}\d*)\b/);
    const numMatch = line.match(/(\d+)$/);
    if (codeMatch && numMatch) {
      const code = codeMatch[1];
      const qty = parseInt(numMatch[1], 10);
      // Remove code and quantity to get description
      let desc = line.replace(codeMatch[0], '').replace(numMatch[0], '').trim();
      if (desc === '') desc = line;
      rows.push({
        mealCode: code,
        description: desc.substring(0, 80),
        quantity: qty,
        confidence: 'medium'
      });
    }
  }

  // Deduplicate rows that have same code and description and quantity (maybe duplicate OCR)
  const unique = [];
  const seen = new Set();
  rows.forEach(row => {
    const key = row.mealCode + '|' + row.description + '|' + row.quantity;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  });

  return unique;
}
