module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });

  const GROQ_API_KEY = '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';
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwAqD2jfG2cKo7K7LojTWweEFPinjhQYVsgYA9wPHOCHRIJIw-QQdin59l9dgPMmkbk/exec';

  try {
    const sheetRes = await fetch(APPS_SCRIPT_URL, { redirect: 'follow' });
    const sheetData = await sheetRes.json();

    const context = sheetData.map(row =>
      `Type: ${row.type || ''}
SubType: ${row.subType || ''}
Pre-checks: ${row.preChecks || ''}
Escalation Path: ${row.escalationPath || ''}
Extra Details: ${row.extraDetails || ''}`
    ).join('\n\n---\n\n');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: `You are a helpful support assistant for Volt Money. You help support agents resolve customer issues.
Answer ONLY based on the support manual data provided below.
Give clear, friendly, step-by-step answers in simple Hindi or English (match the language of the question).
If the answer is not in the manual, say: "Yeh issue manual mein nahi mila. Please escalate to your team lead."
Never make up information.

Support Manual Data:
${context}`
          },
          { role: 'user', content: question }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    const groqData = await groqRes.json();
    const answer = groqData.choices?.[0]?.message?.content || 'Koi answer nahi mila.';
    return res.status(200).json({ answer });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
