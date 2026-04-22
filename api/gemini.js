// api/gemini.js (hoặc api/deepseek.js)
export default async function handler(req, res) {
    // ✅ Bắt buộc: Set CORS headers ngay lập tức, trước mọi xử lý
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // ✅ Xử lý preflight request (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Chỉ cho phép POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { model = 'gemini-2.0-flash', messages, temperature = 0.1, max_tokens = 50 } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid messages' });
        }

        // Chuẩn bị payload cho Gemini API
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('Missing GEMINI_API_KEY environment variable');
        }

        // Gọi Gemini API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: { temperature, maxOutputTokens: max_tokens }
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(JSON.stringify(data));
        }

        const answerText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có phản hồi';

        // Trả về định dạng giống OpenAI để userscript không cần sửa
        res.status(200).json({
            choices: [{
                message: {
                    role: 'assistant',
                    content: answerText.trim()
                }
            }]
        });
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({
            error: 'Proxy error',
            details: error.message
        });
    }
}
