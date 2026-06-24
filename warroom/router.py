import json
import os
import config

def route_utterance(text: str, pinned_agent: str | None = None) -> str:
    text_lower = text.lower()

    # 1. Broadcast triggers
    if any(word in text_lower for word in ["everyone", "team", "all agents", "status"]):
        return "broadcast"

    # 2. Agent name prefix
    from personas import PERSONAS
    for agent_id, persona in PERSONAS.items():
        for trigger in persona["triggers"]:
            if text_lower.startswith(trigger.lower()):
                return agent_id

    # 3. Pinned agent
    if pinned_agent:
        return pinned_agent

    # 4. Default
    return "main"

def pin_agent(agent_id: str) -> None:
    with open(config.PIN_FILE, 'w') as f:
        json.dump({"agent": agent_id}, f)

def unpin_agent() -> None:
    if os.path.exists(config.PIN_FILE):
        os.remove(config.PIN_FILE)

def read_pin() -> str | None:
    try:
        with open(config.PIN_FILE, 'r') as f:
            data = json.load(f)
            return data.get("agent")
    except (FileNotFoundError, json.JSONDecodeError):
        return None


