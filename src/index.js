/**
 * Edge TTS Worker - 使用 Microsoft Translator TTS API 进行语音合成
 *
 * 用法（兼容 OpenAI TTS API）:
 *   POST /v1/audio/speech
 *   Body: { "model": "tts-1", "input": "你好世界", "voice": "alloy" }
 *
 * 语音映射: alloy/echo/fable/onyx/nova/shimmer → 对应的中文语音
 * 也可直接使用完整语音名，如: zh-CN-XiaoxiaoNeural
 */

const encoder = new TextEncoder();

// 添加缓存和预刷新机制
const TOKEN_REFRESH_BEFORE_EXPIRY = 5 * 60; // 提前5分钟刷新token
let tokenInfo = {
    endpoint: null,
    token: null,
    expiredAt: null
};

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
        return handleRequest(request, env);
    }
};

async function handleRequest(request, env) {
    const API_KEY = env.API_KEY;
    if (request.method === "OPTIONS") {
        return handleOptions(request);
    }

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
                headers: {
                    "Content-Type": "application/json",
                    ...makeCORSHeaders()
                }
            });
        }
    }

    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;

    if (path === "/v1/audio/speech") {
        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405, headers: makeCORSHeaders() });
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

            // 添加语音名称映射
            voice = VOICE_MAPPING[voice] || voice;

            const rate = ((speed - 1) * 100).toFixed(0);
            const numPitch = ((pitch - 1) * 100).toFixed(0);
            const response = await getVoice(
                input,
                voice,
                rate,
                numPitch,
                style,
                "audio-24khz-48kbitrate-mono-mp3",
                false
            );

            return response;

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
                headers: {
                    "Content-Type": "application/json",
                    ...makeCORSHeaders()
                }
            });
        }
    } else if (path === "/voices" && request.method === "GET") {
        return new Response(JSON.stringify({
            models: [
                { id: "tts-1", name: "TTS-1", description: "Edge TTS voice synthesis" },
            ],
            voices: Object.entries(VOICE_MAPPING).map(([id, name]) => ({ id, name })),
        }), {
            headers: { "Content-Type": "application/json", ...makeCORSHeaders() },
        });
    } else if (path === "/" && request.method === "GET") {
        // 浏览器访问返回页面
        return new Response(getHTML(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    }

    // 默认返回 404
    return new Response("Not Found", { status: 404 });
}

async function handleOptions(request) {
    return new Response(null, {
        status: 204,
        headers: {
            ...makeCORSHeaders(),
            "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
            "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Authorization"
        }
    });
}

async function getVoice(text, voiceName = "zh-CN-XiaoxiaoNeural", rate = 0, pitch = 0, style = "general", outputFormat = "audio-24khz-48kbitrate-mono-mp3", download = false) {
    try {
        const maxChunkSize = 2000;
        const chunks = [];

        // 将长文本分段
        for (let i = 0; i < text.length; i += maxChunkSize) {
            const chunk = text.slice(i, i + maxChunkSize);
            chunks.push(chunk);
        }

        // 获取每个分段的音频
        const audioChunks = await Promise.all(chunks.map(chunk => getAudioChunk(chunk, voiceName, rate, pitch, style, outputFormat)));

        // 将音频片段拼接起来
        const concatenatedAudio = new Blob(audioChunks, { type: 'audio/mpeg' });
        const response = new Response(concatenatedAudio, {
            headers: {
                "Content-Type": "audio/mpeg",
                ...makeCORSHeaders()
            }
        });

        if (download) {
            response.headers.set("Content-Disposition", `attachment; filename="${uuid()}.mp3"`);
        }

        return response;

    } catch (error) {
        console.error("语音合成失败:", error);
        return new Response(JSON.stringify({
            error: {
                message: error.message,
                type: "api_error",
                param: null,
                code: "edge_tts_error"
            }
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                ...makeCORSHeaders()
            }
        });
    }
}

// 获取单个音频数据
async function getAudioChunk(text, voiceName, rate, pitch, style, outputFormat) {
    const endpoint = await getEndpoint();
    const url = `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": endpoint.t,
            "Content-Type": "application/ssml+xml",
            "User-Agent": "okhttp/4.5.0",
            "X-Microsoft-OutputFormat": outputFormat
        },
        body: getSsml(text, voiceName, rate, pitch, style)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge TTS API error: ${response.status} ${errorText}`);
    }

    return response.blob();
}

function getSsml(text, voiceName, rate, pitch, style) {
    return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">
                <voice name="${voiceName}">
                    <mstts:express-as style="${style}"  styledegree="1.0" role="default" >
                        <prosody rate="${rate}%" pitch="${pitch}%" volume="50">${text}</prosody>
                    </mstts:express-as>
                </voice>
            </speak>`;
}

// 优化 getEndpoint 函数
async function getEndpoint() {
    const now = Date.now() / 1000;

    // 检查token是否有效（提前5分钟刷新）
    if (tokenInfo.token && tokenInfo.expiredAt && now < tokenInfo.expiredAt - TOKEN_REFRESH_BEFORE_EXPIRY) {
        console.log(`使用缓存的token，剩余 ${((tokenInfo.expiredAt - now) / 60).toFixed(1)} 分钟`);
        return tokenInfo.endpoint;
    }

    // 获取新token
    const endpointUrl = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
    const clientId = crypto.randomUUID().replace(/-/g, "");

    try {
        const response = await fetch(endpointUrl, {
            method: "POST",
            headers: {
                "Accept-Language": "zh-Hans",
                "X-ClientVersion": "4.0.530a 5fe1dc6c",
                "X-UserId": "0f04d16a175c411e",
                "X-HomeGeographicRegion": "zh-Hans-CN",
                "X-ClientTraceId": clientId,
                "X-MT-Signature": await sign(endpointUrl),
                "User-Agent": "okhttp/4.5.0",
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": "0",
                "Accept-Encoding": "gzip"
            }
        });

        if (!response.ok) {
            throw new Error(`获取endpoint失败: ${response.status}`);
        }

        const data = await response.json();
        const jwt = data.t.split(".")[1];
        const decodedJwt = JSON.parse(atob(jwt));

        // 更新缓存
        tokenInfo = {
            endpoint: data,
            token: data.t,
            expiredAt: decodedJwt.exp
        };

        console.log(`获取新token成功，有效期 ${((decodedJwt.exp - now) / 60).toFixed(1)} 分钟`);
        return data;

    } catch (error) {
        console.error("获取endpoint失败:", error);
        // 如果有缓存的token，即使过期也尝试使用
        if (tokenInfo.token) {
            console.log("使用过期的缓存token");
            return tokenInfo.endpoint;
        }
        throw error;
    }
}

function addCORSHeaders(response) {
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(makeCORSHeaders())) {
        newHeaders.set(key, value);
    }
    return new Response(response.body, { ...response, headers: newHeaders });
}

function makeCORSHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
        "Access-Control-Max-Age": "86400"
    };
}

async function hmacSha256(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
    return new Uint8Array(signature);
}

async function base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function bytesToBase64(bytes) {
    return btoa(String.fromCharCode.apply(null, bytes));
}

function uuid() {
    return crypto.randomUUID().replace(/-/g, "");
}

async function sign(urlStr) {
    const url = urlStr.split("://")[1];
    const encodedUrl = encodeURIComponent(url);
    const uuidStr = uuid();
    const formattedDate = dateFormat();
    const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase();
    const decode = await base64ToBytes("oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==");
    const signData = await hmacSha256(decode, bytesToSign);
    const signBase64 = await bytesToBase64(signData);
    return `MSTranslatorAndroidApp::${signBase64}::${formattedDate}::${uuidStr}`;
}

function dateFormat() {
    const formattedDate = (new Date()).toUTCString().replace(/GMT/, "").trim() + " GMT";
    return formattedDate.toLowerCase();
}

// 添加请求超时控制
async function fetchWithTimeout(url, options, timeout = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
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
