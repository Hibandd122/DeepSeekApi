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

# SỬA LỖI 1: Tên model phải là gemini-1.5-flash hoặc gemini-2.0-flash
GEMINI_MODEL = "gemini-2.0-flash" 
MAX_RETRIES = 3

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
        last_error_msg = "" # Biến để lưu lại lỗi cuối cùng

        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.post(url, headers=headers, json=payload, timeout=8.0)
                resp.raise_for_status()
                gemini_data = resp.json()

                if "candidates" in gemini_data and len(gemini_data["candidates"]) > 0:
                    candidate = gemini_data["candidates"][0]
                    
                    if candidate.get("finishReason") == "SAFETY":
                        logging.warning(f"Lần thử {attempt+1}: Phản hồi bị chặn bởi bộ lọc an toàn.")
                        last_error_msg = "Blocked by SAFETY filter."
                        time.sleep(2 ** attempt)
                        continue

                    if "content" in candidate and "parts" in candidate["content"]:
                        answer_text = candidate["content"]["parts"][0].get("text", "").strip()
                        if answer_text:
                            break 
                        else:
                            logging.warning(f"Lần thử {attempt+1}: Nhận được nội dung rỗng.")
                            last_error_msg = "Empty content from API."
                            time.sleep(2 ** attempt)
                else:
                    logging.warning(f"Lần thử {attempt+1}: Không tìm thấy 'candidates' trong phản hồi.")
                    last_error_msg = "No candidates in response."
                    time.sleep(2 ** attempt)

            except requests.exceptions.RequestException as e:
                # Trích xuất lỗi chi tiết từ Google API nếu có
                error_detail = e.response.text if hasattr(e, 'response') and e.response else str(e)
                logging.error(f"Lần thử {attempt+1}: Lỗi mạng hoặc API: {error_detail}")
                last_error_msg = error_detail
                time.sleep(2 ** attempt)

        # SỬA LỖI 2: Nếu đã thử hết các lần mà answer_text vẫn rỗng, trả về lỗi HTTP 500 thay vì HTTP 200 rỗng
        if not answer_text:
            return jsonify({
                "error": "Failed to generate content after retries",
                "details": last_error_msg
            }), 502

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
