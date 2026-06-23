---
name: pikastream-video-meeting
description: Join Google Meet or Zoom calls with a Pika video avatar. Handles meeting join/leave and pre-flight briefing.
allowed-tools: Bash(node *) Read Write
---

# Pika Video Meeting Skill

Join meetings with an AI video avatar.

## Usage

Join a meeting:
```
node dist/meet-cli.js join --meet-url "https://meet.google.com/abc-defg-hij" --agent main
```

Leave a meeting:
```
node dist/meet-cli.js leave --session-id SESSION_ID
```

List active sessions:
```
node dist/meet-cli.js list
```
