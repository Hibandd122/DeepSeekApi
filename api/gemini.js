// api/gemini.js
import axios from 'axios';

export default async function handler(req, res) {
    // 1. Cấu hình CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. Xử lý preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 3. Chỉ chấp nhận POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // 4. Kiểm tra body
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ 
            error: 'Invalid request body. Ensure Content-Type is application/json and body is valid JSON.' 
        });
    }

    try {
        // Lấy dữ liệu từ request của userscript
        const { model = 'gemini-2.5-flash', messages, temperature = 0.1, max_tokens = 50 } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Missing or invalid "messages" field.' });
        }

        // Xây dựng prompt theo định dạng của Gemini API
        // Gemini dùng mảng 'parts' thay vì 'messages' của OpenAI
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user', // Gemini dùng 'model' thay cho 'assistant'
            parts: [{ text: msg.content }]
        }));

        // 5. Gọi Gemini API
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                contents: contents,
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: max_tokens
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': process.env.GEMINI_API_KEY // 🔐 Sử dụng biến môi trường
                }
            }
        );

        // 6. Chuẩn hóa response về định dạng giống OpenAI để userscript không cần sửa nhiều
        const geminiResponse = response.data;
        const candidate = geminiResponse.candidates?.[0];
        const answerText = candidate?.content?.parts?.[0]?.text || "No response";

        // Tạo response có cấu trúc giống OpenAI
        const openAIFormattedResponse = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: answerText.trim()
                }
            }]
        };

        res.status(200).json(openAIFormattedResponse);
    } catch (error) {
        console.error('Proxy error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch from Gemini API',
            details: error.response?.data || error.message
        });
    }
}
