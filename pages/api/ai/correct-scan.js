export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'No text provided' });

  try {
    const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
    const people = [];
    let pendingPhone = null;

    const isPhoneLike = (str) => {
      const digits = str.replace(/\D/g, '');
      return digits.length >= 8;
    };

    const isHeader = (str) =>
      /^(name|phone|telephone|attendance|date|program|service|total)$/i.test(str);

    for (const line of lines) {
      if (isHeader(line)) continue;

      // If line is mostly a phone number, save it for the next name
      if (isPhoneLike(line) && !/[a-zA-Z]{2,}/.test(line)) {
        pendingPhone = line.replace(/\s/g, '');
        continue;
      }

      // Try to separate a trailing phone number
      const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
      let namePart = line;
      let phonePart = null;

      if (phoneMatch) {
        namePart = phoneMatch[1].trim();
        phonePart = phoneMatch[2].replace(/\s/g, '');
      }

      // Only keep lines that look like a name (at least 2 letters)
      if (namePart.length >= 2 && /[a-zA-Z]{2,}/.test(namePart)) {
        const phone = phonePart || pendingPhone || '';
        if (phone) {
          // Normalize Nigerian numbers
          let normalizedPhone = phone.replace(/[\s\-\/\\|]/g, '');
          if (normalizedPhone.startsWith('0')) normalizedPhone = '+234' + normalizedPhone.substring(1);
          if (normalizedPhone.startsWith('234') && !normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
          
          people.push({
            name: namePart,
            phone: normalizedPhone,
            confidence: namePart.length > 5 ? 90 : 80,
          });
        } else {
          // No phone – lower confidence
          people.push({
            name: namePart,
            phone: '',
            confidence: namePart.length > 7 ? 85 : 75,
          });
        }
        pendingPhone = null;
      }
    }

    // If a phone was left hanging at the end, attach to last person
    if (pendingPhone && people.length > 0) {
      people[people.length - 1].phone = pendingPhone;
      people[people.length - 1].confidence = Math.min(people[people.length - 1].confidence + 5, 100);
    }

    // Remove obvious duplicates
    const unique = [];
    const seen = new Set();
    for (const p of people) {
      const key = `${p.name}|${p.phone}`;
      if (!seen.has(key)) {
        unique.push(p);
        seen.add(key);
      }
    }

    return res.status(200).json({ people: unique });
  } catch (error) {
    console.error('Local correction error:', error);
    return res.status(500).json({ error: error.message });
  }
          }
