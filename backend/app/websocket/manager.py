import json
import asyncio
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket
from app.core.logging import logger

class WebSocketManager:
    def __init__(self):
        # session_id -> Set of WebSockets (candidate sockets)
        self.session_connections: Dict[int, Set[WebSocket]] = {}
        # Admin monitoring sockets
        self.admin_connections: Set[WebSocket] = set()
        # candidate_id -> metadata (status, last_heartbeat, session_id)
        self.candidate_status: Dict[int, Dict[str, Any]] = {}

    async def connect_candidate(self, websocket: WebSocket, session_id: int, candidate_id: int):
        await websocket.accept()
        if session_id not in self.session_connections:
            self.session_connections[session_id] = set()
        self.session_connections[session_id].add(websocket)
        
        self.candidate_status[candidate_id] = {
            "session_id": session_id,
            "status": "ONLINE",
            "last_heartbeat": asyncio.get_event_loop().time()
        }
        logger.info(f"WebSocket: Candidate {candidate_id} connected to session {session_id}")
        await self.broadcast_to_admins({
            "type": "candidate.connection",
            "candidate_id": candidate_id,
            "session_id": session_id,
            "status": "ONLINE"
        })

    def disconnect_candidate(self, websocket: WebSocket, session_id: int, candidate_id: int):
        if session_id in self.session_connections:
            self.session_connections[session_id].discard(websocket)
            if not self.session_connections[session_id]:
                del self.session_connections[session_id]
        
        if candidate_id in self.candidate_status:
            self.candidate_status[candidate_id]["status"] = "OFFLINE"
        
        logger.info(f"WebSocket: Candidate {candidate_id} disconnected from session {session_id}")

    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        self.admin_connections.add(websocket)
        logger.info("WebSocket: Admin connected to live monitoring")

    def disconnect_admin(self, websocket: WebSocket):
        self.admin_connections.discard(websocket)
        logger.info("WebSocket: Admin disconnected from live monitoring")

    async def send_to_session(self, session_id: int, message: Dict[str, Any]):
        if session_id in self.session_connections:
            msg_text = json.dumps(message)
            dead_sockets = set()
            for ws in list(self.session_connections[session_id]):
                try:
                    await ws.send_text(msg_text)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.session_connections[session_id].discard(ws)

    async def broadcast_to_admins(self, message: Dict[str, Any]):
        if self.admin_connections:
            msg_text = json.dumps(message)
            dead_sockets = set()
            for ws in list(self.admin_connections):
                try:
                    await ws.send_text(msg_text)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.admin_connections.discard(ws)

ws_manager = WebSocketManager()
