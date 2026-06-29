extends Node

enum State { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING }

signal connected()
signal world_state(data)
signal agent_update(data)
signal room_layout(data)
signal chat_reply(data)
signal permission_requested(data)
signal ghost_spawn(data)
signal ghost_dissolve(data)

const WS_URL := "ws://127.0.0.1:8787/ws"
const BASE_RECONNECT_DELAY := 1.0
const MAX_RECONNECT_DELAY := 30.0
const PING_INTERVAL := 30.0

var _state: State = State.DISCONNECTED
var _socket: WebSocketPeer = WebSocketPeer.new()
var _reconnect_attempts: int = 0
var _reconnect_timer: float = 0.0
var _ping_timer: float = 0.0
var _pending_reconnect: bool = false


func _ready() -> void:
	_connect_to_server()


func _process(delta: float) -> void:
	match _state:
		State.CONNECTING, State.RECONNECTING:
			_reconnect_timer -= delta
			if _reconnect_timer <= 0.0:
				_try_connect()

		State.CONNECTED:
			_socket.poll()
			_ping_timer += delta
			if _ping_timer >= PING_INTERVAL:
				_send_ping()
				_ping_timer = 0.0

			match _socket.get_ready_state():
				WebSocketPeer.STATE_OPEN:
					while _socket.get_available_packet_count() > 0:
						var packet := _socket.get_packet()
						var text := packet.get_string_from_utf8()
						_handle_message(text)

				WebSocketPeer.STATE_CLOSING, WebSocketPeer.STATE_CLOSED:
					_state = State.RECONNECTING
					_schedule_reconnect()

		State.DISCONNECTED:
			if _pending_reconnect:
				_reconnect_timer -= delta
				if _reconnect_timer <= 0.0:
					_try_connect()


func _connect_to_server() -> void:
	_state = State.CONNECTING
	_reconnect_attempts = 0
	_reconnect_timer = 0.0
	_pending_reconnect = false


func _try_connect() -> void:
	var err := _socket.connect_to_url(WS_URL)
	if err != OK:
		_schedule_reconnect()
		return

	_socket.poll()
	_state = State.CONNECTING


func _schedule_reconnect() -> void:
	var delay := BASE_RECONNECT_DELAY * pow(2, _reconnect_attempts)
	delay = min(delay, MAX_RECONNECT_DELAY)
	_reconnect_timer = delay
	_reconnect_attempts += 1
	_pending_reconnect = true
	_state = State.RECONNECTING


func _handle_message(text: String) -> void:
	var json := JSON.parse_string(text)
	if typeof(json) != TYPE_DICTIONARY:
		return

	var msg_type: String = json.get("type", "")
	var data = json.get("data", {})

	match msg_type:
		"connected":
			_state = State.CONNECTED
			_reconnect_attempts = 0
			_pending_reconnect = false
			connected.emit()

		"world_state":
			world_state.emit(data)

		"agent_update":
			agent_update.emit(data)

		"room_layout":
			room_layout.emit(data)

		"chat_reply":
			chat_reply.emit(data)

		"permission_requested":
			permission_requested.emit(data)

		"ghost_spawn":
			ghost_spawn.emit(data)

		"ghost_dissolve":
			ghost_dissolve.emit(data)


func send_event(type: String, data: Dictionary = {}) -> void:
	if _state != State.CONNECTED:
		return

	var msg := JSON.stringify({ "type": type, "data": data })
	_socket.send_text(msg)


func _send_ping() -> void:
	if _socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_socket.send_text(JSON.stringify({ "type": "ping" }))


func get_current_state() -> State:
	return _state
