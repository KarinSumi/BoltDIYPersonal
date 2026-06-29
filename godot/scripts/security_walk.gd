extends Node

signal permission_resolved(request_id, agent_id, tool, decision)

var event_client = null
var agent_manager = null
var hud = null
var world_builder = null

var active_walks = {}

var walk_speed_modifier = 0.7
var security_center_room_type = "security"

func _ready():
    event_client = get_node("/root/Main/EventClient")
    agent_manager = get_node("/root/Main/AgentManager")
    hud = get_node("/root/Main/HUD")
    world_builder = get_node("/root/Main/WorldBuilder")

    if event_client:
        event_client.message_received.connect(_on_ws_message)

func _on_ws_message(event_type, data):
    match event_type:
        "permission_requested":
            _handle_permission_requested(data)
        "permission_approved":
            _handle_permission_resolved(data.request_id, "approved")
        "permission_denied":
            _handle_permission_resolved(data.request_id, "denied")
        "permission_timeout":
            _handle_permission_resolved(data.request_id, "timeout")

func _handle_permission_requested(data):
    var agent_id = data.agent_id
    var tool = data.tool
    var request_id = data.request_id

    var original_pos = agent_manager.get_position(agent_id)
    if original_pos == null:
        return

    var security_pos = world_builder.find_room_by_type(security_center_room_type)
    if security_pos == null:
        return

    active_walks[agent_id] = {
        request_id = request_id,
        tool = tool,
        original_pos = original_pos,
        security_pos = security_pos,
        state = "walking_to_security",
    }

    if hud:
        hud.show_effect(agent_id, "amber_pulse")

    if hud:
        hud.show_effect(agent_id, "exclamation")

    agent_manager.set_status(agent_id, "walking_to_security")
    agent_manager.move_to(agent_id, security_pos, Callable(self, "_on_arrived_at_security").bind(agent_id))

func _on_arrived_at_security(agent_id):
    var walk = active_walks.get(agent_id)
    if walk == null:
        return

    walk.state = "at_security"

    agent_manager.face_position(agent_id, walk.security_pos + Vector3(0, 0, 2))

    if hud:
        hud.show_effect("security_room", "glow_perimeter")

func _handle_permission_resolved(request_id, decision):
    var agent_id = null
    for aid in active_walks:
        if active_walks[aid].request_id == request_id:
            agent_id = aid
            break

    if agent_id == null:
        return

    var walk = active_walks[agent_id]
    walk.state = "returning"

    if decision == "approved":
        if hud:
            hud.show_effect(agent_id, "green_flash")
    elif decision == "denied":
        if hud:
            hud.show_effect(agent_id, "red_flash")
            hud.show_effect(agent_id, "head_shake")
    elif decision == "timeout":
        if hud:
            hud.show_effect(agent_id, "amber_flash")

    agent_manager.set_status(agent_id, "returning_from_security")
    agent_manager.move_to(agent_id, walk.original_pos, Callable(self, "_on_returned_from_security").bind(agent_id))

func _on_returned_from_security(agent_id):
    var walk = active_walks.get(agent_id)
    if walk == null:
        return

    agent_manager.set_status(agent_id, "idle")
    if hud:
        hud.clear_effect("security_room")

    permission_resolved.emit(walk.request_id, agent_id, walk.tool, walk.state)

    active_walks.erase(agent_id)
