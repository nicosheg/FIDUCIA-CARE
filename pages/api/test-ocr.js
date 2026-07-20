import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Create a simple 100x100 white image as a real file
    const tmpDir = '/tmp';
    const tmpFile = path.join(tmpDir, 'test-ocr.png');
    
    // Minimal valid PNG (100x100 white) – base64 encoded
    const whitePixelPNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA' +
      'B3RJTUUH5gEBCwQCMQ0yNQAAAAd0RVh0QXV0aG9yAK4uz6cAAAAIdEVYdERlc2NyaXB0aW9u' +
      'AAD/'.repeat(10) + 'AAAAElFTkSuQmCC',
      'base64'
    );
    fs.writeFileSync(tmpFile, whitePixelPNG);

    const worker = await Tesseract.createWorker('eng');
    const { data } = await worker.recognize(tmpFile);
    await worker.terminate();
    
    // Clean up
    fs.unlinkSync(tmpFile);

    res.status(200).json({ message: 'Tesseract is working', text: data.text });
  } catch (err) {
    res.status(500).json({ error: err.message || err.toString() });
  }
      }
