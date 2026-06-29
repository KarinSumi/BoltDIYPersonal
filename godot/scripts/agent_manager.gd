extends Node

enum AgentState { IDLE, WALKING, WORKING, MEETING, BLOCKED, OFFLINE }

signal agent_arrived(agent_id: String, room: String)
signal agent_state_changed(agent_id: String, old_state: int, new_state: int)

const PATH_TIMEOUT_FRAMES := 120
const AGENT_HEIGHT := 1.8
const AGENT_RADIUS := 0.3
const WALK_SPEED := 3.0
const TURN_SPEED := 8.0

class Agent:
	var id: String
	var name: String
	var role: String
	var avatar_color: Color
	var model: String
	var node: CharacterBody3D
	var nameplate: Node3D
	var state: int = AgentState.IDLE
	var path: Array = []
	var path_index: int = 0
	var path_timeout: int = 0
	var current_room: String = ""
	var target_position: Vector3
	var animation_frame: int = 0
	var anim_timer: float = 0.0

var _agents: Dictionary = {}

@onready var world_builder := get_node("/root/World/WorldBuilder")


func _ready() -> void:
	var ec := get_node("/root/World/EventClient")
	if ec:
		ec.agent_update.connect(_on_agent_update)


func _process(delta: float) -> void:
	for agent_id: String in _agents:
		var agent: Agent = _agents[agent_id]
		if agent.state == AgentState.WALKING:
			_process_movement(agent, delta)

	if world_builder:
		for agent_id: String in _agents:
			var agent: Agent = _agents[agent_id]
			if agent.node:
				world_builder.check_door_proximity(agent.node.global_position)


func _on_agent_update(data: Dictionary) -> void:
	var agent_id: String = data.get("id", "")
	if agent_id.is_empty():
		return

	if not _agents.has(agent_id):
		spawn_agent(data)
		return

	var agent: Agent = _agents[agent_id]
	var new_state_str: String = data.get("state", "")
	if not new_state_str.is_empty():
		var new_state := _state_from_string(new_state_str)
		if new_state != agent.state:
			var old_state := agent.state
			agent.state = new_state
			agent_state_changed.emit(agent_id, old_state, new_state)

	var pos_data: Dictionary = data.get("position", {})
	if not pos_data.is_empty():
		var pos := Vector3(
			pos_data.get("x", agent.node.global_position.x),
			0,
			pos_data.get("z", agent.node.global_position.z)
		)
		agent.node.global_position = pos

	var status: String = data.get("status", "")
	if not status.is_empty():
		agent.current_room = status


func _state_from_string(s: String) -> int:
	match s.to_lower():
		"idle": return AgentState.IDLE
		"walking": return AgentState.WALKING
		"working": return AgentState.WORKING
		"meeting": return AgentState.MEETING
		"blocked": return AgentState.BLOCKED
		"offline": return AgentState.OFFLINE
	return AgentState.IDLE


func spawn_agent(config: Dictionary) -> void:
	var agent := Agent.new()
	agent.id = config.get("id", "agent_%d" % _agents.size())
	agent.name = config.get("name", "Agent")
	agent.role = config.get("role", "Member")
	agent.avatar_color = _parse_color(config.get("avatar_color", "#3498db"))
	agent.model = config.get("model", "default")

	var body := CharacterBody3D.new()
	body.name = "Agent_%s" % agent.id

	var collision := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = AGENT_RADIUS
	shape.height = AGENT_HEIGHT
	collision.shape = shape
	collision.position.y = AGENT_HEIGHT / 2
	body.add_child(collision)

	var mesh_instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.6, AGENT_HEIGHT * 0.8, 0.6)
	box.material = _create_agent_material(agent.avatar_color)
	mesh_instance.mesh = box
	mesh_instance.position.y = AGENT_HEIGHT * 0.4 + 0.1
	body.add_child(mesh_instance)

	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.25
	sphere.height = 0.5
	var head_mat := StandardMaterial3D.new()
	head_mat.albedo_color = Color(0.9, 0.85, 0.8)
	head_mat.roughness = 0.6
	sphere.material = head_mat
	head.mesh = sphere
	head.position.y = AGENT_HEIGHT * 0.8 + 0.1
	body.add_child(head)

	var label := Label3D.new()
	label.name = "Nameplate"
	label.text = agent.name
	label.font_size = 32
	label.outline_size = 4
	label.outline_modulate = Color.BLACK
	label.modulate = Color.WHITE
	label.position.y = AGENT_HEIGHT + 0.3
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.fixed_size = true
	body.add_child(label)

	add_child(body)

	var spawn_pos := _find_spawn_position()
	body.global_position = spawn_pos

	agent.node = body
	agent.nameplate = label
	agent.state = AgentState.IDLE
	_agents[agent.id] = agent

	agent_state_changed.emit(agent.id, -1, AgentState.IDLE)


func _create_agent_material(color: Color) -> Material:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.metallic = 0.1
	mat.roughness = 0.6
	return mat


func _parse_color(color_val) -> Color:
	if color_val is Color:
		return color_val
	if color_val is String:
		var c := Color()
		c.from_string(color_val)
		return c
	return Color(0.2, 0.6, 0.9)


func _find_spawn_position() -> Vector3:
	if world_builder:
		var room_cells := world_builder.get_room_cells()
		for slot: int in room_cells:
			var room := room_cells[slot] as Node3D
			if room:
				return room.global_position + Vector3(0, 0, 2)
	return Vector3.ZERO


func move_to(agent_id: String, target_position: Vector3) -> Array:
	if not _agents.has(agent_id):
		return []

	var agent: Agent = _agents[agent_id]
	var start := agent.node.global_position

	var path := _find_path(start, target_position)

	if path.is_empty():
		path = [start, target_position]

	agent.path = path
	agent.path_index = 0
	agent.path_timeout = 0
	agent.target_position = target_position
	agent.state = AgentState.WALKING

	return path


func _find_path(from: Vector3, to: Vector3) -> Array:
	var path: Array = [from]

	if not world_builder:
		path.append(to)
		return path

	var room_cells := world_builder.get_room_cells()
	var waypoints: Array = []

	for slot: int in room_cells:
		var wp := world_builder.get_world_nav_points(slot)
		for p in wp:
			waypoints.append(p)

	if waypoints.is_empty():
		path.append(to)
		return path

	var start_waypoint := _find_nearest_waypoint(from, waypoints)
	var end_waypoint := _find_nearest_waypoint(to, waypoints)

	var astar := AStar3D.new()
	var idx_map: Dictionary = {}
	var ridx: int = 0

	for wp in waypoints:
		astar.add_point(ridx, wp)
		idx_map[ridx] = wp
		ridx += 1

	for i in ridx:
		for j in ridx:
			if i >= j:
				continue
			var d := waypoints[i].distance_to(waypoints[j])
			if d < 10.0:
				astar.connect_points(i, j)

	if start_waypoint >= 0:
		var start_id := ridx
		astar.add_point(start_id, from)
		for i in ridx:
			var d := from.distance_to(waypoints[i])
			if d < 5.0:
				astar.connect_points(start_id, i)
		ridx += 1
	else:
		return [from, to]

	if end_waypoint >= 0:
		var end_id := ridx
		astar.add_point(end_id, to)
		for i in ridx - 1:
			var d := to.distance_to(astar.get_point_position(i))
			if d < 5.0:
				astar.connect_points(end_id, i)

	if start_waypoint >= 0:
		var sp := ridx - (1 if end_waypoint >= 0 else 0) - 1
		var ep := ridx - 1 if end_waypoint >= 0 else sp

		var astar_path := astar.get_point_ids()
		var sp_idx := sp
		var ep_idx := ep

		var result := astar.get_id_path(sp_idx, ep_idx)
		for idx in result:
			path.append(astar.get_point_position(idx))

	if path.size() <= 1:
		path.append(to)

	return path


func _find_nearest_waypoint(pos: Vector3, waypoints: Array) -> int:
	var best_idx := -1
	var best_dist := INF
	for i in waypoints.size():
		var d := pos.distance_to(waypoints[i])
		if d < best_dist:
			best_dist = d
			best_idx = i
	if best_dist < 15.0:
		return best_idx
	return -1


func _process_movement(agent: Agent, delta: float) -> void:
	if agent.path.is_empty() or agent.path_index >= agent.path.size():
		agent.state = AgentState.IDLE
		agent.current_room = _detect_current_room(agent.node.global_position)
		agent_arrived.emit(agent.id, agent.current_room)
		agent_path_timeout = 0
		return

	agent.path_timeout += 1
	if agent.path_timeout > PATH_TIMEOUT_FRAMES:
		agent.state = AgentState.BLOCKED
		agent_state_changed.emit(agent.id, AgentState.WALKING, AgentState.BLOCKED)
		return

	var target: Vector3 = agent.path[agent.path_index]
	var current := agent.node.global_position
	var dir := target - current
	dir.y = 0.0

	if dir.length() < 0.2:
		agent.path_index += 1
		return

	dir = dir.normalized()

	var target_rotation := atan2(-dir.x, -dir.z)
	agent.node.rotation.y = lerp_angle(agent.node.rotation.y, target_rotation, TURN_SPEED * delta)

	var velocity := dir * WALK_SPEED
	agent.node.velocity = velocity
	agent.node.move_and_slide()

	agent.anim_timer += delta
	if agent.anim_timer > 0.15:
		agent.animation_frame = (agent.animation_frame + 1) % 4
		agent.anim_timer = 0.0

		var sw := agent.node.get_node_or_null("Nameplate")
		if sw:
			sw.position.y = AGENT_HEIGHT + 0.3 + sin(Time.get_ticks_msec() * 0.003) * 0.05


func _detect_current_room(pos: Vector3) -> String:
	if not world_builder:
		return ""
	var result := world_builder.get_room_at_position(pos)
	return result.get("type", "")


func get_agent(agent_id: String) -> Agent:
	return _agents.get(agent_id, null)


func get_all_agents() -> Array:
	var result: Array = []
	for agent_id: String in _agents:
		result.append(_agents[agent_id])
	return result


func remove_agent(agent_id: String) -> void:
	if not _agents.has(agent_id):
		return
	var agent: Agent = _agents[agent_id]
	if agent.node:
		agent.node.queue_free()
	_agents.erase(agent_id)
