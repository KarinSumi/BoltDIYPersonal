import asyncio
import json
import subprocess
from pathlib import Path


async def invoke_agent(agent_id: str, prompt: str, chat_id: str = "warroom") -> str:
    """Invoke an OpenCode OS agent via the Node.js voice bridge."""
    project_root = Path(__file__).parent.parent

    cmd = [
        "node",
        str(project_root / "dist" / "agent-voice-bridge.js"),
        f"--agent={agent_id}",
        f"--message={prompt}",
        f"--chat-id={chat_id}",
        "--quick",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(project_root),
            env={"NODE_PATH": str(project_root / "node_modules"), **dict(process.env)}
        )

        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

        if proc.returncode != 0:
            return f"I'm sorry, I encountered an error. ({stderr.decode()[:200]})"

        result = json.loads(stdout.decode())
        return result.get("response", "I'm sorry, I couldn't process that.")

    except asyncio.TimeoutError:
        return "I'm sorry, the request timed out."
    except (json.JSONDecodeError, subprocess.CalledProcessError) as e:
        return f"I'm sorry, I encountered an error. ({str(e)[:200]})"
