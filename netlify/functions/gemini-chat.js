exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const { question, lang } = body;
    if (!question || !question.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Question is required' }) };
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!GEMINI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not configured' }) };
    }

    let context = '';
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const supaUrl = SUPABASE_URL.replace(/\/+$/, '');
        const [propsRes, aiRes] = await Promise.all([
          fetch(`${supaUrl}/rest/v1/properties?select=*&order=id.asc`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          }),
          fetch(`${supaUrl}/rest/v1/ai_knowledge?select=*&order=id.asc`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          }),
        ]);

        if (propsRes.ok) {
          const properties = await propsRes.json();
          if (properties.length) {
            context += '=== PROPERTIES IN DATABASE ===\n';
            properties.forEach((p) => {
              context += `ID:${p.id} | Title: ${p.titleAr} / ${p.titleEn} | Type: ${p.type} | Location: ${p.location} | Price: ${p.price}M EGP | Bedrooms: ${p.beds} | Bathrooms: ${p.baths} | Area: ${p.area}m² | Finish: ${p.finAr} / ${p.finEn} | Description: ${p.descAr} / ${p.descEn} | Status: ${p.status || 'active'}\n`;
            });
            context += '\n';
          }
        }

        if (aiRes.ok) {
          const aiBlocks = await aiRes.json();
          if (aiBlocks.length) {
            context += '=== AI KNOWLEDGE BASE ===\n';
            aiBlocks.forEach((b) => {
              context += `Topic: ${b.topic} | Content: ${b.content} | Status: ${b.status || 'active'}${b.image ? ` | Image: ${b.image}` : ''}\n`;
            });
          }
        }
      } catch (e) {
        context = '(Note: Could not fetch database context.)\n';
      }
    }

    const sysAr = `أنت سليم، المستشار العقاري الحصري لـ Elite Estates في مصر. نبرتك احترافية جداً وفاخرة، تناسب المشترين من الفئة العليا (Class A). استخدم عبارات الضيافة المصرية الدافئة (مثل: يا فندم، تحت أمر سيادتك، أهلاً بك). استخدم ONLY السياق المقدم من قاعدة البيانات أدناه للإجابة. إذا كان العقار مباعاً أو غير متاح، أخبر العميل بلباقة واقترح بدائل نشطة متميزة من البيانات. لا تختلق أو تخترع عقارات غير موجودة في السياق.\n\n${context || 'لا توجد بيانات في قاعدة البيانات حالياً. قدم رداً عاماً مهذباً.'}\n\nتذكر دائماً: أنت سليم، مستشار Elite Estates.`;

    const sysEn = `You are Saleem, the exclusive real estate consultant for Elite Estates in Egypt. Your tone is highly professional, prestigious, and tailored to VIP (Class A) buyers. Use warm Egyptian hospitality phrases. Use ONLY the provided database context below to answer. If a property is sold or unavailable, politely inform the client and suggest other active premium alternatives from the data. Never hallucinate or invent fake properties.\n\n${context || 'No database data available. Reply with a polite general response.'}\n\nAlways remember: You are Saleem, Elite Estates consultant.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${lang === 'ar' ? sysAr : sysEn}\n\nسؤال العميل: ${question}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 600, topP: 0.95, topK: 40 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini API failed', detail: errText }) };
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      (lang === 'ar' ? 'عذراً يا فندم، لم أتمكن من معالجة طلبك حالياً.' : 'Apologies, I could not process your request.');

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error', detail: e.message }) };
  }
};
