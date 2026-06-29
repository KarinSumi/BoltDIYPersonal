extends Node

enum GhostState { SPAWNING, WORKING, RETURNING, DISSOLVING, STUCK }

signal ghost_spawned(agent_id: String, task: String)
signal ghost_completed(agent_id: String)
signal ghost_stuck(agent_id: String)

const DECK_HEIGHT := 8.0
const DESK_COUNT := 12
const DESK_SPACING := 2.5
const DECK_RADIUS := 6.0
const GHOST_ALPHA := 0.6
const STUCK_TIMEOUT_SEC := 360.0
const GLIDE_SPEED := 2.0
const DISSOLVE_DURATION := 1.5

class GhostAgent:
	var id: String
	var name: String
	var task: String
	var state: int = GhostState.SPAWNING
	var node: Node3D
	var desk_index: int
	var spawn_position: Vector3
	var desk_position: Vector3
	var state_timer: float = 0.0
	var stuck_since: float = 0.0
	var dissolve_progress: float = 0.0
	var nameplate: Label3D
	var status_label: Label3D
	var pulse_timer: float = 0.0

var _ghosts: Dictionary = {}
var _desk_nodes: Array = []
var _deck_node: Node3D
var _staircase_node: Node3D

@onready var am := get_node("/root/World/AgentManager")


func _ready() -> void:
	_build_deck()
	_build_staircase()

	var ec := get_node("/root/World/EventClient")
	if ec:
		ec.ghost_spawn.connect(_on_ghost_spawn)
		ec.ghost_dissolve.connect(_on_ghost_dissolve)


func _process(delta: float) -> void:
	var now := Time.get_ticks_usec() / 1_000_000.0

	for ghost_id: String in _ghosts:
		var ghost: GhostAgent = _ghosts[ghost_id]
		if not ghost.node:
			continue

		match ghost.state:
			GhostState.SPAWNING:
				ghost.state_timer += delta
				var t := clamp(ghost.state_timer / 1.0, 0.0, 1.0)
				var target := ghost.desk_position
				ghost.node.global_position = ghost.spawn_position.lerp(target, ease(t, 0.5))
				ghost.node.global_position.y += sin(t * PI) * 2.0
				ghost.node.modulate.a = lerp(0.0, GHOST_ALPHA, t)
				if t >= 1.0:
					ghost.state = GhostState.WORKING
					ghost.state_timer = 0.0

			GhostState.WORKING:
				ghost.state_timer += delta
				ghost.pulse_timer += delta
				if ghost.pulse_timer > 2.0:
					ghost.pulse_timer = 0.0
					if ghost.node:
						var tween := create_tween()
						tween.tween_property(ghost.node, "scale", Vector3(1.05, 1.05, 1.05), 0.5)
						tween.tween_property(ghost.node, "scale", Vector3(1.0, 1.0, 1.0), 0.5)

				if ghost.state_timer > STUCK_TIMEOUT_SEC:
					ghost.state = GhostState.STUCK
					ghost.stuck_since = ghost.state_timer
					ghost_stuck.emit(ghost.id)
					if ghost.status_label:
						ghost.status_label.text = "STUCK"
						ghost.status_label.modulate = Color(1.0, 0.2, 0.2)
					_reap_ghost(ghost)

			GhostState.RETURNING:
				ghost.state_timer += delta
				var t := clamp(ghost.state_timer / 2.0, 0.0, 1.0)
				var start := ghost.node.global_position
				ghost.node.global_position = start.lerp(ghost.spawn_position, ease(t, 0.3))
				ghost.node.global_position.y += sin(t * PI) * 1.5
				ghost.node.modulate.a = lerp(GHOST_ALPHA, 0.0, t)
				if t >= 1.0:
					ghost.state = GhostState.DISSOLVING
					ghost.state_timer = 0.0

			GhostState.DISSOLVING:
				ghost.state_timer += delta
				ghost.dissolve_progress = ghost.state_timer / DISSOLVE_DURATION
				ghost.node.modulate.a = lerp(GHOST_ALPHA, 0.0, ghost.dissolve_progress)
				var scale_factor := lerp(1.0, 0.3, ghost.dissolve_progress)
				ghost.node.scale = Vector3(scale_factor, scale_factor, scale_factor)
				if ghost.dissolve_progress >= 1.0:
					_remove_ghost(ghost_id)
					ghost_completed.emit(ghost_id)


func _build_deck() -> void:
	_deck_node = Node3D.new()
	_deck_node.name = "GhostDeck"
	_deck_node.position = Vector3(0, DECK_HEIGHT, 0)
	add_child(_deck_node)

	var platform := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = DECK_RADIUS
	cyl.bottom_radius = DECK_RADIUS
	cyl.height = 0.2
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.4, 0.6, 1.0, 0.15)
	mat.metallic = 0.8
	mat.roughness = 0.1
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color.a = 0.15
	cyl.material = mat
	platform.mesh = cyl
	platform.position.y = 0.1
	_deck_node.add_child(platform)

	for i in DESK_COUNT:
		var angle := (float(i) / DESK_COUNT) * TAU
		var radius := DECK_RADIUS * 0.7
		var pos := Vector3(cos(angle) * radius, 0.2, sin(angle) * radius)

		var desk := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(1.5, 0.1, 1.0)
		var desk_mat := StandardMaterial3D.new()
		desk_mat.albedo_color = Color(0.6, 0.7, 1.0, 0.3)
		desk_mat.metallic = 0.5
		desk_mat.roughness = 0.3
		desk_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		box.material = desk_mat
		desk.mesh = box
		desk.position = pos
		desk.rotation.y = angle + PI / 2
		var desk_label := Label3D.new()
		desk_label.text = "Desk %d" % [i + 1]
		desk_label.font_size = 14
		desk_label.modulate = Color(1, 1, 1, 0.4)
		desk_label.position = Vector3(0, 0.3, 0)
		desk_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		desk_label.fixed_size = true
		desk.add_child(desk_label)
		_deck_node.add_child(desk)
		_desk_nodes.append(desk)


func _build_staircase() -> void:
	_staircase_node = Node3D.new()
	_staircase_node.name = "GhostStaircase"
	_staircase_node.position = Vector3(DECK_RADIUS, 0, 0)
	add_child(_staircase_node)

	var step_count := 16
	var step_height := DECK_HEIGHT / step_count
	var step_depth := 0.5

	for i in step_count:
		var step := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(1.5, step_height * 0.8, step_depth)
		var step_mat := StandardMaterial3D.new()
		step_mat.albedo_color = Color(0.5, 0.6, 0.9, 0.2)
		step_mat.metallic = 0.6
		step_mat.roughness = 0.2
		step_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		box.material = step_mat
		step.mesh = box
		step.position = Vector3(-step_depth * i * 0.5, step_height * i + step_height / 2, 0)
		_staircase_node.add_child(step)


func _on_ghost_spawn(data: Dictionary) -> void:
	var agent_id: String = data.get("agent_id", "ghost_%d" % _ghosts.size())
	var task: String = data.get("task", "Unknown task")
	var name: String = data.get("name", "Sub-Agent")

	var ghost := GhostAgent.new()
	ghost.id = agent_id
	ghost.name = name
	ghost.task = task
	ghost.desk_index = _find_free_desk()

	if ghost.desk_index < 0:
		return

	var desk := _desk_nodes[ghost.desk_index] as Node3D
	ghost.spawn_position = Vector3(
		_desk_nodes[ghost.desk_index].global_position.x,
		DECK_HEIGHT + 5.0,
		_desk_nodes[ghost.desk_index].global_position.z
	)
	ghost.desk_position = desk.global_position + Vector3(0, 0.8, 0)

	ghost.node = _create_ghost_mesh(ghost)
	add_child(ghost.node)
	ghost.node.global_position = ghost.spawn_position
	ghost.node.modulate.a = 0.0
	ghost.state = GhostState.SPAWNING
	ghost.state_timer = 0.0

	_ghosts[agent_id] = ghost
	ghost_spawned.emit(agent_id, task)


func _on_ghost_dissolve(data: Dictionary) -> void:
	var agent_id: String = data.get("agent_id", "")
	if not _ghosts.has(agent_id):
		return

	var ghost: GhostAgent = _ghosts[agent_id]
	if ghost.state == GhostState.WORKING:
		ghost.state = GhostState.RETURNING
		ghost.state_timer = 0.0
		if ghost.status_label:
			ghost.status_label.text = "DONE"
			ghost.status_label.modulate = Color(0.2, 1.0, 0.2)


func _create_ghost_mesh(ghost: GhostAgent) -> Node3D:
	var container := Node3D.new()
	container.name = "Ghost_%s" % ghost.id

	var body := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.5, 1.2, 0.4)
	var body_mat := StandardMaterial3D.new()
	body_mat.albedo_color = Color(0.6, 0.7, 1.0, GHOST_ALPHA)
	body_mat.metallic = 0.3
	body_mat.roughness = 0.4
	body_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	box.material = body_mat
	body.mesh = box
	body.position.y = 0.6
	container.add_child(body)

	var head := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.18
	sphere.height = 0.36
	var head_mat := StandardMaterial3D.new()
	head_mat.albedo_color = Color(0.7, 0.8, 1.0, GHOST_ALPHA)
	head_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sphere.material = head_mat
	head.mesh = sphere
	head.position.y = 1.3
	container.add_child(head)

	var glow := MeshInstance3D.new()
	var glow_sphere := SphereMesh.new()
	glow_sphere.radius = 0.3
	glow_sphere.height = 0.6
	var glow_mat := StandardMaterial3D.new()
	glow_mat.albedo_color = Color(0.4, 0.6, 1.0, 0.2)
	glow_mat.emission_enabled = true
	glow_mat.emission = Color(0.4, 0.6, 1.0)
	glow_mat.emission_energy_multiplier = 0.3
	glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glow_sphere.material = glow_mat
	glow.mesh = glow_sphere
	glow.position.y = 0.6
	container.add_child(glow)

	ghost.nameplate = Label3D.new()
	ghost.nameplate.text = ghost.name
	ghost.nameplate.font_size = 20
	ghost.nameplate.outline_size = 2
	ghost.nameplate.outline_modulate = Color(0.2, 0.3, 0.6)
	ghost.nameplate.modulate = Color(0.8, 0.9, 1.0, GHOST_ALPHA)
	ghost.nameplate.position.y = 1.8
	ghost.nameplate.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	ghost.nameplate.fixed_size = true
	container.add_child(ghost.nameplate)

	ghost.status_label = Label3D.new()
	ghost.status_label.text = "WORKING"
	ghost.status_label.font_size = 16
	ghost.status_label.modulate = Color(0.6, 0.8, 1.0, GHOST_ALPHA)
	ghost.status_label.position.y = 1.5
	ghost.status_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	ghost.status_label.fixed_size = true
	container.add_child(ghost.status_label)

	return container


func _find_free_desk() -> int:
	var occupied := PackedInt32Array()
	for ghost_id: String in _ghosts:
		var ghost: GhostAgent = _ghosts[ghost_id]
		if ghost.state < GhostState.RETURNING:
			occupied.append(ghost.desk_index)

	for i in DESK_COUNT:
		if not occupied.has(i):
			return i
	return -1


func _remove_ghost(ghost_id: String) -> void:
	if not _ghosts.has(ghost_id):
		return
	var ghost: GhostAgent = _ghosts[ghost_id]
	if ghost.node:
		ghost.node.queue_free()
	_ghosts.erase(ghost_id)


func _reap_ghost(ghost: GhostAgent) -> void:
	if ghost.node:
		var tween := create_tween()
		tween.set_parallel(true)
		tween.tween_property(ghost.node, "modulate:a", 0.0, 1.0)
		tween.tween_property(ghost.node, "scale", Vector3(0.1, 0.1, 0.1), 1.0)
		tween.tween_callback(func(): _remove_ghost(ghost.id))


func get_ghost_count() -> int:
	var count := 0
	for ghost_id: String in _ghosts:
		if _ghosts[ghost_id].state < GhostState.DISSOLVING:
			count += 1
	return count


func list_active_ghosts() -> Array:
	var result: Array = []
	for ghost_id: String in _ghosts:
		var ghost: GhostAgent = _ghosts[ghost_id]
		result.append({
			id = ghost.id,
			name = ghost.name,
			task = ghost.task,
			state = ghost.state,
			desk = ghost.desk_index + 1,
		})
	return result
