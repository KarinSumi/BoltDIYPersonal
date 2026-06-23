import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

PORT = int(os.getenv('WARROOM_PORT', '7860'))
MODE = os.getenv('WARROOM_MODE', 'live')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
DEEPGRAM_API_KEY = os.getenv('DEEPGRAM_API_KEY', '')
CARTESIA_API_KEY = os.getenv('CARTESIA_API_KEY', '')

PIN_FILE = '/tmp/warroom-pin.json'
AGENT_ROSTER = '/tmp/warroom-agents.json'
DEBUG_LOG = '/tmp/warroom-debug.log'
