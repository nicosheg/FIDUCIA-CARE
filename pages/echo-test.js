import { useEffect, useState } from 'react';

export default function EchoTest() {
  const [result, setResult] = useState('Testing...');

  useEffect(() => {
    const form = new FormData();
    form.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt');

    fetch('/api/echo', { method: 'POST', body: form })
      .then(r => r.json())
      .then(data => setResult('✅ SUCCESS: ' + JSON.stringify(data)))
      .catch(err => setResult('❌ FAILED: ' + err.message));
  }, []);

  return (
    <div style={{ padding: 20, textAlign: 'center', marginTop: 50 }}>
      <h1>Echo Test Result</h1>
      <p style={{ fontSize: 18 }}>{result}</p>
    </div>
  );
            }
