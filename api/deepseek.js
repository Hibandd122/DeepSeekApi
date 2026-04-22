// api/deepseek.js
import axios from 'axios';

export default async function handler(req, res) {
    // Chỉ chấp nhận method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Cấu hình CORS cho phép userscript gọi từ mọi nguồn
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Xử lý preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { model, messages, temperature, max_tokens } = req.body;

        // Gọi DeepSeek API
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: model || 'deepseek-chat',
                messages,
                temperature: temperature || 0.1,
                max_tokens: max_tokens || 50
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    // 🔐 API key được lưu trong biến môi trường Vercel
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                }
            }
        );

        // Trả về kết quả cho userscript
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Proxy error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch from DeepSeek',
            details: error.response?.data || error.message
        });
    }
}
