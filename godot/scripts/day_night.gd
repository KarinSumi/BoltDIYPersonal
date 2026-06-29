extends Node

enum Phase { DAY, SUNSET, NIGHT, SUNRISE }

signal phase_changed(phase: int)

const SUNRISE_HOUR := 6
const DAY_HOUR := 8
const SUNSET_HOUR := 18
const NIGHT_HOUR := 20

const TRANSITION_FAST := 30.0
const TRANSITION_SLOW := 120.0

var _current_phase: int = Phase.DAY
var _target_phase: int = Phase.DAY
var _transition_progress: float = 1.0
var _transition_duration: float = TRANSITION_SLOW
var _overridden: bool = false
var _override_phase: int = Phase.DAY

@onready var sun := get_node("/root/World/DirectionalLight")
@onready var env := get_node("/root/World/WorldEnvironment")

func _ready() -> void:
	_update_from_clock()
	var timer := Timer.new()
	timer.wait_time = 60.0
	timer.timeout.connect(_update_from_clock)
	add_child(timer)
	timer.start()


func _process(delta: float) -> void:
	if _transition_progress < 1.0:
		_transition_progress = min(_transition_progress + delta / _transition_duration, 1.0)
		_apply_transition(_current_phase, _target_phase, _transition_progress)
		if _transition_progress >= 1.0:
			_current_phase = _target_phase
			phase_changed.emit(_current_phase)


func _update_from_clock() -> void:
	if _overridden:
		return

	var dt := Time.get_datetime_dict_from_system()
	var hour := dt.hour
	var new_phase: int

	if hour >= SUNRISE_HOUR and hour < DAY_HOUR:
		new_phase = Phase.SUNRISE
	elif hour >= DAY_HOUR and hour < SUNSET_HOUR:
		new_phase = Phase.DAY
	elif hour >= SUNSET_HOUR and hour < NIGHT_HOUR:
		new_phase = Phase.SUNSET
	else:
		new_phase = Phase.NIGHT

	if new_phase != _target_phase:
		_start_transition(new_phase)


func _start_transition(target: int) -> void:
	_current_phase = _target_phase
	_target_phase = target

	match target:
		Phase.DAY, Phase.NIGHT:
			_transition_duration = TRANSITION_FAST
		Phase.SUNSET, Phase.SUNRISE:
			_transition_duration = TRANSITION_SLOW

	_transition_progress = 0.0


func _apply_transition(from: int, to: int, t: float) -> void:
	if not sun or not env:
		return

	var sun_color: Color
	var sun_energy: float
	var amb_color: Color
	var amb_energy: float
	var fog_enabled: bool
	var fog_color: Color

	if from == Phase.DAY and to == Phase.SUNSET:
		sun_color = Color(1.0, 0.7 + t * 0.3, 0.4 + t * 0.1)
		sun_energy = 1.0 - t * 0.3
		amb_color = Color(0.7, 0.7, 0.8).lerp(Color(0.4, 0.2, 0.1), t)
		amb_energy = 1.0 - t * 0.4
		fog_enabled = t > 0.3
		fog_color = Color(0.8, 0.5, 0.2)

	elif from == Phase.SUNSET and to == Phase.NIGHT:
		sun_color = Color(1.0, 0.5, 0.2).lerp(Color(0.2, 0.3, 0.6), t)
		sun_energy = (0.7 - t * 0.5) * 0.3
		amb_color = Color(0.4, 0.2, 0.1).lerp(Color(0.05, 0.05, 0.1), t)
		amb_energy = 0.6 - t * 0.4
		fog_enabled = true
		fog_color = Color(0.3, 0.15, 0.1).lerp(Color(0.02, 0.02, 0.05), t)

	elif from == Phase.NIGHT and to == Phase.SUNRISE:
		sun_color = Color(0.2, 0.3, 0.6).lerp(Color(1.0, 0.5, 0.3), t)
		sun_energy = (0.2 + t * 0.5) * 0.5
		amb_color = Color(0.05, 0.05, 0.1).lerp(Color(0.3, 0.15, 0.1), t)
		amb_energy = 0.2 + t * 0.4
		fog_enabled = t < 0.7
		fog_color = Color(0.02, 0.02, 0.05).lerp(Color(0.5, 0.25, 0.1), t)

	elif from == Phase.SUNRISE and to == Phase.DAY:
		sun_color = Color(1.0, 0.5, 0.3).lerp(Color(1.0, 0.9, 0.8), t)
		sun_energy = 0.5 + t * 0.5
		amb_color = Color(0.3, 0.15, 0.1).lerp(Color(0.7, 0.7, 0.8), t)
		amb_energy = 0.6 + t * 0.4
		fog_enabled = t < 0.5
		fog_color = Color(0.5, 0.25, 0.1).lerp(Color(0.7, 0.7, 0.8), t)

	else:
		var phase := _current_phase if _transition_progress >= 1.0 else to
		match phase:
			Phase.DAY:
				sun_color = Color(1.0, 0.9, 0.8)
				sun_energy = 1.0
				amb_color = Color(0.7, 0.7, 0.8)
				amb_energy = 1.0
				fog_enabled = false
				fog_color = Color(0.7, 0.7, 0.8)

			Phase.SUNSET:
				sun_color = Color(1.0, 0.5, 0.2)
				sun_energy = 0.7
				amb_color = Color(0.4, 0.2, 0.1)
				amb_energy = 0.6
				fog_enabled = true
				fog_color = Color(0.8, 0.5, 0.2)

			Phase.NIGHT:
				sun_color = Color(0.2, 0.3, 0.6)
				sun_energy = 0.2
				amb_color = Color(0.05, 0.05, 0.1)
				amb_energy = 0.2
				fog_enabled = true
				fog_color = Color(0.02, 0.02, 0.05)

			Phase.SUNRISE:
				sun_color = Color(1.0, 0.5, 0.3)
				sun_energy = 0.5
				amb_color = Color(0.3, 0.15, 0.1)
				amb_energy = 0.6
				fog_enabled = true
				fog_color = Color(0.5, 0.25, 0.1)

			_:
				sun_color = Color(1.0, 0.9, 0.8)
				sun_energy = 1.0
				amb_color = Color(0.7, 0.7, 0.8)
				amb_energy = 1.0
				fog_enabled = false
				fog_color = Color(0.7, 0.7, 0.8)

	sun.light_color = sun_color
	sun.light_energy = sun_energy

	var world_env := env.environment
	if not world_env:
		return

	world_env.ambient_light_color = amb_color
	world_env.ambient_light_energy = amb_energy

	if fog_enabled:
		world_env.fog_enabled = true
		world_env.fog_color = fog_color
		world_env.fog_begin = 5.0
		world_env.fog_end = 40.0
		world_env.fog_density = 0.02
	else:
		world_env.fog_enabled = false

	_update_sun_angle()


func _update_sun_angle() -> void:
	if not sun:
		return

	var rotation_x: float
	match _current_phase:
		Phase.DAY:
			rotation_x = -30.0
		Phase.SUNSET:
			rotation_x = 10.0
		Phase.NIGHT:
			rotation_x = 60.0
		Phase.SUNRISE:
			rotation_x = -10.0

	if _transition_progress < 1.0:
		var from_rot := _get_phase_rotation(_current_phase)
		var to_rot := _get_phase_rotation(_target_phase)
		rotation_x = lerp(from_rot, to_rot, _transition_progress)

	sun.rotation_degrees.x = rotation_x


func _get_phase_rotation(phase: int) -> float:
	match phase:
		Phase.DAY: return -30.0
		Phase.SUNSET: return 10.0
		Phase.NIGHT: return 60.0
		Phase.SUNRISE: return -10.0
	return -30.0


func override_phase(phase: int) -> void:
	_overridden = true
	_override_phase = phase
	_start_transition(phase)


func release_override() -> void:
	_overridden = false
	_update_from_clock()


func get_current_phase() -> int:
	return _current_phase
