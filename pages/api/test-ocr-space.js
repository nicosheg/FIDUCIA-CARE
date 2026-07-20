export default async function handler(req, res) {
  try {
    const tinyWhiteImage = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA' +
      'B3RJTUUH5gEBCwQCMQ0yNQAAAAd0RVh0QXV0aG9yAK4uz6cAAAAIdEVYdERlc2NyaXB0aW9u' +
      'AAD/'.repeat(10) + 'AAAAElFTkSuQmCC';
      
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Image: `data:image/png;base64,${tinyWhiteImage}`,
        apikey: 'helloworld',
        language: 'eng',
        isOverlayRequired: false,
      }),
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
