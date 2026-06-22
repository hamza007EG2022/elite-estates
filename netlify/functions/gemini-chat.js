const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { question, lang } = JSON.parse(event.body || '{}');
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
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const [propsRes, aiRes] = await Promise.all([
          supabase.from('properties').select('*').order('id', { ascending: true }),
          supabase.from('ai_knowledge').select('*').order('id', { ascending: true }),
        ]);

        const properties = propsRes.data || [];
        const aiBlocks = aiRes.data || [];

        if (properties.length) {
          context += '=== PROPERTIES IN DATABASE ===\n';
          properties.forEach((p) => {
            const status = p.status || 'active';
            context += `ID:${p.id} | Title: ${p.titleAr} / ${p.titleEn} | Type: ${p.type} | Location: ${p.location} | Price: ${p.price}M EGP | Bedrooms: ${p.beds} | Bathrooms: ${p.baths} | Area: ${p.area}m² | Finish: ${p.finAr} / ${p.finEn} | Description: ${p.descAr} / ${p.descEn} | Status: ${status} | Images: ${(p.images || []).join(', ')}\n`;
          });
          context += '\n';
        }

        if (aiBlocks.length) {
          context += '=== AI KNOWLEDGE BASE ===\n';
          aiBlocks.forEach((b) => {
            const status = b.status || 'active';
            context += `Topic: ${b.topic} | Content: ${b.content} | Status: ${status}${b.image ? ` | Image: ${b.image}` : ''}\n`;
          });
          context += '\n';
        }
      } catch (e) {
        context = '(Note: Could not fetch database context. Answer generally.)\n';
      }
    }

    const systemInstruction = lang === 'ar'
      ? `أنت سليم، المستشار العقاري الحصري لـ Elite Estates في مصر. نبرتك احترافية جداً وفاخرة، تناسب المشترين من الفئة العليا (Class A). استخدم عبارات الضيافة المصرية الدافئة (مثل: يا فندم، تحت أمر سيادتك، أهلاً بك). استخدم ONLY السياق المقدم من قاعدة البيانات أدناه للإجابة. إذا كان العقار مباعاً أو غير متاح، أخبر العميل بلباقة واقترح بدائل نشطة متميزة من البيانات. لا تختلق أو تخترع عقارات غير موجودة في السياق.

${context ? `قاعدة البيانات المتاحة:\n${context}` : 'لا توجد بيانات في قاعدة البيانات حالياً. قدم رداً عاماً مهذباً.'}

تذكر دائماً: أنت سليم، مستشار Elite Estates.`
      : `You are Saleem, the exclusive real estate consultant for Elite Estates in Egypt. Your tone is highly professional, prestigious, and tailored to VIP (Class A) buyers. Use warm Egyptian hospitality phrases (e.g., "Welcome, sir", "At your service"). Use ONLY the provided database context below to answer. If a property is sold or unavailable, politely inform the client and suggest other active premium alternatives from the data. Never hallucinate or invent fake properties.

${context ? `Available database context:\n${context}` : 'No database data available. Reply with a polite general response.'}

Always remember: You are Saleem, Elite Estates consultant.`;

    const requestBody = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600,
        topP: 0.95,
        topK: 40,
      },
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini API request failed' }) };
    }

    const geminiData = await geminiRes.json();
    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      (lang === 'ar' ? 'عذراً يا فندم، لم أتمكن من معالجة طلبك حالياً. تفضل بالتواصل المباشر.' : 'Apologies, I could not process your request. Please contact us directly.');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };
  } catch (e) {
    console.error('Function error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', detail: e.message }),
    };
  }
};
