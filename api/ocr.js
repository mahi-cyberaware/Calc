// api/ocr.js
module.exports = async (req, res) => {
  // Enable CORS for all origins (optional, but helpful for local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Extract the base64 image from the request body
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: 'No image provided' });
  }

  // Get OCR.space API key from environment variables
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    console.error('OCR_SPACE_API_KEY environment variable is missing');
    return res.status(500).json({ success: false, error: 'OCR service not configured' });
  }

  try {
    // Prepare form data for OCR.space
    const formData = new FormData();
    formData.append('apikey', apiKey);
    // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
    const base64Image = image.split(',')[1] || image;
    formData.append('base64Image', base64Image);
    formData.append('language', 'eng');
    formData.append('OCREngine', '3');      // Engine 3 is best for tables
    formData.append('scale', 'true');
    formData.append('isTable', 'true');     // Tell OCR it's a table
    formData.append('detectOrientation', 'true');

    // Call OCR.space API
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    // Check for OCR errors
    if (!data || data.IsErroredOnProcessing) {
      const errorMsg = data?.ErrorMessage || 'OCR processing error';
      return res.status(500).json({ success: false, error: errorMsg });
    }

    // Concatenate all parsed text
    let fullText = '';
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      data.ParsedResults.forEach(pr => {
        if (pr.ParsedText) fullText += pr.ParsedText + '\n';
      });
    }

    // Parse the text into structured rows
    let rows = parseReportText(fullText);

    // Fallback: if no rows found, try to extract any line with a trailing number
    if (rows.length === 0) {
      const lines = fullText.split('\n').filter(line => line.trim().length > 0);
      lines.forEach(line => {
        const matches = line.match(/(\d+)$/);
        if (matches) {
          const qty = parseInt(matches[1], 10);
          const codeMatch = line.match(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6})\b/);
          const mealCode = codeMatch ? codeMatch[1] : 'UNKNOWN';
          let desc = line.replace(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6})\b/, '').replace(/\d+$/, '').trim();
          if (desc === '') desc = line;
          rows.push({
            mealCode,
            description: desc.substring(0, 80),
            quantity: qty,
            confidence: 'low'
          });
        }
      });
    }

    return res.status(200).json({ success: true, rows });

  } catch (error) {
    console.error('OCR error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * Parse the OCR text into structured rows.
 * Tries to split by multiple spaces (typical table format) and then
 * falls back to regex pattern matching.
 */
function parseReportText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (let line of lines) {
    // Split by two or more spaces to separate columns
    const parts = line.split(/\s{2,}/).filter(p => p.length > 0);
    if (parts.length >= 3) {
      const code = parts[0].trim();
      const qtyPart = parts[parts.length - 1].trim();
      const qty = parseInt(qtyPart, 10);
      if (!isNaN(qty) && qty >= 0) {
        const descParts = parts.slice(1, parts.length - 1);
        const description = descParts.join(' ').trim();
        // Validate that the code looks like a meal code (uppercase letters and digits)
        if (code.length > 2 && /^[A-Z0-9]+$/.test(code)) {
          rows.push({
            mealCode: code,
            description: description || 'Unknown',
            quantity: qty,
            confidence: 'high'
          });
          continue;
        }
      }
    }

    // Fallback: find a code and a trailing number
    const codeMatch = line.match(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6}\d*)\b/);
    const numMatch = line.match(/(\d+)$/);
    if (codeMatch && numMatch) {
      const code = codeMatch[1];
      const qty = parseInt(numMatch[1], 10);
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

  // Deduplicate rows (same code, description, quantity)
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
