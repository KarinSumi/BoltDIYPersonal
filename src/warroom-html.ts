export function getWarRoomHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>War Room — OpenCode OS</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0a0a0f;color:#e6edf7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .room{background:#11161d;border:1px solid #1c2430;border-radius:16px;padding:32px;width:600px;max-width:90vw}
  h1{color:#E07A4F;font-size:20px;margin-bottom:4px}
  .sub{color:#7d8a9a;font-size:13px;margin-bottom:20px}
  .status{display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:13px}
  .dot{width:8px;height:8px;border-radius:50%;background:#4ecdc4}
  .dot.disconnected{background:#ff6b6b}
  .transcript{background:#0a0a0f;border:1px solid #1c2430;border-radius:8px;padding:12px;height:300px;overflow-y:auto;margin-bottom:16px;font-size:13px}
  .msg{margin-bottom:8px;padding:8px;border-radius:6px}
  .msg.user{background:#1b2432}
  .msg.agent{background:#1b2432;border-left:3px solid #E07A4F}
  .msg .label{font-size:10px;color:#7d8a9a;margin-bottom:2px}
  .controls{display:flex;gap:8px}
  button{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:14px;flex:1}
  .btn-primary{background:#E07A4F;color:#fff}
  .btn-primary:hover{opacity:.9}
  .btn-secondary{background:#1b2432;color:#e6edf7;border:1px solid #1c2430}
  .btn-secondary:hover{background:#243045}
  .btn-danger{background:#ff6b6b;color:#fff}
</style>
</head>
<body>
<div class="room">
  <h1>War Room</h1>
  <p class="sub">Real-time voice interface</p>
  <div class="status">
    <span class="dot disconnected" id="status-dot"></span>
    <span id="status-text">Disconnected</span>
  </div>
  <div class="transcript" id="transcript">
    <div class="msg agent"><div class="label">System</div>Open the War Room server to begin.</div>
  </div>
  <div class="controls">
    <button class="btn-primary" id="btn-push" disabled>🎤 Push to Talk</button>
    <button class="btn-secondary" id="btn-connect">Connect</button>
  </div>
</div>
<script>
  let ws = null;
  const transcript = document.getElementById('transcript');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const btnPush = document.getElementById('btn-push');
  const btnConnect = document.getElementById('btn-connect');

  function addMessage(text, type, agentId) {
    const div = document.createElement('div');
    div.className = 'msg ' + type;
    div.innerHTML = '<div class="label">' + (type === 'user' ? 'You' : (agentId || 'Agent')) + '</div>' + text;
    transcript.appendChild(div);
    transcript.scrollTop = transcript.scrollHeight;
  }

  btnConnect.addEventListener('click', () => {
    if (ws) { ws.close(); return; }
    ws = new WebSocket('ws://localhost:7860/ws');
    ws.onopen = () => {
      statusDot.className = 'dot';
      statusText.textContent = 'Connected';
      btnPush.disabled = false;
      btnConnect.textContent = 'Disconnect';
      addMessage('Connected to War Room', 'agent', 'System');
    };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'response') {
        addMessage(data.text, 'agent', data.agent_id);
      }
    };
    ws.onclose = () => {
      statusDot.className = 'dot disconnected';
      statusText.textContent = 'Disconnected';
      btnPush.disabled = true;
      btnConnect.textContent = 'Connect';
      ws = null;
    };
  });
</script>
</body>
</html>`
}
