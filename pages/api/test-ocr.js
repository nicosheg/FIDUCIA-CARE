import Tesseract from 'tesseract.js';

export default async function handler(req, res) {
  try {
    const worker = await Tesseract.createWorker('eng');
    // Recognize a tiny 1x1 PNG (just to test initialization)
    const { data } = await worker.recognize(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
    await worker.terminate();
    res.status(200).json({ message: 'Tesseract is working', text: data.text });
  } catch (err) {
    res.status(500).json({ error: err.message || err.toString() });
  }
}
