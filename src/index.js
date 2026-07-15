/**
 * Edge TTS Worker - 使用 Microsoft Translator TTS API 进行语音合成
 *
 * 用法（兼容 OpenAI TTS API）:
 *   POST /v1/audio/speech
 *   Body: { "model": "tts-1", "input": "你好世界", "voice": "alloy" }
 *
 * 语音映射: alloy/echo/fable/onyx/nova/shimmer → 对应的中文语音
 */



import { getVoice } from "./edge-tts";

// OpenAI 兼容语音名称 → Edge TTS 语音名称映射
const VOICE_MAPPING = {
    // 中文
    'alloy': 'zh-CN-XiaoxiaoNeural',
    'echo': 'zh-CN-YunxiNeural',
    'fable': 'zh-CN-XiaoyiNeural',
    'onyx': 'zh-CN-YunyangNeural',
    'nova': 'zh-CN-XiaohanNeural',
    'shimmer': 'zh-CN-XiaomengNeural',
    // 英文
    'jenny': 'en-US-JennyNeural',
    'guy': 'en-US-GuyNeural',
    'aria': 'en-US-AriaNeural',
    'davis': 'en-US-DavisNeural',
    'sonia': 'en-GB-SoniaNeural',
    'ryan': 'en-GB-RyanNeural',
    'natasha': 'en-AU-NatashaNeural',
};

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return handleOptions();
        }

        const response = await routeRequest(request, env);
        response.headers.set("Access-Control-Allow-Origin", "*");
        return response;
    }
};



async function routeRequest(request, env) {
    const API_KEY = env.API_KEY;

    // 只在设置了 API_KEY 的情况下才验证
    if (API_KEY) {
        const authHeader = request.headers.get("authorization");
        const apiKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (apiKey !== API_KEY) {
            return new Response(JSON.stringify({
                error: {
                    message: "Invalid API key. Use 'Authorization: Bearer your-api-key' header",
                    type: "invalid_request_error",
                    param: null,
                    code: "invalid_api_key"
                }
            }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;

    if (path === "/v1/audio/speech") {
        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }
        try {
            const requestBody = await request.json();
            let {
                model = "tts-1",
                input,
                voice = "zh-CN-XiaoxiaoNeural",
                response_format = "mp3",
                speed = 1.0,
                pitch = 1.0,
                style = "general"
            } = requestBody;

            if (!input || !input.trim()) {
                return new Response(JSON.stringify({
                    error: {
                        message: "Missing required parameter: 'input'",
                        type: "invalid_request_error",
                        param: "input",
                        code: null
                    }
                }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            // 添加语音名称映射
            voice = VOICE_MAPPING[voice] || voice;

            const rate = ((speed - 1) * 100).toFixed(0);
            const numPitch = ((pitch - 1) * 100).toFixed(0);
            return await getVoice(
                input,
                voice,
                rate,
                numPitch,
                style,
                "audio-24khz-48kbitrate-mono-mp3",
                false
            );

        } catch (error) {
            console.error("Error:", error);
            return new Response(JSON.stringify({
                error: {
                    message: error.message,
                    type: "api_error",
                    param: null,
                    code: "edge_tts_error"
                }
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    } else if (path === "/voices" && request.method === "GET") {
        return new Response(JSON.stringify({
            models: [
                { id: "tts-1", name: "TTS-1", description: "Edge TTS voice synthesis" },
            ],
            voices: Object.entries(VOICE_MAPPING).map(([id, name]) => ({ id, name })),
        }), {
            headers: { "Content-Type": "application/json" },
        });
    } else if (path === "/" && request.method === "GET") {
        return new Response(getHTML(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }

    // 默认返回 404
    return new Response("Not Found", { status: 404 });
}

async function handleOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400"
        }
    });
}


function getHTML() {
    const voiceOptions = Object.entries(VOICE_MAPPING)
        .map(([id, name]) => `<option value="${id}">${id} (${name})</option>`)
        .join("\n");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edge TTS</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0f0f0f; color: #e0e0e0;
            min-height: 100vh; display: flex; justify-content: center; align-items: center;
        }
        .container {
            width: 100%; max-width: 600px; padding: 40px 24px;
        }
        h1 {
            font-size: 28px; font-weight: 600; text-align: center; margin-bottom: 32px;
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .card {
            background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 24px; margin-bottom: 16px;
        }
        label {
            font-size: 13px; color: #888; display: block; margin-bottom: 6px;
            font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
        }
        textarea {
            width: 100%; height: 120px; background: #111; border: 1px solid #333;
            border-radius: 8px; color: #e0e0e0; padding: 12px; font-size: 15px;
            resize: vertical; outline: none; transition: border-color 0.2s;
        }
        textarea:focus { border-color: #60a5fa; }
        .row { display: flex; gap: 12px; }
        .row > div { flex: 1; }
        select, input[type="range"] {
            width: 100%; background: #111; border: 1px solid #333;
            border-radius: 8px; color: #e0e0e0; padding: 8px 12px; font-size: 14px;
            outline: none; cursor: pointer;
        }
        select:focus { border-color: #a78bfa; }
        button {
            width: 100%; padding: 14px; font-size: 16px; font-weight: 600;
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            color: #fff; border: none; border-radius: 8px; cursor: pointer;
            transition: opacity 0.2s, transform 0.1s;
            margin-top: 8px;
        }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.98); }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        .player {
            background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
            padding: 20px 24px; display: none;
        }
        .player.show { display: block; }
        audio { width: 100%; margin-top: 8px; }
        .speed-val { text-align: center; font-size: 13px; color: #888; margin-top: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Edge TTS</h1>
        <div class="card">
            <label>输入文本</label>
            <textarea id="text" placeholder="输入要合成的文字...">你好世界，这是一个 Edge TTS 语音合成测试。</textarea>
            <div class="row" style="margin-top: 12px;">
                <div>
                    <label>语音</label>
                    <select id="voice">${voiceOptions}</select>
                </div>
                <div>
                    <label>语速</label>
                    <input type="range" id="speed" min="0.5" max="2" step="0.1" value="1">
                    <div class="speed-val"><span id="speedVal">1.0</span>x</div>
                </div>
            </div>
            <button id="submit" onclick="synthesize()">合成并播放</button>
        </div>
        <div class="player" id="player">
            <label>播放</label>
            <audio id="audio" controls></audio>
        </div>
    </div>

    <script>
        const speedEl = document.getElementById("speed");
        const speedValEl = document.getElementById("speedVal");
        speedEl.addEventListener("input", () => {
            speedValEl.textContent = parseFloat(speedEl.value).toFixed(1);
        });

        async function synthesize() {
            const btn = document.getElementById("submit");
            const player = document.getElementById("player");
            const audio = document.getElementById("audio");
            const text = document.getElementById("text").value.trim();

            if (!text) { alert("请输入文本"); return; }

            btn.disabled = true;
            btn.textContent = "合成中...";

            try {
                const resp = await fetch("/v1/audio/speech", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "tts-1",
                        input: text,
                        voice: document.getElementById("voice").value,
                        speed: parseFloat(speedEl.value),
                    }),
                });

                if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.error?.message || resp.statusText);
                }

                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                audio.src = url;
                player.classList.add("show");
                audio.play();
            } catch (e) {
                alert("合成失败: " + e.message);
            } finally {
                btn.disabled = false;
                btn.textContent = "合成并播放";
            }
        }
    </script>
</body>
</html>`;
}
