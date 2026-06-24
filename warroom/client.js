// War Room Pipecat Client
// Connects to the War Room WebSocket server

class WarRoomClient {
  constructor(url = 'ws://localhost:7860/ws') {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
    this.onTranscript = null;
    this.onAgentResponse = null;
    this.onStatusChange = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.isConnected = true;
      if (this.onStatusChange) this.onStatusChange('connected');
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      if (this.onStatusChange) this.onStatusChange('disconnected');
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      if (this.onStatusChange) this.onStatusChange('error');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'transcript':
            if (this.onTranscript) this.onTranscript(msg.text, msg.agent);
            break;
          case 'response':
            if (this.onAgentResponse) this.onAgentResponse(msg.text, msg.agent);
            break;
          case 'status':
            if (this.onStatusChange) this.onStatusChange(msg.status);
            break;
        }
      } catch {
        // binary audio data
      }
    };
  }

  sendAudio(audioBlob) {
    if (this.ws && this.isConnected) {
      this.ws.send(audioBlob);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export { WarRoomClient };
