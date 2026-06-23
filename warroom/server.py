import asyncio
import json
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from config import PORT, MODE, GOOGLE_API_KEY, PIN_FILE, AGENT_ROSTER
from personas import PERSONAS
from router import route_utterance

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("warroom")

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok", "mode": MODE}


@app.get("/roster")
async def roster():
    return PERSONAS


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connected")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "transcription":
                text = msg.get("text", "")
                pinned = msg.get("pinned_agent")
                agent_id = route_utterance(text, pinned)

                from agent_bridge import invoke_agent
                response = await invoke_agent(agent_id, text)

                await websocket.send_json({
                    "type": "response",
                    "agent_id": agent_id,
                    "text": response,
                    "persona": PERSONAS.get(agent_id, {})
                })

            elif msg.get("type") == "pin":
                from router import pin_agent
                pin_agent(msg["agent_id"])
                await websocket.send_json({"type": "pinned", "agent_id": msg["agent_id"]})

            elif msg.get("type") == "unpin":
                from router import unpin_agent
                unpin_agent()
                await websocket.send_json({"type": "unpinned"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
