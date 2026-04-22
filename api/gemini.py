# api/gemini.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
import time
import logging

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("Thiếu biến môi trường GEMINI_API_KEY")

GEMINI_MODEL = "gemini-2.5-flash" # Bạn có thể đổi model tại đây
MAX_RETRIES = 3

# Thiết lập logging cơ bản để dễ dàng theo dõi lỗi
logging.basicConfig(level=logging.INFO)

@app.route("/api/gemini", methods=["POST", "OPTIONS"])
def proxy_gemini():
    if request.method == "OPTIONS":
        return "", 200

    try:
        data = request.get_json(force=True)
        messages = data.get("messages", [])
        temperature = data.get("temperature", 0.1)
        max_tokens = data.get("max_tokens", 50)

        contents = []
        for msg in messages:
            role = "user"
            if msg.get("role") == "assistant":
                role = "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg.get("content", "")}]
            })

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        headers = {"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY}
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }

        answer_text = ""
        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=8.0)
                resp.raise_for_status()
                gemini_data = resp.json()

                # Kiểm tra và trích xuất câu trả lời
                if "candidates" in gemini_data and len(gemini_data["candidates"]) > 0:
                    candidate = gemini_data["candidates"][0]
                    
                    # Kiểm tra xem phản hồi có bị chặn bởi bộ lọc an toàn không
                    if candidate.get("finishReason") == "SAFETY":
                        logging.warning(f"Lần thử {attempt+1}: Phản hồi bị chặn bởi bộ lọc an toàn.")
                        time.sleep(2 ** attempt) # Exponential backoff
                        continue

                    if "content" in candidate and "parts" in candidate["content"]:
                        answer_text = candidate["content"]["parts"][0].get("text", "").strip()
                        if answer_text:
                            break # Thành công, thoát vòng lặp
                        else:
                            logging.warning(f"Lần thử {attempt+1}: Nhận được nội dung rỗng. Đang thử lại...")
                            time.sleep(2 ** attempt)
                else:
                    logging.warning(f"Lần thử {attempt+1}: Không tìm thấy 'candidates' trong phản hồi.")
                    time.sleep(2 ** attempt)

            except requests.exceptions.RequestException as e:
                logging.error(f"Lần thử {attempt+1}: Lỗi mạng hoặc API: {e}")
                time.sleep(2 ** attempt)

        # Trả về kết quả cuối cùng (có thể là rỗng nếu đã thử hết số lần)
        return jsonify({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": answer_text
                }
            }]
        })

    except Exception as e:
        logging.error(f"Lỗi proxy không mong muốn: {e}")
        return jsonify({"error": str(e)}), 500
