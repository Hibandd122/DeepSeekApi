// api/gemini.js
export default async function handler(req, res) {
    // ========== CẤU HÌNH CORS (BẮT BUỘC) ==========
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Xử lý preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Chỉ cho phép POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // ========== KIỂM TRA BODY ==========
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({
            error: 'Invalid request body. Ensure Content-Type is application/json.'
        });
    }

    try {
        const {
            model = 'gemini-2.5-flash',
            messages,
            temperature = 0.1,
            max_tokens = 50
        } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Missing or invalid "messages" field.' });
        }

        // ========== CHUẨN BỊ PAYLOAD CHO GEMINI ==========
        // Chuyển từ định dạng OpenAI sang Gemini
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
            throw new Error('Missing GEMINI_API_KEY environment variable');
        }

        // ========== GỌI GEMINI API ==========
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature,
                        maxOutputTokens: max_tokens
                    }
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API error:', data);
            return res.status(response.status).json({
                error: 'Gemini API error',
                details: data
            });
        }

        // ========== TRÍCH XUẤT CÂU TRẢ LỜI ==========
        const answerText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!answerText) {
            return res.status(500).json({
                error: 'No response from Gemini',
                details: data
            });
        }

        // ========== TRẢ VỀ ĐỊNH DẠNG GIỐNG OPENAI ==========
        // Để userscript của bạn (được viết theo kiểu OpenAI) vẫn hoạt động
        res.status(200).json({
            choices: [{
                message: {
                    role: 'assistant',
                    content: answerText.trim()
                }
            }]
        });
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Internal proxy error',
            details: error.message
        });
    }
}
