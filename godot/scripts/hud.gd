extends Node

const STATUS_COLORS := {
	"IDLE": Color(0.5, 0.5, 0.5),
	"WALKING": Color(0.2, 0.8, 0.2),
	"WORKING": Color(0.9, 0.8, 0.1),
	"MEETING": Color(0.6, 0.2, 0.8),
	"BLOCKED": Color(0.9, 0.15, 0.15),
	"OFFLINE": Color(0.15, 0.15, 0.15)
}

const AURA_COLORS := {
	fire = Color(1.0, 0.4, 0.0),
	ice = Color(0.2, 0.6, 1.0),
	nature = Color(0.2, 0.8, 0.2),
	arcane = Color(0.6, 0.2, 1.0),
	shadow = Color(0.1, 0.1, 0.1),
	gold = Color(1.0, 0.85, 0.0)
}

var _nameplates: Dictionary = {}
var _auras: Dictionary = {}
var _fx_flipbooks: Dictionary = {}

const FAR_DIST := 15.0
const MED_DIST := 8.0
const CLOSE_DIST := 3.0


func _ready() -> void:
	var am := get_node("/root/World/AgentManager")
	if am:
		am.agent_state_changed.connect(_on_agent_state_changed)


func _process(delta: float) -> void:
	var camera := get_viewport().get_camera_3d()
	if not camera:
		return

	for agent_id: String in _nameplates:
		var data := _nameplates[agent_id] as Dictionary
		if not data.has("node") or not is_instance_valid(data.get("node", null)):
			continue

		var np_node := data["node"] as Node3D
		var dist := camera.global_position.distance_to(np_node.global_position)

		var name_label := np_node.get_node_or_null("Name")
		var role_label := np_node.get_node_or_null("Role")
		var status_pill := np_node.get_node_or_null("StatusPill")
		var extra := np_node.get_node_or_null("Extra")

		if dist > FAR_DIST:
			_show_hide(np_node, name_label, true, data.get("name", ""))
			_show_hide(np_node, role_label, false, "")
			_show_hide(np_node, status_pill, false, "")
			_show_hide(np_node, extra, false, "")

		elif dist > MED_DIST:
			_show_hide(np_node, name_label, true, data.get("name", ""))
			_show_hide(np_node, role_label, true, data.get("role", ""))
			_show_hide(np_node, status_pill, false, "")
			_show_hide(np_node, extra, false, "")

		else:
			_show_hide(np_node, name_label, true, data.get("name", ""))
			_show_hide(np_node, role_label, true, data.get("role", ""))
			_show_hide(np_node, status_pill, true, data.get("status", ""))
			_show_hide(np_node, extra, dist < CLOSE_DIST, data.get("extra", ""))

		var role_rank := data.get("role", "")
		if role_rank == "CEO":
			if name_label:
				name_label.modulate = Color(1.0, 0.85, 0.0)
		elif role_rank == "Director":
			if name_label:
				name_label.modulate = Color(0.3, 0.5, 1.0)
		else:
			if name_label:
				name_label.modulate = Color.WHITE

		_update_status_pill(np_node, data.get("status", "IDLE"))


func _show_hide(parent: Node3D, child: Node3D, visible: bool, text: String) -> void:
	if not child:
		return
	child.visible = visible
	if visible and child.has_method("set_text") and not text.is_empty():
		child.set_text(text)


func _on_agent_state_changed(agent_id: String, old_state: int, new_state: int) -> void:
	if not _nameplates.has(agent_id):
		return

	var data := _nameplates[agent_id]
	var am := get_node("/root/World/AgentManager")
	if am:
		var agent := am.get_agent(agent_id)
		if agent:
			data["status"] = _state_to_string(new_state)


func _state_to_string(state: int) -> String:
	match state:
		0: return "IDLE"
		1: return "WALKING"
		2: return "WORKING"
		3: return "MEETING"
		4: return "BLOCKED"
		5: return "OFFLINE"
	return "IDLE"


func update_nameplate(agent_id: String, data: Dictionary) -> void:
	if not _nameplates.has(agent_id):
		_create_nameplate(agent_id, data)

	var np_data := _nameplates[agent_id]
	for key in ["name", "role", "status", "extra", "portrait_color"]:
		if data.has(key):
			np_data[key] = data[key]


func _create_nameplate(agent_id: String, data: Dictionary) -> void:
	var np_node := Node3D.new()
	np_node.name = "Nameplate_%s" % agent_id

	var portrait := ColorRect.new()
	portrait.name = "Portrait"
	portrait.color = data.get("portrait_color", Color(0.2, 0.6, 0.9))
	portrait.size = Vector2(16, 16)

	var name_label := Label3D.new()
	name_label.name = "Name"
	name_label.text = data.get("name", agent_id)
	name_label.font_size = 28

	var role_label := Label3D.new()
	role_label.name = "Role"
	role_label.text = data.get("role", "")
	role_label.font_size = 20
	role_label.modulate = Color(0.7, 0.7, 0.7)

	var status_pill := Label3D.new()
	status_pill.name = "StatusPill"
	status_pill.text = data.get("status", "IDLE")
	status_pill.font_size = 18
	status_pill.position.y = -0.4

	np_node.add_child(portrait)
	np_node.add_child(name_label)
	np_node.add_child(role_label)
	np_node.add_child(status_pill)

	var agent_node := get_node_or_null("/root/World/AgentManager/Agent_%s" % agent_id)
	if agent_node:
		agent_node.add_child(np_node)
		np_node.position.y = 2.5
	else:
		var am := get_node("/root/World/AgentManager")
		if am:
			am.add_child(np_node)

	_nameplates[agent_id] = {
		node = np_node,
		name = data.get("name", agent_id),
		role = data.get("role", ""),
		status = data.get("status", "IDLE"),
		extra = data.get("extra", ""),
		portrait_color = data.get("portrait_color", Color(0.2, 0.6, 0.9))
	}


func _update_status_pill(np_node: Node3D, status: String) -> void:
	var pill := np_node.get_node_or_null("StatusPill") as Label3D
	if not pill:
		return

	var color := STATUS_COLORS.get(status, STATUS_COLORS.IDLE)
	pill.modulate = color


func show_effect(agent_id: String, effect_name: String) -> void:
	if not _fx_flipbooks.has(agent_id):
		var fx_node := Sprite3D.new()
		fx_node.name = "FX_%s" % agent_id
		fx_node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		fx_node.centered = true

		var agent_node := get_node_or_null("/root/World/AgentManager/Agent_%s" % agent_id)
		if agent_node:
			agent_node.add_child(fx_node)
			fx_node.position.y = 2.0

		_fx_flipbooks[agent_id] = fx_node

	var fx := _fx_flipbooks[agent_id] as Sprite3D
	if not fx:
		return

	var texture_path := "res://assets/textures/fx_%s.png" % effect_name
	var tex := load(texture_path) as Texture2D
	if tex:
		fx.texture = tex

	fx.visible = true
	var tween := create_tween()
	tween.tween_property(fx, "modulate:a", 1.0, 0.1)
	tween.tween_property(fx, "modulate:a", 0.0, 1.5)
	tween.tween_callback(func(): fx.visible = false)


func set_aura(agent_id: String, aura_type: String) -> void:
	if _auras.has(agent_id):
		var existing := _auras[agent_id] as Node3D
		if existing:
			existing.queue_free()
		_auras.erase(agent_id)

	var color := AURA_COLORS.get(aura_type, AURA_COLORS.fire)

	var agent_node := get_node_or_null("/root/World/AgentManager/Agent_%s" % agent_id)
	if not agent_node:
		return

	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.3
	torus.outer_radius = 0.6
	ring.mesh = torus

	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 0.5
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.alpha_scissor_threshold = 0.5
	ring.material_override = mat

	ring.position.y = 0.05
	ring.rotation.x = deg_to_rad(90)
	agent_node.add_child(ring)

	_auras[agent_id] = ring

	var tween := create_tween()
	tween.set_loops()
	tween.tween_property(ring, "rotation:z", TAU, 4.0)


func remove_nameplate(agent_id: String) -> void:
	if _nameplates.has(agent_id):
		var data := _nameplates[agent_id] as Dictionary
		if data.has("node") and is_instance_valid(data.get("node", null)):
			data["node"].queue_free()
		_nameplates.erase(agent_id)

	if _auras.has(agent_id):
		var aura := _auras[agent_id] as Node3D
		if aura:
			aura.queue_free()
		_auras.erase(agent_id)

	if _fx_flipbooks.has(agent_id):
		var fx := _fx_flipbooks[agent_id] as Node3D
		if fx:
			fx.queue_free()
		_fx_flipbooks.erase(agent_id)
