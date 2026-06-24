import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env')

PROJECT_ROOT = str(Path(__file__).parent.parent.resolve())

PORT = int(os.getenv('WARROOM_PORT', '7860'))
MODE = os.getenv('WARROOM_MODE', 'live')

PIN_FILE = os.path.join(PROJECT_ROOT, 'store', 'warroom-pin.json')
AGENT_ROSTER = os.path.join(PROJECT_ROOT, 'store', 'warroom-agents.json')
DEBUG_LOG = os.path.join(PROJECT_ROOT, 'store', 'warroom-debug.log')

GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY', '')
DEEPGRAM_API_KEY = os.getenv('DEEPGRAM_API_KEY', '')
CARTESIA_API_KEY = os.getenv('CARTESIA_API_KEY', '')
