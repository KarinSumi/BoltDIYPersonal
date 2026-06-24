export function getWarRoomHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>War Room</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e6edf7;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrap{max-width:700px;width:100%;padding:30px;text-align:center}
h1{font-size:32px;color:#E07A4F;letter-spacing:3px;margin-bottom:4px}
.tagline{color:#7d8a9a;font-size:13px;margin-bottom:30px}
.stage{background:#11161d;border:1px solid #1c2430;border-radius:16px;padding:30px;position:relative;min-height:320px}
.agent-card{background:#0a0a0f;border:1px solid #1c2430;border-radius:12px;padding:20px;margin-bottom:20px;display:inline-block;min-width:260px}
.agent-card .dot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:10px;background:#7d8a9a}
.agent-card .dot.active{background:#4ECDC4;box-shadow:0 0 12px #4ECDC466}
.agent-card .dot.thinking{background:#E07A4F;box-shadow:0 0 12px #E07A4F66;animation:pulse 1s infinite}
.agent-card .name{font-size:18px;font-weight:600}
.agent-card .title{font-size:12px;color:#7d8a9a;margin-top:4px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.controls{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:20px 0}
.btn{background:#E07A4F;color:#fff;border:none;padding:12px 28px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;transition:opacity .2s}
.btn:hover{opacity:.85}
.btn:active{transform:scale(.97)}
.btn-secondary{background:#1b2432;color:#e6edf7;border:1px solid #1c2430}
.transcript{background:#0a0a0f;border:1px solid #1c2430;border-radius:10px;padding:16px;margin-top:16px;max-height:250px;overflow-y:auto;text-align:left;font-size:13px;line-height:1.7}
.transcript .user{color:#4ECDC4}
.transcript .agent{color:#E07A4F}
.transcript .meta{color:#7d8a9a;font-size:11px}
</style>
</head>
<body>
<div class="wrap">
<h1>⚔ WAR ROOM</h1>
<p class="tagline">Speak to your agents</p>
<div class="stage">
<div class="agent-card">
<div><span class="dot" id="dot"></span><span class="name" id="agentName">Hand of the King</span></div>
<div class="title" id="agentTitle">Ready</div>
</div>
<div class="controls">
<button class="btn" id="pttBtn">🎤 Hold to Talk</button>
<button class="btn btn-secondary" id="modeBtn">🔁 Continuous</button>
</div>
<div class="transcript" id="transcript"><div class="meta">Waiting for input...</div></div>
</div>
</div>
<script>
let ws, mediaRecorder, audioChunks = [], continuous = false, isRecording = false;
const dot = document.getElementById('dot');
const agentName = document.getElementById('agentName');
const agentTitle = document.getElementById('agentTitle');
const transcript = document.getElementById('transcript');
const pttBtn = document.getElementById('pttBtn');
const modeBtn = document.getElementById('modeBtn');

function connect() {
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
ws = new WebSocket(proto + '//' + location.host + '/ws');
ws.onopen = () => { dot.className = 'dot active'; agentTitle.textContent = 'Connected'; };
ws.onclose = () => { dot.className = 'dot'; agentTitle.textContent = 'Disconnected'; setTimeout(connect, 2000); };
ws.onmessage = e => {
try {
const m = JSON.parse(e.data);
if (m.type === 'transcript') addLine('user', m.text);
if (m.type === 'response') { addLine('agent', m.text); agentName.textContent = m.agent || 'Hand of the King'; dot.className = 'dot active'; }
} catch {}
};
}
function addLine(role, text) {
const d = document.createElement('div');
d.className = role;
d.textContent = (role === 'user' ? 'You: ' : '→ ') + text;
transcript.appendChild(d);
transcript.scrollTop = transcript.scrollHeight;
}

async function startRec() {
try {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
mediaRecorder = new MediaRecorder(stream);
audioChunks = [];
mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
mediaRecorder.onstop = () => {
const blob = new Blob(audioChunks, { type: 'audio/webm' });
if (ws && ws.readyState === WebSocket.OPEN) { ws.send(blob); dot.className = 'dot thinking'; agentTitle.textContent = 'Processing...'; }
stream.getTracks().forEach(t => t.stop());
};
mediaRecorder.start();
isRecording = true;
pttBtn.textContent = '🔴 Recording...';
} catch(e) { alert('Mic access denied: ' + e.message); }
}
function stopRec() {
if (mediaRecorder && mediaRecorder.state !== 'inactive') { mediaRecorder.stop(); isRecording = false; pttBtn.textContent = '🎤 Hold to Talk'; }
}

pttBtn.addEventListener('mousedown', startRec);
pttBtn.addEventListener('mouseup', stopRec);
pttBtn.addEventListener('mouseleave', stopRec);
pttBtn.addEventListener('touchstart', e => { e.preventDefault(); startRec(); });
pttBtn.addEventListener('touchend', e => { e.preventDefault(); stopRec(); });

modeBtn.addEventListener('click', () => {
continuous = !continuous;
modeBtn.textContent = continuous ? '⏸ Continuous' : '🔁 Continuous';
if (continuous) { startRec(); mediaRecorder?.addEventListener('dataavailable', () => { if (continuous) startRec(); }); }
});

connect();
</script>
</body>
</html>`
}
