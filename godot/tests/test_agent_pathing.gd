extends GutTest

var _world_builder: Node
var _agent_manager: Node
var _agent_id: String = "test_agent"

func before_each() -> void:
	var root := Node3D.new()
	root.name = "World"
	add_child_autofree(root)

	_world_builder = Node.new()
	_world_builder.name = "WorldBuilder"
	_world_builder.set_script(load("res://scripts/world_builder.gd"))
	root.add_child(_world_builder)

	_agent_manager = Node.new()
	_agent_manager.name = "AgentManager"
	_agent_manager.set_script(load("res://scripts/agent_manager.gd"))
	root.add_child(_agent_manager)

	var ec := Node.new()
	ec.name = "EventClient"
	ec.set_script(load("res://scripts/event_client.gd"))
	root.add_child(ec)

	await get_tree().process_frame


func test_agent_spawns_at_lobby() -> void:
	var config := {
		id = _agent_id,
		name = "Test Agent",
		role = "Tester",
		avatar_color = "#ff6600",
	}
	_agent_manager.spawn_agent(config)

	var agent := _agent_manager.get_agent(_agent_id)
	assert_not_null(agent, "Agent should be spawned")
	assert_ne(agent.state, -1, "Agent should have valid state")
	assert_eq(agent.name, "Test Agent", "Agent name should match")


func test_agent_pathfinding_to_room() -> void:
	var config := {
		id = _agent_id,
		name = "Path Tester",
		role = "Tester",
		avatar_color = "#00ccff",
	}
	_agent_manager.spawn_agent(config)

	var agent := _agent_manager.get_agent(_agent_id)
	assert_not_null(agent, "Agent should be spawned")

	var start := agent.node.global_position
	var target := start + Vector3(5, 0, 3)
	var path := _agent_manager.move_to(_agent_id, target)

	assert_gt(path.size(), 1, "Path should have at least 2 points (start and end)")
	assert_eq(path[0], start, "Path should start at agent position")
	assert_eq(path[path.size() - 1], target, "Path should end at target position")


func test_agent_moves_within_120_frames() -> void:
	var config := {
		id = _agent_id,
		name = "Speed Tester",
		role = "Tester",
		avatar_color = "#00ff66",
	}
	_agent_manager.spawn_agent(config)

	var agent := _agent_manager.get_agent(_agent_id)
	assert_not_null(agent, "Agent should be spawned")

	var start := agent.node.global_position
	var target := Vector3(3, 0, 4)

	_agent_manager.move_to(_agent_id, target)
	agent.state = 1

	var frame_count := 0
	while agent.state == 1 and frame_count < 120:
		_agent_manager._process_movement(agent, 0.016)
		frame_count += 1

	var dist := agent.node.global_position.distance_to(target)
	assert_le(frame_count, 120, "Agent should reach target within 120 frames")
	assert_le(dist, 1.0, "Agent should be within 1 unit of target")


func test_agent_state_changes_to_blocked_on_timeout() -> void:
	var config := {
		id = _agent_id,
		name = "Blocked Tester",
		role = "Tester",
		avatar_color = "#ff0000",
	}
	_agent_manager.spawn_agent(config)

	var agent := _agent_manager.get_agent(_agent_id)
	var far_target := Vector3(999, 0, 999)

	_agent_manager.move_to(_agent_id, far_target)

	for i in 130:
		_agent_manager._process_movement(agent, 0.016)

	assert_eq(agent.state, 4, "Agent should be BLOCKED after timeout")


func test_agent_state_changes_to_idle_on_arrival() -> void:
	var config := {
		id = _agent_id,
		name = "Arrival Tester",
		role = "Tester",
		avatar_color = "#0000ff",
	}
	_agent_manager.spawn_agent(config)

	var agent := _agent_manager.get_agent(_agent_id)
	var current := agent.node.global_position

	_agent_manager.move_to(_agent_id, current)
	agent.path = [current, current]
	agent.path_index = 0

	_agent_manager._process_movement(agent, 0.016)

	assert_eq(agent.state, 0, "Agent should be IDLE after arriving at destination")
