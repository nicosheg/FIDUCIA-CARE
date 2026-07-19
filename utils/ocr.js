import Tesseract from 'tesseract.js';

export async function extractNamesFromImage(imageUrl) {
  const worker = await Tesseract.createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+ ',
    preserve_interword_spaces: '1',
  });
  const { data: { text } } = await worker.recognize(imageUrl);
  await worker.terminate();

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(/\s+/);
    if (parts.length === 1) return { first_name: parts[0], last_name: '' };
    return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
  });
}
