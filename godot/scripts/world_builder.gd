extends Node

signal room_placed(slot: int, room_type: String)
signal door_opened(door_node: Node3D)
signal door_closed(door_node: Node3D)

const GRID_SIZE := 3
const ROOM_SIZE := 10.0
const HALF_ROOM := ROOM_SIZE / 2.0
const WALL_HEIGHT := 4.0
const DOOR_WIDTH := 2.0
const DOOR_HEIGHT := 3.0
const DOOR_OPEN_RANGE := 2.0

var _room_cells: Dictionary = {}
var _door_nodes: Array = []
var _room_configs: Dictionary = {}

var _agent_positions: Dictionary = {}

const ROOM_DEFS := {
	executive: {
		label = "Executive",
		furniture = [
			{ type = "desk", pos = Vector3(0, 0, -1), size = Vector3(3, 0.1, 1.5) },
			{ type = "chair", pos = Vector3(-1.5, 0, 0), rot = 90 },
			{ type = "cabinet", pos = Vector3(3, 0, 2) },
			{ type = "plant", pos = Vector3(-3, 0, 3) },
		],
		agent_anchors = [Vector3(0, 0, 0)],
		nav_points = [Vector3(-2, 0, -2), Vector3(2, 0, 2), Vector3(0, 0, 0)],
		light_color = Color(1.0, 0.85, 0.6),
		light_energy = 0.8
	},
	operations: {
		label = "Operations",
		furniture = [
			{ type = "desk", pos = Vector3(-3, 0, -2), size = Vector3(2.5, 0.1, 1.2) },
			{ type = "desk", pos = Vector3(0, 0, -2), size = Vector3(2.5, 0.1, 1.2) },
			{ type = "desk", pos = Vector3(3, 0, -2), size = Vector3(2.5, 0.1, 1.2) },
			{ type = "desk", pos = Vector3(-3, 0, 1), size = Vector3(2.5, 0.1, 1.2) },
			{ type = "desk", pos = Vector3(0, 0, 1), size = Vector3(2.5, 0.1, 1.2) },
			{ type = "desk", pos = Vector3(3, 0, 1), size = Vector3(2.5, 0.1, 1.2) },
		],
		agent_anchors = [
			Vector3(-3, 0, -1.5), Vector3(0, 0, -1.5), Vector3(3, 0, -1.5),
			Vector3(-3, 0, 1.5), Vector3(0, 0, 1.5), Vector3(3, 0, 1.5)
		],
		nav_points = [Vector3(0, 0, -4), Vector3(0, 0, 4), Vector3(-4, 0, 0), Vector3(4, 0, 0)],
		light_color = Color(0.95, 0.95, 1.0),
		light_energy = 1.2
	},
	cafeteria: {
		label = "Cafeteria",
		furniture = [
			{ type = "table", pos = Vector3(0, 0, 0), size = Vector3(3, 0.1, 2) },
			{ type = "chair", pos = Vector3(-2, 0, 1.5), rot = 180 },
			{ type = "chair", pos = Vector3(2, 0, 1.5), rot = 180 },
			{ type = "chair", pos = Vector3(-2, 0, -1.5), rot = 0 },
			{ type = "chair", pos = Vector3(2, 0, -1.5), rot = 0 },
			{ type = "counter", pos = Vector3(-4, 0, -2), size = Vector3(1.5, 1, 3) },
		],
		agent_anchors = [
			Vector3(-1.5, 0, 1.5), Vector3(1.5, 0, 1.5),
			Vector3(-1.5, 0, -1.5), Vector3(1.5, 0, -1.5)
		],
		nav_points = [Vector3(0, 0, -3), Vector3(0, 0, 3), Vector3(-3, 0, 0), Vector3(3, 0, 0)],
		light_color = Color(1.0, 0.95, 0.8),
		light_energy = 1.0
	},
	lobby: {
		label = "Lobby",
		furniture = [
			{ type = "sofa", pos = Vector3(0, 0, 0), size = Vector3(2, 0.5, 1) },
			{ type = "table", pos = Vector3(-2, 0, 2), size = Vector3(1, 0.1, 1) },
			{ type = "plant", pos = Vector3(3, 0, 3) },
		],
		agent_anchors = [Vector3(0, 0, 1.5), Vector3(0, 0, -1.5)],
		nav_points = [Vector3(0, 0, -4), Vector3(0, 0, 0), Vector3(-3, 0, 0), Vector3(3, 0, 0)],
		light_color = Color(0.9, 0.9, 1.0),
		light_energy = 1.1
	},
	meeting: {
		label = "Meeting Room",
		furniture = [
			{ type = "table", pos = Vector3(0, 0, 0), size = Vector3(4, 0.1, 1.5) },
			{ type = "chair", pos = Vector3(-2.5, 0, 1.5), rot = 180 },
			{ type = "chair", pos = Vector3(0, 0, 1.5), rot = 180 },
			{ type = "chair", pos = Vector3(2.5, 0, 1.5), rot = 180 },
			{ type = "chair", pos = Vector3(-2.5, 0, -1.5), rot = 0 },
			{ type = "chair", pos = Vector3(0, 0, -1.5), rot = 0 },
			{ type = "chair", pos = Vector3(2.5, 0, -1.5), rot = 0 },
			{ type = "screen", pos = Vector3(0, 1.5, -3) },
		],
		agent_anchors = [
			Vector3(-2, 0, 1.5), Vector3(0, 0, 1.5), Vector3(2, 0, 1.5),
			Vector3(-2, 0, -1.5), Vector3(0, 0, -1.5), Vector3(2, 0, -1.5)
		],
		nav_points = [Vector3(-3, 0, 0), Vector3(3, 0, 0), Vector3(0, 0, 3)],
		light_color = Color(0.95, 0.9, 1.0),
		light_energy = 0.9
	},
	server: {
		label = "Server Room",
		furniture = [
			{ type = "rack", pos = Vector3(-2, 0, -2), size = Vector3(1, 2.5, 0.8) },
			{ type = "rack", pos = Vector3(2, 0, -2), size = Vector3(1, 2.5, 0.8) },
			{ type = "rack", pos = Vector3(-2, 0, 2), size = Vector3(1, 2.5, 0.8) },
			{ type = "rack", pos = Vector3(2, 0, 2), size = Vector3(1, 2.5, 0.8) },
		],
		agent_anchors = [Vector3(0, 0, 0)],
		nav_points = [Vector3(0, 0, -3), Vector3(0, 0, 3), Vector3(-3, 0, 0), Vector3(3, 0, 0)],
		light_color = Color(0.6, 0.7, 1.0),
		light_energy = 0.6
	},
	recreation: {
		label = "Recreation",
		furniture = [
			{ type = "sofa", pos = Vector3(-2, 0, -1), size = Vector3(2, 0.5, 1), rot = 90 },
			{ type = "table", pos = Vector3(1, 0, 1), size = Vector3(1.5, 0.1, 0.8) },
			{ type = "plant", pos = Vector3(-3, 0, 2) },
			{ type = "plant", pos = Vector3(3, 0, 2) },
		],
		agent_anchors = [Vector3(-2, 0, 1), Vector3(1, 0, -1)],
		nav_points = [Vector3(0, 0, -3), Vector3(0, 0, 3), Vector3(-3, 0, 0), Vector3(3, 0, 0)],
		light_color = Color(1.0, 0.9, 0.7),
		light_energy = 0.7
	},
	dormitory1: {
		label = "Dormitory 1",
		furniture = [
			{ type = "bed", pos = Vector3(-2, 0, -1), size = Vector3(1.5, 0.3, 2.5) },
			{ type = "bed", pos = Vector3(2, 0, -1), size = Vector3(1.5, 0.3, 2.5) },
			{ type = "desk", pos = Vector3(0, 0, 2), size = Vector3(2, 0.1, 1) },
			{ type = "cabinet", pos = Vector3(-4, 0, 0) },
			{ type = "cabinet", pos = Vector3(4, 0, 0) },
		],
		agent_anchors = [Vector3(-2, 0, 0), Vector3(2, 0, 0)],
		nav_points = [Vector3(-3, 0, 0), Vector3(3, 0, 0), Vector3(0, 0, 3)],
		light_color = Color(0.9, 0.85, 0.95),
		light_energy = 0.6
	},
	dormitory2: {
		label = "Dormitory 2",
		furniture = [
			{ type = "bed", pos = Vector3(-2, 0, -1), size = Vector3(1.5, 0.3, 2.5) },
			{ type = "bed", pos = Vector3(2, 0, -1), size = Vector3(1.5, 0.3, 2.5) },
			{ type = "desk", pos = Vector3(0, 0, 2), size = Vector3(2, 0.1, 1) },
		],
		agent_anchors = [Vector3(-2, 0, 0), Vector3(2, 0, 0)],
		nav_points = [Vector3(-3, 0, 0), Vector3(3, 0, 0), Vector3(0, 0, 3)],
		light_color = Color(0.9, 0.85, 0.95),
		light_energy = 0.6
	}
}


func _ready() -> void:
	var ec := get_node("/root/World/EventClient")
	if ec:
		ec.world_state.connect(_on_world_state)
		ec.room_layout.connect(_on_room_layout)


func _on_world_state(data: Dictionary) -> void:
	var grid := data.get("grid", {})
	var rooms_data: Array = data.get("rooms", [])

	for room_data in rooms_data:
		var slot: int = room_data.get("slot", 0)
		var room_type: String = room_data.get("type", "lobby")
		var label: String = room_data.get("label", ROOM_DEFS[room_type].label)
		_build_room(slot, room_type, label)


func _on_room_layout(data: Dictionary) -> void:
	var swaps: Array = data.get("swaps", [])
	var config: Dictionary = data.get("config", {})

	for swap in swaps:
		var from_slot: int = swap.get("from", 0)
		var to_slot: int = swap.get("to", 0)
		swap_rooms(from_slot, to_slot)

	for slot_str: String in config:
		var slot := int(slot_str)
		var cfg := config[slot_str]
		var room_type := cfg.get("type", "lobby")
		_build_room(slot, room_type, ROOM_DEFS[room_type].label)


func _build_room(slot: int, room_type: String, label: String) -> void:
	if _room_cells.has(slot):
		var existing := _room_cells[slot] as Node3D
		if existing:
			existing.queue_free()
		_room_cells.erase(slot)

	var row := slot / GRID_SIZE
	var col := slot % GRID_SIZE
	var center := Vector3(col * ROOM_SIZE - (GRID_SIZE - 1) * HALF_ROOM, 0, row * ROOM_SIZE - (GRID_SIZE - 1) * HALF_ROOM)

	var room_node := Node3D.new()
	room_node.name = "Room_%d_%s" % [slot, room_type]
	room_node.position = center
	add_child(room_node)

	var def := ROOM_DEFS.get(room_type, ROOM_DEFS.lobby)

	_build_floor(room_node, room_type)
	_build_walls(room_node, room_type)
	_build_furniture(room_node, def)
	_setup_lighting(room_node, def)
	_build_doors(room_node, center, slot)

	_room_cells[slot] = room_node

	room_placed.emit(slot, room_type)


func _build_floor(room_node: Node3D, room_type: String) -> void:
	var floor_mesh := BoxMesh.new()
	floor_mesh.size = Vector3(ROOM_SIZE, 0.1, ROOM_SIZE)

	var floor_mat := StandardMaterial3D.new()
	match room_type:
		"executive":
			floor_mat.albedo_color = Color(0.3, 0.2, 0.1)
			floor_mat.metallic = 0.3
			floor_mat.roughness = 0.4
		"operations":
			floor_mat.albedo_color = Color(0.25, 0.25, 0.3)
			floor_mat.metallic = 0.1
			floor_mat.roughness = 0.7
		"cafeteria":
			floor_mat.albedo_color = Color(0.4, 0.35, 0.3)
			floor_mat.metallic = 0.05
			floor_mat.roughness = 0.8
		"lobby":
			floor_mat.albedo_color = Color(0.35, 0.35, 0.35)
			floor_mat.metallic = 0.2
			floor_mat.roughness = 0.5
		"meeting":
			floor_mat.albedo_color = Color(0.3, 0.3, 0.35)
			floor_mat.metallic = 0.15
			floor_mat.roughness = 0.55
		"server":
			floor_mat.albedo_color = Color(0.2, 0.22, 0.3)
			floor_mat.metallic = 0.25
			floor_mat.roughness = 0.45
		"recreation":
			floor_mat.albedo_color = Color(0.35, 0.3, 0.25)
			floor_mat.metallic = 0.05
			floor_mat.roughness = 0.85
		"dormitory1", "dormitory2":
			floor_mat.albedo_color = Color(0.28, 0.25, 0.3)
			floor_mat.metallic = 0.05
			floor_mat.roughness = 0.8

	var floor_instance := MeshInstance3D.new()
	floor_instance.mesh = floor_mesh
	floor_instance.material_override = floor_mat
	floor_instance.position.y = -0.05
	room_node.add_child(floor_instance)


func _build_walls(room_node: Node3D, room_type: String) -> void:
	var wall_mat := StandardMaterial3D.new()
	match room_type:
		"executive":
			wall_mat.albedo_color = Color(0.9, 0.85, 0.75)
		"server":
			wall_mat.albedo_color = Color(0.7, 0.72, 0.8)
		_:
			wall_mat.albedo_color = Color(0.85, 0.85, 0.88)

	wall_mat.roughness = 0.9

	var wall_positions := [
		{ pos = Vector3(0, WALL_HEIGHT / 2, -HALF_ROOM), size = Vector3(ROOM_SIZE, WALL_HEIGHT, 0.1) },
		{ pos = Vector3(0, WALL_HEIGHT / 2, HALF_ROOM), size = Vector3(ROOM_SIZE, WALL_HEIGHT, 0.1) },
		{ pos = Vector3(-HALF_ROOM, WALL_HEIGHT / 2, 0), size = Vector3(0.1, WALL_HEIGHT, ROOM_SIZE) },
		{ pos = Vector3(HALF_ROOM, WALL_HEIGHT / 2, 0), size = Vector3(0.1, WALL_HEIGHT, ROOM_SIZE) },
	]

	for wp in wall_positions:
		var wall_mesh := BoxMesh.new()
		wall_mesh.size = wp.size
		var wall_instance := MeshInstance3D.new()
		wall_instance.mesh = wall_mesh
		wall_instance.material_override = wall_mat
		wall_instance.position = wp.pos
		room_node.add_child(wall_instance)


func _build_furniture(room_node: Node3D, def: Dictionary) -> void:
	var items: Array = def.get("furniture", [])
	for item in items:
		var ftype: String = item.get("type", "desk")
		var pos: Vector3 = item.get("pos", Vector3.ZERO)
		var size: Vector3 = item.get("size", Vector3(1, 0.1, 1))
		var rot: float = item.get("rot", 0.0)

		var mesh: MeshInstance3D = _create_furniture_mesh(ftype, size)
		if mesh:
			mesh.position = pos
			if rot != 0.0:
				mesh.rotation_degrees.y = rot
			room_node.add_child(mesh)


func _create_furniture_mesh(ftype: String, size: Vector3) -> MeshInstance3D:
	var mat := StandardMaterial3D.new()
	var mesh: MeshInstance3D

	match ftype:
		"desk":
			var box := BoxMesh.new()
			box.size = size
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.5, 0.35, 0.2)
			mat.metallic = 0.2
			mat.roughness = 0.6

		"chair":
			var chair := BoxMesh.new()
			chair.size = Vector3(0.8, 0.8, 0.8)
			mesh = MeshInstance3D.new()
			mesh.mesh = chair
			mat.albedo_color = Color(0.2, 0.2, 0.25)
			mat.metallic = 0.05
			mat.roughness = 0.7

		"table":
			var box := BoxMesh.new()
			box.size = size
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.6, 0.5, 0.35)
			mat.metallic = 0.15
			mat.roughness = 0.5

		"cabinet":
			var box := BoxMesh.new()
			box.size = Vector3(1, 1.5, 0.6)
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.4, 0.25, 0.15)
			mat.metallic = 0.1
			mat.roughness = 0.6

		"plant":
			var pot := CylinderMesh.new()
			pot.top_radius = 0.3
			pot.bottom_radius = 0.2
			pot.height = 0.5
			mesh = MeshInstance3D.new()
			mesh.mesh = pot
			mat.albedo_color = Color(0.2, 0.5, 0.15)
			mat.roughness = 0.9

		"sofa":
			var box := BoxMesh.new()
			box.size = size
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.3, 0.2, 0.4)
			mat.roughness = 0.8

		"screen":
			var box := BoxMesh.new()
			box.size = Vector3(2.5, 1.5, 0.1)
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.05, 0.05, 0.1)
			mat.emission_enabled = true
			mat.emission = Color(0.2, 0.3, 0.5)
			mat.emission_energy_multiplier = 0.05

		"rack":
			var box := BoxMesh.new()
			box.size = size
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.15, 0.15, 0.18)
			mat.metallic = 0.4
			mat.roughness = 0.3

		"bed":
			var box := BoxMesh.new()
			box.size = size
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.7, 0.7, 0.75)
			mat.roughness = 0.9

		"counter":
			var box := BoxMesh.new()
			box.size = size
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.55, 0.5, 0.45)
			mat.metallic = 0.1
			mat.roughness = 0.6

		_:
			var box := BoxMesh.new()
			box.size = Vector3(0.5, 0.5, 0.5)
			mesh = MeshInstance3D.new()
			mesh.mesh = box
			mat.albedo_color = Color(0.5, 0.5, 0.5)

	if mesh:
		mesh.material_override = mat

	return mesh


func _setup_lighting(room_node: Node3D, def: Dictionary) -> void:
	var light := OmniLight3D.new()
	light.omni_range = ROOM_SIZE * 0.7
	light.omni_attenuation = 0.8
	light.light_color = def.get("light_color", Color.WHITE)
	light.light_energy = def.get("light_energy", 1.0)
	light.position = Vector3(0, WALL_HEIGHT - 0.5, 0)
	light.shadow_enabled = true
	room_node.add_child(light)


func _build_doors(room_node: Node3D, center: Vector3, slot: int) -> void:
	var row := slot / GRID_SIZE
	var col := slot % GRID_SIZE

	var door_positions := []

	if col > 0:
		door_positions.append(Vector3(-HALF_ROOM, DOOR_HEIGHT / 2, 0))
	if col < GRID_SIZE - 1:
		door_positions.append(Vector3(HALF_ROOM, DOOR_HEIGHT / 2, 0))
	if row > 0:
		door_positions.append(Vector3(0, DOOR_HEIGHT / 2, -HALF_ROOM))
	if row < GRID_SIZE - 1:
		door_positions.append(Vector3(0, DOOR_HEIGHT / 2, HALF_ROOM))

	for dp in door_positions:
		var door_mesh := BoxMesh.new()
		door_mesh.size = Vector3(DOOR_WIDTH, DOOR_HEIGHT, 0.1)

		var door_mat := StandardMaterial3D.new()
		door_mat.albedo_color = Color(0.5, 0.35, 0.2)
		door_mat.metallic = 0.1
		door_mat.roughness = 0.7

		var door := MeshInstance3D.new()
		door.mesh = door_mesh
		door.material_override = door_mat
		door.position = dp
		door.name = "Door_%d_%d_%d" % [slot, dp.x, dp.z]
		room_node.add_child(door)
		_door_nodes.append(door)


func swap_rooms(slot_a: int, slot_b: int) -> void:
	if not _room_cells.has(slot_a) or not _room_cells.has(slot_b):
		return

	var room_a := _room_cells[slot_a] as Node3D
	var room_b := _room_cells[slot_b] as Node3D
	var pos_a := room_a.position
	var pos_b := room_b.position

	room_a.position = pos_b
	room_b.position = pos_a

	_room_cells[slot_a] = room_b
	_room_cells[slot_b] = room_a


func get_room_at_position(world_pos: Vector3) -> Dictionary:
	for slot: int in _room_cells:
		var room := _room_cells[slot] as Node3D
		if not room:
			continue
		var local_pos := world_pos - room.position
		if abs(local_pos.x) < HALF_ROOM and abs(local_pos.z) < HALF_ROOM:
			return { slot = slot, node = room, type = room.name.split("_")[2] }
	return { slot = -1, node = null, type = "" }


func get_nav_points_for_slot(slot: int) -> Array:
	if not _room_cells.has(slot):
		return []
	var room := _room_cells[slot] as Node3D
	if not room:
		return []
	var parts := room.name.split("_")
	if parts.size() < 3:
		return []
	var room_type := parts[2]
	var def := ROOM_DEFS.get(room_type, ROOM_DEFS.lobby)
	return def.get("nav_points", [])


func get_world_nav_points(slot: int) -> Array:
	if not _room_cells.has(slot):
		return []
	var room := _room_cells[slot] as Node3D
	var points: Array = get_nav_points_for_slot(slot)
	var world_points: Array = []
	for p in points:
		world_points.append(room.position + p)
	return world_points


func check_door_proximity(agent_pos: Vector3) -> void:
	for door in _door_nodes:
		var dist := agent_pos.distance_to(door.global_position)
		if dist < DOOR_OPEN_RANGE:
			door.visible = false
			door_opened.emit(door)
		else:
			door.visible = true
			door_closed.emit(door)


func get_room_cells() -> Dictionary:
	return _room_cells.duplicate()
