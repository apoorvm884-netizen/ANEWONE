const backupData = require('../data.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby6pnCxmLpgGeKH-tHYTjwerOlOvLzCVqNyzD2k_rE22VxzYBa5QNY6XEyGVzSaz0bV/exec';
  const PRE_LOAN_TYPES = [
    'login & mobile number registration',
    'kyc issue'
  ];

  function getLoanCategory(type) {
    if (!type) return 'post';
    return PRE_LOAN_TYPES.includes(type.toLowerCase().trim()) ? 'pre' : 'post';
  }

  async function getLiveCleanedData() {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'GET',
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    
    const parsed = await response.json();
    const clean = parsed.filter(row =>
      (row['Type'] && row['Type'].trim() !== '') ||
      (row['Sub Type'] && row['Sub Type'].trim() !== '')
    );

    let lastType = '';
    return clean.map(row => {
      if (row['Type'] && row['Type'].trim() !== '') {
        lastType = row['Type'].trim();
      }
      return {
        type: lastType,
        subType: (row['Sub Type'] || '').trim(),
        preChecks: (row['Pre-checks'] || '').trim(),
        escalationPath: (row['Escalation Path'] || '').trim(),
        loanCategory: getLoanCategory(lastType)
      };
    });
  }

  if (req.method === 'GET') {
    try {
      const finalData = await getLiveCleanedData();
      return res.status(200).json(finalData);
    } catch (e) {
      return res.status(200).json(backupData || { error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ answer: "Query missing" });
      }

      const liveData = await getLiveCleanedData();
      const liveDataString = JSON.stringify(liveData);
      const groqApiKey = process.env.GROQ_API_KEY; 

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-8b-8192", 
          messages: [
            {
              role: "system",
              content: `You are Volt Money's Internal Support AI Assistant. Your job is to guide support agents using the live system data provided below. Always match the agent's query with the "type" or "subType" fields from the data. Provide clear Pre-checks, troubleshooting steps, and the Escalation Path if mentioned. Keep your tone professional yet natural (Hinglish or professional English is preferred). If the query is completely missing from the data, politely say that you couldn't find it in the current system manual.\n\nLIVE SYSTEM DATA:\n${liveDataString}`
            },
            { role: "user", content: query }
          ],
          temperature: 0.2
        })
      });

      const aiData = await groqResponse.json();
      
      if (aiData.choices && aiData.choices[0]) {
        const aiAnswer = aiData.choices[0].message.content;
        return res.status(200).json({ answer: aiAnswer });
      } else {
        return res.status(500).json({ answer: "AI Error" });
      }

    } catch (error) {
      return res.status(500).json({ answer: "Error: " + error.message });
    }
  }
};
