// api/ocr.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: 'No image provided' });
  }

  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    console.error('OCR_SPACE_API_KEY is missing');
    return res.status(500).json({ success: false, error: 'OCR service not configured' });
  }

  try {
    // Clean base64
    let base64Image = image;
    if (base64Image.includes(',')) {
      base64Image = base64Image.split(',')[1];
    }
    if (!base64Image) {
      throw new Error('Invalid image data');
    }

    console.log('OCR: image length', base64Image.length);

    const formData = new FormData();
    formData.append('apikey', apiKey);
    formData.append('base64Image', base64Image);
    formData.append('language', 'eng');
    formData.append('OCREngine', '3');
    formData.append('scale', 'true');
    formData.append('isTable', 'true');
    formData.append('detectOrientation', 'true');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    console.log('OCR.space status:', response.status);

    if (!data || data.IsErroredOnProcessing) {
      const errorMsg = data?.ErrorMessage || 'OCR processing failed';
      console.error('OCR error:', errorMsg);
      return res.status(500).json({ success: false, error: errorMsg });
    }

    let fullText = '';
    if (data.ParsedResults && data.ParsedResults.length > 0) {
      data.ParsedResults.forEach(pr => {
        if (pr.ParsedText) fullText += pr.ParsedText + '\n';
      });
    }

    if (!fullText.trim()) {
      return res.status(200).json({
        success: false,
        error: 'No text detected in image. Please try a clearer photo.'
      });
    }

    console.log('Extracted text length:', fullText.length);

    const rows = parseReportText(fullText);
    if (rows.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No rows could be parsed. Raw text snippet: ' + fullText.substring(0, 200)
      });
    }

    return res.status(200).json({ success: true, rows });

  } catch (error) {
    console.error('Unhandled error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
};

function parseReportText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Strategy 1: split by 2+ spaces
  for (const line of lines) {
    const parts = line.split(/\s{2,}/).filter(p => p.length > 0);
    if (parts.length >= 3) {
      const code = parts[0].trim();
      const qtyPart = parts[parts.length - 1].trim();
      const qty = parseInt(qtyPart, 10);
      if (!isNaN(qty) && qty >= 0) {
        const desc = parts.slice(1, -1).join(' ').trim();
        if (code.length > 2 && /^[A-Z0-9]+$/.test(code)) {
          rows.push({ mealCode: code, description: desc || 'Unknown', quantity: qty, confidence: 'high' });
          continue;
        }
      }
    }
  }
  if (rows.length > 0) return deduplicate(rows);

  // Strategy 2: code + trailing number
  for (const line of lines) {
    const codeMatch = line.match(/\b(T3L4\w+|T3L\w+|[A-Z]{2,6}\d*)\b/);
    const numMatch = line.match(/(\d+)$/);
    if (codeMatch && numMatch) {
      const code = codeMatch[1];
      const qty = parseInt(numMatch[1], 10);
      if (!isNaN(qty) && qty >= 0) {
        let desc = line.replace(codeMatch[0], '').replace(numMatch[0], '').trim();
        if (desc === '') desc = line;
        rows.push({ mealCode: code, description: desc.substring(0, 80), quantity: qty, confidence: 'medium' });
      }
    }
  }
  if (rows.length > 0) return deduplicate(rows);

  // Strategy 3: any number at the end
  for (const line of lines) {
    const numMatch = line.match(/(\d+)$/);
    if (numMatch) {
      const qty = parseInt(numMatch[1], 10);
      if (!isNaN(qty) && qty >= 0 && qty < 1000) {
        const codeMatch = line.match(/\b([A-Z]{2,6}\d*)\b/);
        const code = codeMatch ? codeMatch[1] : 'UNKNOWN';
        let desc = line.replace(codeMatch ? codeMatch[0] : '', '').replace(numMatch[0], '').trim();
        if (desc === '') desc = line;
        rows.push({ mealCode: code, description: desc.substring(0, 80), quantity: qty, confidence: 'low' });
      }
    }
  }
  return deduplicate(rows);
}

function deduplicate(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = row.mealCode + '|' + row.description + '|' + row.quantity;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
