import subprocess
import json
import os
from pathlib import Path

PROJECT_ROOT = str(Path(__file__).parent.parent.resolve())
BRIDGE_SCRIPT = os.path.join(PROJECT_ROOT, "dist", "agent-voice-bridge.js")

async def invoke_agent(agent_id: str, prompt: str, chat_id: str = "warroom") -> str:
    if not os.path.exists(BRIDGE_SCRIPT):
        return f"Error: Agent bridge not built at {BRIDGE_SCRIPT}"

    try:
        result = subprocess.run(
            ["node", BRIDGE_SCRIPT, "--agent", agent_id, "--message", prompt, "--chat-id", chat_id, "--quick"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=PROJECT_ROOT,
        )

        output = result.stdout.strip()
        if not output:
            return f"Error: No output from agent bridge. Stderr: {result.stderr[:200]}"

        parsed = json.loads(output)
        if parsed.get("error"):
            return f"Agent error: {parsed['error']}"

        return parsed.get("response", "No response")

    except subprocess.TimeoutExpired:
        return "Agent response timed out after 30 seconds."
    except json.JSONDecodeError:
        return f"Error parsing agent response: {output[:100]}"
    except Exception as e:
        return f"Agent bridge error: {str(e)}"
