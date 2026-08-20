// api/ocr.js
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: 'No image provided' });
  }

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
      console.error('OCR Error:', errorMsg);
      return res.status(500).json({ success: false, error: errorMsg });
    }

    // Concatenate all parsed text
    let fullText = '';
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      data.ParsedResults.forEach(pr => {
        if (pr.ParsedText) fullText += pr.ParsedText + '\n';
      });
    }

    // If no text at all, return error
    if (!fullText.trim()) {
      return res.status(500).json({ success: false, error: 'No text detected in image' });
    }

    console.log('OCR full text length:', fullText.length);
    console.log('OCR sample:', fullText.substring(0, 500));

    // Parse the text into structured rows
    const rows = parseReportText(fullText);

    console.log('Parsed rows count:', rows.length);

    // If still no rows, return a more informative error
    if (rows.length === 0) {
      // Return the raw text for debugging (but don't expose full text in production)
      // For now, we'll just return a generic message
      return res.status(200).json({ 
        success: false, 
        error: 'No rows detected. The OCR text could not be parsed. Please try a clearer image.' 
      });
    }

    return res.status(200).json({ success: true, rows });

  } catch (error) {
    console.error('OCR error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error: ' + error.message });
  }
};

/**
 * Aggressive parsing of report text to extract rows.
 * Tries multiple strategies:
 * 1. Split by two or more spaces (table columns)
 * 2. Look for meal code pattern (T3L4..., T3L...) followed by a number at the end
 * 3. Look for any uppercase code and trailing number
 */
function parseReportText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // First pass: try to split by multiple spaces (typical table)
  for (let line of lines) {
    // Split by two or more spaces
    const parts = line.split(/\s{2,}/).filter(p => p.length > 0);
    if (parts.length >= 3) {
      // Assume first part is code, last part is quantity, middle is description
      const code = parts[0].trim();
      const qtyPart = parts[parts.length - 1].trim();
      const qty = parseInt(qtyPart, 10);
      if (!isNaN(qty) && qty >= 0) {
        const descParts = parts.slice(1, parts.length - 1);
        const description = descParts.join(' ').trim();
        // Validate code (must be uppercase letters and digits, length > 2)
        if (/^[A-Z0-9]+$/.test(code) && code.length > 2) {
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
  }

  // If we already have rows, return them
  if (rows.length > 0) {
    return deduplicate(rows);
  }

  // Second pass: more flexible – find meal code pattern and trailing number
  for (let line of lines) {
    // Try to find a typical meal code: T3L4... or T3L... or any uppercase with digits
    const codeMatch = line.match(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6}\d*)\b/);
    // Try to find a number at the end of the line (could be quantity)
    const numMatch = line.match(/(\d+)$/);
    if (codeMatch && numMatch) {
      const code = codeMatch[1];
      const qty = parseInt(numMatch[1], 10);
      if (!isNaN(qty) && qty >= 0) {
        // Remove the code and the number from the line to get description
        let desc = line.replace(codeMatch[0], '').replace(numMatch[0], '').trim();
        // Clean up extra spaces
        desc = desc.replace(/\s{2,}/g, ' ').trim();
        if (desc === '') desc = line;
        rows.push({
          mealCode: code,
          description: desc.substring(0, 80),
          quantity: qty,
          confidence: 'medium'
        });
      }
    }
  }

  // If still no rows, try a last resort: find any line with a number that looks like a quantity
  if (rows.length === 0) {
    for (let line of lines) {
      const numMatch = line.match(/(\d+)$/);
      if (numMatch) {
        const qty = parseInt(numMatch[1], 10);
        if (!isNaN(qty) && qty >= 0 && qty < 1000) { // assume quantity is reasonable
          // Try to extract a code from the line: any uppercase word with digits
          const codeMatch = line.match(/\b([A-Z]{2,6}\d*)\b/);
          const code = codeMatch ? codeMatch[1] : 'UNKNOWN';
          let desc = line.replace(codeMatch ? codeMatch[0] : '', '').replace(numMatch[0], '').trim();
          if (desc === '') desc = line;
          rows.push({
            mealCode: code,
            description: desc.substring(0, 80),
            quantity: qty,
            confidence: 'low'
          });
        }
      }
    }
  }

  return deduplicate(rows);
}

function deduplicate(rows) {
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
