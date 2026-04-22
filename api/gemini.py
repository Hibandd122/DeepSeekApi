# api/gemini.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)  # Cho phép mọi nguồn truy cập (CORS)

# Lấy API Key từ biến môi trường (sẽ thiết lập trên Vercel)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("Missing GEMINI_API_KEY environment variable")

GEMINI_MODEL = "gemini-2.5-flash"  # Bạn có thể thay đổi model nếu muốn

@app.route("/api/gemini", methods=["POST", "OPTIONS"])
def proxy_gemini():
    # Xử lý preflight CORS
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json(force=True)
        messages = data.get("messages", [])
        temperature = data.get("temperature", 0.1)
        max_tokens = data.get("max_tokens", 50)

        # Chuyển đổi từ định dạng OpenAI sang Gemini
        contents = []
        for msg in messages:
            role = "user"
            if msg.get("role") == "assistant":
                role = "model"
            elif msg.get("role") == "system":
                # Gemini không có role system riêng, ta ghép vào user
                role = "user"
            contents.append({
                "role": role,
                "parts": [{"text": msg.get("content", "")}]
            })

        # Gọi Gemini API
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        }
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }

        resp = requests.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        gemini_data = resp.json()

        # Trích xuất câu trả lời
        answer_text = ""
        if "candidates" in gemini_data and len(gemini_data["candidates"]) > 0:
            candidate = gemini_data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                answer_text = candidate["content"]["parts"][0].get("text", "").strip()

        # Trả về định dạng giống OpenAI để userscript không phải sửa
        return jsonify({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": answer_text
                }
            }]
        })

    except Exception as e:
        print("Proxy error:", e)
        return jsonify({"error": str(e)}), 500
