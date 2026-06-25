export function getDashboardHTML(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode OS Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0f;color:#e6edf7;font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh}
.sidebar{width:220px;background:#11161d;border-right:1px solid #1c2430;padding:20px 12px;flex-shrink:0}
.sidebar h1{font-size:16px;color:#E07A4F;margin-bottom:24px;letter-spacing:1px}
.sidebar a{display:block;padding:8px 12px;color:#cdd6e4;text-decoration:none;border-radius:6px;font-size:13px;margin:2px 0}
.sidebar a:hover{background:#1b2432;color:#fff}
.sidebar a.active{background:#E07A4F22;color:#E07A4F;border:1px solid #E07A4F44}
.sidebar .sse-status{font-size:11px;color:#7d8a9a;margin-top:20px;padding:8px 12px;border-radius:6px;background:#0a0a0f}
.main{flex:1;padding:24px;overflow-y:auto;display:flex;flex-direction:column}
.section{display:none}
.section.active{display:block}
.card{background:#11161d;border:1px solid #1c2430;border-radius:10px;padding:16px;margin-bottom:16px}
.card h3{font-size:13px;color:#E07A4F;margin-bottom:8px}
.chart-box{max-width:600px;margin:16px 0}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.stat{border:1px solid #1c2430;border-radius:8px;padding:14px;background:#11161d}
.stat .value{font-size:22px;font-weight:600;color:#E07A4F}
.stat .label{font-size:11px;color:#7d8a9a;margin-top:4px}
.stat .status-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px;vertical-align:middle}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #1c2430}
th{color:#7d8a9a;font-weight:500;font-size:11px;text-transform:uppercase}
.memory-item{padding:8px 0;border-bottom:1px solid #1c2430;font-size:12px}
.memory-item .importance{display:inline-block;width:60px;height:4px;border-radius:2px;margin-right:8px}
.toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
input,select{background:#0a0a0f;border:1px solid #1c2430;color:#e6edf7;padding:6px 10px;border-radius:6px;font-size:12px}
button{background:#E07A4F;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px}
button:hover{opacity:.9}
.btn-secondary{background:#1b2432;color:#e6edf7;border:1px solid #1c2430}
.privacy-blur .blur-target{filter:blur(5px);transition:filter .3s}
.activity-feed{max-height:400px;overflow-y:auto;padding:0;list-style:none}
.activity-feed li{padding:8px 12px;border-bottom:1px solid #1c2430;font-size:12px;display:flex;align-items:flex-start;gap:8px}
.activity-feed .time{color:#7d8a9a;white-space:nowrap;font-size:11px;min-width:60px}
.activity-feed .event{color:#E07A4F;font-weight:500;min-width:100px}
.activity-feed .msg{color:#cdd6e4;word-break:break-all}
.agent-rail{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.agent-card{border:1px solid #1c2430;border-radius:8px;padding:10px 14px;background:#11161d;font-size:12px;min-width:120px;text-align:center}
.agent-card .name{color:#E07A4F;font-weight:600}
.agent-card .status{color:#7d8a9a;font-size:11px;margin-top:4px}
.agent-card.online{border-color:#2ea043}
.agent-card.busy{border-color:#d29922}
.agent-card.offline{border-color:#da3633}
.kanban-board-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:20px}
.kanban-board-card{border:1px solid #1c2430;border-radius:8px;padding:14px;background:#11161d;cursor:pointer}
.kanban-board-card:hover{border-color:#E07A4F}
.kanban-board-card .btitle{color:#E07A4F;font-weight:600;font-size:13px}
.kanban-board-card .bmeta{color:#7d8a9a;font-size:11px;margin-top:4px}
.kanban-board-card .bprogress{height:4px;background:#1c2430;border-radius:2px;margin-top:8px}
.kanban-board-card .bprogress .bfill{height:100%;background:#E07A4F;border-radius:2px;transition:width .5s}
.kanban-columns{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;min-height:300px}
.kanban-col{background:#0e1219;border:1px solid #1c2430;border-radius:8px;padding:10px;min-height:120px}
.kanban-col h4{font-size:11px;color:#7d8a9a;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1c2430}
.kanban-task-card{border:1px solid #1c2430;border-radius:6px;padding:8px;margin-bottom:6px;background:#11161d;font-size:11px;cursor:default}
.kanban-task-card .tassignee{color:#7d8a9a;font-size:10px}
.kanban-back{margin-bottom:12px;display:inline-block}
</style>
</head>
<body>
<div class="sidebar">
<h1>OPENCODE OS</h1>
<a href="#overview" class="active" onclick="showTab('overview')">Overview</a>
<a href="#memory" onclick="showTab('memory')">Memory</a>
<a href="#agents" onclick="showTab('agents')">Agents</a>
<a href="#tasks" onclick="showTab('tasks')">Tasks</a>
<a href="#audit" onclick="showTab('audit')">Audit</a>
<a href="#kanban" onclick="showTab('kanban')">Kanban</a>
<a href="#hive" onclick="showTab('hive')">Hive Mind</a>
<div class="sse-status" id="sse-status">SSE: disconnected</div>
</div>
<div class="main" id="app">
<div id="section-overview" class="section active">
<h2>Overview</h2>
<div class="agent-rail" id="agent-rail"></div>
<div class="stats" id="stats-container">
<div class="stat"><div class="value" id="stat-memories">0</div><div class="label">Memories</div></div>
<div class="stat"><div class="value" id="stat-agents">1</div><div class="label">Active Agents</div></div>
<div class="stat"><div class="value" id="stat-tasks">0</div><div class="label">Pending Tasks</div></div>
<div class="stat"><div class="value" id="stat-uptime">0s</div><div class="label">Uptime</div></div>
</div>
<div class="card"><h3>Token Usage (7 days)</h3><div class="chart-box"><canvas id="tokenChart"></canvas></div></div>
<div class="card"><h3>Activity Feed</h3><ul class="activity-feed" id="activity-feed"><li style="color:#7d8a9a">Waiting for events...</li></ul></div>
</div>
<div id="section-memory" class="section">
<h2>Memory Timeline</h2>
<div class="toolbar">
<input type="text" id="memory-search" placeholder="Search memories..." style="flex:1">
<select id="memory-filter"><option value="all">All Importance</option><option value="high">High (>=0.7)</option><option value="medium">Medium (>=0.4)</option><option value="low">Low (<0.4)</option></select>
<button onclick="toggleBlur()" class="btn-secondary">Toggle Privacy Blur</button>
</div>
<div id="memory-list"></div>
</div>
<div id="section-agents" class="section">
<h2>Agents</h2>
<div id="agent-list" class="stats"></div>
</div>
<div id="section-tasks" class="section">
<h2>Tasks & Missions</h2>
<div class="card"><h3>Scheduled Tasks</h3><table><thead><tr><th>ID</th><th>Prompt</th><th>Schedule</th><th>Status</th><th>Next Run</th></tr></thead><tbody id="scheduled-tasks"></tbody></table></div>
<div class="card"><h3>Missions</h3><table><thead><tr><th>ID</th><th>Title</th><th>Agent</th><th>Priority</th><th>Status</th></tr></thead><tbody id="mission-list"></tbody></table></div>
</div>
<div id="section-audit" class="section">
<h2>Audit Log</h2>
<div class="toolbar">
<select id="audit-filter"><option value="">All Actions</option><option value="message">Message</option><option value="command">Command</option><option value="delegation">Delegation</option><option value="unlock">Unlock</option><option value="lock">Lock</option><option value="kill">Kill</option><option value="blocked">Blocked</option></select>
</div>
<table><thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Detail</th><th>Blocked</th></tr></thead><tbody id="audit-list"></tbody></table>
</div>
<div id="section-kanban" class="section">
<h2>Kanban Boards</h2>
<div id="kanban-board-list" class="kanban-board-list"></div>
<div id="kanban-board-detail" style="display:none">
<a href="#" class="kanban-back" onclick="showKanbanList()">&larr; Back to boards</a>
<h3 id="kanban-detail-title"></h3>
<div class="kanban-columns" id="kanban-columns"></div>
</div>
</div>
<div id="section-hive" class="section">
<h2>Hive Mind Activity</h2>
<div id="hive-list"></div>
</div>
</div>
<script>
const TOKEN = '${token}';
const API = (path) => path + (path.includes('?') ? '&' : '?') + 'token=' + TOKEN;

function showTab(name) {
document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
document.getElementById('section-' + name).classList.add('active');
document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
document.querySelector('[href="#' + name + '"]')?.classList.add('active');
}

let privacyBlur = false;
function toggleBlur() {
privacyBlur = !privacyBlur;
document.getElementById('app').classList.toggle('privacy-blur', privacyBlur);
}

async function loadAgentStatus() {
try {
const agents = await (await fetch(API('/api/agents/status'))).json();
const rail = document.getElementById('agent-rail');
if (!Array.isArray(agents) || agents.length === 0) {
rail.innerHTML = '<div class=\"agent-card online\" id=\"agent-card-main\"><div class=\"name\">main</div><div class=\"status\">online</div></div>';
return;
}
rail.innerHTML = agents.map(a => {
const cls = a.status === 'busy' ? 'busy' : a.status === 'offline' ? 'offline' : 'online';
return '<div class=\"agent-card ' + cls + '\" id=\"agent-card-' + esc(a.agent_id) + '\"><div class=\"name\">' +
esc(a.agent_id) + '</div><div class=\"status\">' + esc(a.status) + '</div></div>';
}).join('');
} catch(e) { console.error(e); }
}

// SSE EventSource
function connectSSE() {
const statusEl = document.getElementById('sse-status');
const feed = document.getElementById('activity-feed');
const evtSource = new EventSource(API('/api/events'));

evtSource.addEventListener('connected', () => {
statusEl.textContent = 'SSE: connected';
statusEl.style.color = '#2ea043';
});

evtSource.addEventListener('task_completed', (e) => {
const data = JSON.parse(e.data);
addActivity(data.timestamp, 'task_completed', 'Task ' + data.taskId.slice(0,8) + ' completed by ' + data.agentId);
loadAgentStatus();
loadKanbanBoards();
});

evtSource.addEventListener('task_failed', (e) => {
const data = JSON.parse(e.data);
addActivity(data.timestamp, 'task_failed', 'Task ' + data.taskId.slice(0,8) + ' failed on ' + data.agentId);
loadAgentStatus();
loadKanbanBoards();
});

evtSource.addEventListener('user_message', () => {
addActivity(Date.now(), 'message', 'User message received');
});

evtSource.addEventListener('assistant_message', () => {
addActivity(Date.now(), 'response', 'Assistant response sent');
});

evtSource.addEventListener('error', (e) => {
const data = JSON.parse(e.data);
addActivity(data.timestamp, 'error', data.message || 'Unknown error');
});

evtSource.addEventListener('heartbeat_tick', (e) => {
const data = JSON.parse(e.data);
const dot = document.getElementById('heartbeat-dot');
if (dot) dot.style.background = data.status === 'ok' ? '#2ea043' : data.status === 'degraded' ? '#d29922' : '#da3633';
});

evtSource.onerror = () => {
statusEl.textContent = 'SSE: disconnected';
statusEl.style.color = '#da3633';
setTimeout(connectSSE, 3000);
};
}

function addActivity(timestamp, event, msg) {
const feed = document.getElementById('activity-feed');
if (feed.querySelector('li')?.textContent === 'Waiting for events...') {
feed.innerHTML = '';
}
const li = document.createElement('li');
const time = new Date(timestamp).toLocaleTimeString();
li.innerHTML = '<span class="time">' + time + '</span><span class="event">' + event + '</span><span class="msg">' + esc(msg) + '</span>';
feed.insertBefore(li, feed.firstChild);
if (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

async function loadOverview() {
try {
const memories = await (await fetch(API('/api/memories?limit=1'))).json();
const tasks = await (await fetch(API('/api/tasks'))).json();
const agents = await (await fetch(API('/api/agents'))).json();
document.getElementById('stat-memories').textContent = Array.isArray(memories) ? memories.length : 0;
document.getElementById('stat-agents').textContent = Array.isArray(agents) ? agents.length : 1;
document.getElementById('stat-tasks').textContent = (tasks.missions||[]).filter(t=>t.status==='queued').length;
document.getElementById('stat-uptime').textContent = 'running';
loadAgentStatus();
} catch(e) { console.error(e); }
}

async function loadMemory() {
const memories = await (await fetch(API('/api/memories?limit=100'))).json();
const list = document.getElementById('memory-list');
if (!Array.isArray(memories)) { list.innerHTML = '<p>No memories</p>'; return; }
list.innerHTML = memories.map(m => '<div class="memory-item"><div><span class="importance" style="background:' +
(hsl(m.importance||0.5)) + ';width:' + (m.importance*100||50) + '%"></span>' +
'<span class="blur-target">' + esc(m.summary) + '</span></div>' +
'<div style="color:#7d8a9a;font-size:11px;margin-top:4px">Importance: ' + (m.importance||0).toFixed(2) +
' | Salience: ' + (m.salience||0).toFixed(2) +
(m.pinned ? ' | 📌 Pinned' : '') + '</div></div>').join('');
}

async function loadAgents() {
const agents = await (await fetch(API('/api/agents'))).json();
const list = document.getElementById('agent-list');
if (!Array.isArray(agents) || agents.length === 0) {
list.innerHTML = '<div class="card"><p>No agents configured. Create one with the agent creation wizard.</p></div>';
return;
}
list.innerHTML = agents.map(a => '<div class="stat"><div class="value" style="color:'+(a.color||'#E07A4F')+'">' +
esc(a.name||a.id) + '</div><div class="label">' + esc(a.model||'') + '<br>' +
(a.personality||'').slice(0,60) + '</div></div>').join('');
}

async function loadTasks() {
const data = await (await fetch(API('/api/tasks'))).json();
const schedList = document.getElementById('scheduled-tasks');
if (Array.isArray(data.scheduled)) {
schedList.innerHTML = data.scheduled.map(t => '<tr><td>' + esc(t.id).slice(0,8) +
'</td><td>' + esc(t.prompt).slice(0,40) + '</td><td>' + esc(t.schedule) +
'</td><td>' + esc(t.status) + '</td><td>' + esc(t.next_run||'') + '</td></tr>').join('');
}
const misList = document.getElementById('mission-list');
if (Array.isArray(data.missions)) {
misList.innerHTML = data.missions.map(m => '<tr><td>' + esc(m.id).slice(0,8) +
'</td><td>' + esc(m.title) + '</td><td>' + esc(m.assigned_agent||'-') +
'</td><td>' + (m.priority||3) + '</td><td>' + esc(m.status) + '</td></tr>').join('');
}
}

async function loadAudit() {
const entries = await (await fetch(API('/api/audit-log'))).json();
const list = document.getElementById('audit-list');
if (!Array.isArray(entries)) { list.innerHTML = '<tr><td colspan="5">No entries</td></tr>'; return; }
list.innerHTML = entries.map(e => '<tr class="' + (e.blocked ? 'blur-target' : '') +
'"><td>' + esc(e.created_at||'') + '</td><td>' + esc(e.agent_id) +
'</td><td>' + esc(e.action) + '</td><td class="blur-target">' + esc((e.detail||'').slice(0,60)) +
'</td><td>' + (e.blocked ? '🚫' : '') + '</td></tr>').join('');
}

async function loadActivityFeed() {
try {
const entries = await (await fetch(API('/api/activity?limit=30'))).json();
const feed = document.getElementById('activity-feed');
if (!Array.isArray(entries) || entries.length === 0) return;
feed.innerHTML = '';
entries.forEach(e => {
const li = document.createElement('li');
const time = new Date(e.timestamp).toLocaleTimeString();
li.innerHTML = '<span class="time">' + time + '</span><span class="event">' + e.event + '</span><span class="msg">' + esc(e.summary || '') + '</span>';
feed.appendChild(li);
});
} catch(e) { console.error(e); }
}

async function loadHive() {
const entries = await (await fetch(API('/api/hive-mind'))).json();
const list = document.getElementById('hive-list');
if (!Array.isArray(entries)) { list.innerHTML = '<p>No activity</p>'; return; }
list.innerHTML = entries.map(e => '<div class="memory-item"><b>' + esc(e.agent_id) +
'</b> ' + esc(e.action) + ': <span class="blur-target">' + esc(e.summary) +
'</span><div style="color:#7d8a9a;font-size:11px">' + esc(e.created_at||'') + '</div></div>').join('');
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function hsl(v) { var h = ((1-v)*120).toString(10); return 'hsl('+h+',70%,50%)'; }

// Kanban
let kanbanBoards = [];
let kanbanTasks = {};

async function loadKanbanBoards() {
try {
kanbanBoards = await (await fetch(API('/api/kanban/boards'))).json();
const list = document.getElementById('kanban-board-list');
if (!Array.isArray(kanbanBoards) || kanbanBoards.length === 0) {
list.innerHTML = '<p style="color:#7d8a9a">No boards. Create one with /kanban.</p>';
return;
}
list.innerHTML = kanbanBoards.map(b => '<div class="kanban-board-card" onclick="showKanbanBoard(\'' + b.id + '\')">' +
'<div class="btitle">' + esc(b.title) + '</div>' +
'<div class="bmeta">' + esc(b.status) + ' &middot; ' + (b.task_count||0) + ' tasks</div>' +
'<div class="bprogress"><div class="bfill" style="width:' + (b.progress_pct||0) + '%"></div></div></div>').join('');
} catch(e) { console.error(e); }
}

async function showKanbanBoard(boardId) {
document.getElementById('kanban-board-list').style.display = 'none';
document.getElementById('kanban-board-detail').style.display = 'block';
const data = await (await fetch(API('/api/kanban/board/' + boardId))).json();
document.getElementById('kanban-detail-title').textContent = data.board.title;
const columns = document.getElementById('kanban-columns');
const statuses = ['triage', 'ready', 'running', 'paused', 'completed', 'failed'];
columns.innerHTML = statuses.map(s => {
const tasks = (data.tasks||[]).filter(t => t.status === s);
return '<div class="kanban-col"><h4>' + s + ' (' + tasks.length + ')</h4>' +
tasks.map(t => '<div class="kanban-task-card" title="' + esc(t.title) + '"><b>' + esc(t.title).slice(0,20) +
'</b><div class="tassignee">' + (t.assignee ? '@' + esc(t.assignee) : 'unassigned') + '</div></div>').join('') +
'</div>';
}).join('');
}

function showKanbanList() {
document.getElementById('kanban-board-list').style.display = '';
document.getElementById('kanban-board-detail').style.display = 'none';
loadKanbanBoards();
}

setInterval(() => { loadOverview(); }, 30000);
setInterval(() => { loadAgentStatus(); }, 10000);
setInterval(() => { loadKanbanBoards(); }, 15000);

connectSSE();
loadOverview(); loadAgentStatus(); loadActivityFeed(); loadKanbanBoards(); loadMemory(); loadAgents(); loadTasks(); loadAudit(); loadHive();
</script>
</body>
</html>`
}
