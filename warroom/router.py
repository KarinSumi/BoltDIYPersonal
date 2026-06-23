import json
import os

PIN_FILE = "/tmp/warroom-pin.json"


def route_utterance(text: str, pinned_agent: str | None = None) -> str:
    """Route an utterance to the appropriate agent."""

    # 1. Broadcast triggers
    broadcast_triggers = ["everyone", "team", "status"]
    for trigger in broadcast_triggers:
        if trigger in text.lower():
            return "broadcast"

    # 2. Agent name prefix
    from personas import PERSONAS
    for agent_id, persona in PERSONAS.items():
        for trigger in persona.get("triggers", []):
            if text.lower().startswith(trigger.lower()):
                return agent_id

    # 3. Pinned agent
    if pinned_agent:
        return pinned_agent

    try:
        if os.path.exists(PIN_FILE):
            with open(PIN_FILE) as f:
                data = json.load(f)
                if "agent" in data:
                    return data["agent"]
    except (json.JSONDecodeError, IOError):
        pass

    # 4. Default to main
    return "main"


def pin_agent(agent_id: str) -> None:
    with open(PIN_FILE, "w") as f:
        json.dump({"agent": agent_id}, f)


def unpin_agent() -> None:
    if os.path.exists(PIN_FILE):
        os.remove(PIN_FILE)
