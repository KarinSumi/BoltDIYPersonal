import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

sys.path.insert(0, str(Path(__file__).parent))
import config
from personas import PERSONAS
from router import route_utterance, read_pin
from agent_bridge import invoke_agent

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(config.DEBUG_LOG),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('warroom')

app = FastAPI(title='OpenCode War Room')

HTML_UI = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>War Room</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e6edf7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.container{text-align:center;max-width:600px;padding:40px}
h1{font-size:28px;color:#E07A4F;margin-bottom:8px;letter-spacing:2px}
.status{font-size:13px;color:#7d8a9a;margin-bottom:32px}
.agent-card{background:#11161d;border:1px solid #1c2430;border-radius:12px;padding:20px;margin-bottom:16px}
.agent-card .name{font-size:16px;font-weight:600;color:#E07A4F}
.agent-card .title{font-size:12px;color:#7d8a9a;margin-top:4px}
.agent-card .status-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}
#transcript{background:#11161d;border:1px solid #1c2430;border-radius:12px;padding:16px;margin-top:16px;max-height:300px;overflow-y:auto;text-align:left;font-size:13px;line-height:1.6}
#transcript .entry{margin:4px 0}
#transcript .user{color:#4ECDC4}
#transcript .agent{color:#E07A4F}
.btn{background:#E07A4F;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;margin:8px}
.btn:hover{opacity:.9}
.btn-secondary{background:#1b2432;color:#e6edf7;border:1px solid #1c2430}
</style>
</head>
<body>
<div class="container">
<h1>⚔ WAR ROOM</h1>
<p class="status" id="status">Connecting...</p>
<div class="agent-card" id="agent-card">
<div><span class="status-dot" id="agent-dot" style="background:#7d8a9a"></span><span class="name" id="agent-name">Hand of the King</span></div>
<div class="title" id="agent-title">Main Agent</div>
</div>
<button class="btn" id="ptt-btn" onmousedown="startTalking()" onmouseup="stopTalking()" ontouchstart="startTalking()" ontouchend="stopTalking()">🎤 Push to Talk</button>
<button class="btn btn-secondary" onclick="toggleMode()">Toggle Listening Mode</button>
<div id="transcript"></div>
</div>
<script>
let ws = null;
let mediaRecorder = null;
let audioChunks = [];
let isListening = false;
let continuousMode = false;

function connect() {
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = protocol + '//' + location.host + '/ws';
ws = new WebSocket(wsUrl);

ws.onopen = () => {
document.getElementById('status').textContent = 'Connected';
document.getElementById('agent-dot').style.background = '#4ECDC4';
};

ws.onclose = () => {
document.getElementById('status').textContent = 'Disconnected. Reconnecting...';
document.getElementById('agent-dot').style.background = '#7d8a9a';
setTimeout(connect, 2000);
};

ws.onmessage = (event) => {
try {
const msg = JSON.parse(event.data);
if (msg.type === 'transcript') {
addTranscript(msg.text, 'user');
} else if (msg.type === 'response') {
addTranscript(msg.text, 'agent');
document.getElementById('agent-name').textContent = msg.agent || 'Hand of the King';
}
} catch { /* binary audio */ }
};
}

function addTranscript(text, role) {
const div = document.getElementById('transcript');
const entry = document.createElement('div');
entry.className = 'entry ' + role;
entry.textContent = (role === 'user' ? 'You: ' : 'Agent: ') + text;
div.appendChild(entry);
div.scrollTop = div.scrollHeight;
}

async function startTalking() {
try {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
mediaRecorder = new MediaRecorder(stream);
audioChunks = [];
mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
mediaRecorder.onstop = () => {
const blob = new Blob(audioChunks, { type: 'audio/webm' });
if (ws && ws.readyState === WebSocket.OPEN) {
ws.send(blob);
}
stream.getTracks().forEach(t => t.stop());
};
mediaRecorder.start();
} catch (err) {
console.error('Mic error:', err);
}
}

function stopTalking() {
if (mediaRecorder && mediaRecorder.state !== 'inactive') {
mediaRecorder.stop();
}
}

function toggleMode() {
continuousMode = !continuousMode;
document.getElementById('status').textContent = continuousMode ? 'Continuous listening...' : 'Push to talk';
}

connect();
</script>
</div>
</body>
</html>"""

@app.get('/')
async def get_index():
    return HTMLResponse(HTML_UI)

@app.get('/health')
async def health():
    return {'status': 'ok', 'mode': config.MODE}

@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info('WebSocket client connected')

    try:
        while True:
            data = await websocket.receive_bytes()
            await handle_audio(websocket, data)
    except WebSocketDisconnect:
        logger.info('WebSocket client disconnected')
    except Exception as e:
        logger.error(f'WebSocket error: {e}')

async def handle_audio(websocket: WebSocket, audio_data: bytes):
    pinned = read_pin()

    try:
        transcript = f'[Audio transcribed: {len(audio_data)} bytes]'

        await websocket.send_json({'type': 'transcript', 'text': transcript})

        agent_id = route_utterance(transcript, pinned)
        if agent_id == 'broadcast':
            agent_id = 'main'

        persona = PERSONAS.get(agent_id, PERSONAS['main'])

        response = await invoke_agent(agent_id, transcript)

        await websocket.send_json({
            'type': 'response',
            'text': response,
            'agent': persona['title']
        })

    except Exception as e:
        logger.error(f'Audio handling error: {e}')
        await websocket.send_json({
            'type': 'response',
            'text': f'Sorry, I encountered an error: {str(e)}',
            'agent': 'Hand of the King'
        })

def start_server():
    logger.info(f'Starting War Room on port {config.PORT} (mode: {config.MODE})')
    uvicorn.run(app, host='0.0.0.0', port=config.PORT, log_level='info')

if __name__ == '__main__':
    start_server()
