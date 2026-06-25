import { readEnvFile, PROJECT_ROOT as ROOT } from './env.js'
import { join } from 'path'

const env = readEnvFile()

export const PROJECT_ROOT = ROOT
export const STORE_DIR = join(PROJECT_ROOT, 'store')
export const UPLOADS_DIR = join(PROJECT_ROOT, 'workspace', 'uploads')
export const MEET_BRIEFS_DIR = join(PROJECT_ROOT, 'outputs', 'meet_briefs')

export const TELEGRAM_BOT_TOKEN = env['TELEGRAM_BOT_TOKEN'] ?? ''
export const ALLOWED_CHAT_ID = env['ALLOWED_CHAT_ID'] ?? ''
export const OPENCODE_API_KEY = env['OPENCODE_API_KEY'] ?? ''
export const OPENCODE_API_BASE_URL = env['OPENCODE_API_BASE_URL'] ?? ''
export const OPENCODE_MODEL = env['OPENCODE_MODEL'] ?? 'deepseek-v4-flash-free'

export const GROQ_API_KEY = env['GROQ_API_KEY'] ?? ''
export const ELEVENLABS_API_KEY = env['ELEVENLABS_API_KEY'] ?? ''
export const ELEVENLABS_VOICE_ID = env['ELEVENLABS_VOICE_ID'] ?? ''
export const GRADIUM_API_KEY = env['GRADIUM_API_KEY'] ?? ''
export const DEEPGRAM_API_KEY = env['DEEPGRAM_API_KEY'] ?? ''
export const CARTESIA_API_KEY = env['CARTESIA_API_KEY'] ?? ''
export const PIKA_API_KEY = env['PIKA_API_KEY'] ?? ''
export const RECALL_API_KEY = env['RECALL_API_KEY'] ?? ''
export const DASHBOARD_TOKEN = env['DASHBOARD_TOKEN'] ?? ''
export const SECURITY_PIN_HASH = env['SECURITY_PIN_HASH'] ?? ''
export const EMERGENCY_KILL_PHRASE = env['EMERGENCY_KILL_PHRASE'] ?? ''

export const MAX_MESSAGE_LENGTH = 4096
export const TYPING_REFRESH_MS = 4000
export const AGENT_TIMEOUT_MS = Number(env['AGENT_TIMEOUT_MS']) || 900000
export const AGENT_MAX_TURNS = Number(env['AGENT_MAX_TURNS']) || 8
export const SHOW_COST_FOOTER = (env['SHOW_COST_FOOTER'] ?? 'compact') as 'compact' | 'verbose' | 'cost' | 'full' | 'off'
export const IDLE_LOCK_MINUTES = Number(env['IDLE_LOCK_MINUTES']) || 30
export const DASHBOARD_PORT = Number(env['DASHBOARD_PORT']) || 3141
export const LOG_LEVEL = env['LOG_LEVEL'] ?? 'info'

export const OBSIDIAN_VAULT_PATH = env['OBSIDIAN_VAULT_PATH'] ?? ''
