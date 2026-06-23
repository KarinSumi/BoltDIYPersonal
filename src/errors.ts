export type ErrorCategory =
  | 'auth'
  | 'rate_limit'
  | 'context_exhausted'
  | 'timeout'
  | 'subprocess_crash'
  | 'network'
  | 'billing'
  | 'overloaded'
  | 'unknown'

export interface ErrorRecovery {
  shouldRetry: boolean
  shouldNewChat: boolean
  shouldSwitchModel: boolean
  retryAfterMs: number
  userMessage: string
}

const categoryPatterns: Record<ErrorCategory, RegExp[]> = {
  auth: [/unauthorized/i, /401/, /invalid api key/i, /authentication failed/i],
  rate_limit: [/rate limit/i, /429/, /too many requests/i, /rate_limit/i],
  context_exhausted: [/context window/i, /max tokens/i, /context length/i, /too many tokens/i],
  timeout: [/timeout/i, /timed out/i, /etimedout/i, /esockettimedout/i],
  subprocess_crash: [/exit code/i, /non-zero exit/i, /process crashed/i, /signal/i],
  network: [/econnrefused/i, /enotfound/i, /econnreset/i, /network/i, /socket/i, /fetch failed/i],
  billing: [/billing/i, /quota/i, /insufficient/i, /rate limit.*(?:free|tier)/i],
  overloaded: [/overloaded/i, /529/, /503/, /502/, /service unavailable/i],
  unknown: [],
}

export function classifyError(error: Error | string): { category: ErrorCategory; recovery: ErrorRecovery } {
  const message = typeof error === 'string' ? error : error.message

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    if (category === 'unknown') continue
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return { category: category as ErrorCategory, recovery: getRecovery(category as ErrorCategory) }
      }
    }
  }

  return { category: 'unknown', recovery: getRecovery('unknown') }
}

function getRecovery(category: ErrorCategory): ErrorRecovery {
  switch (category) {
    case 'auth':
      return { shouldRetry: false, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 0, userMessage: 'Authentication failed. Check your API keys.' }
    case 'rate_limit':
      return { shouldRetry: true, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 30000, userMessage: 'Rate limited. Waiting before retry...' }
    case 'context_exhausted':
      return { shouldRetry: true, shouldNewChat: true, shouldSwitchModel: true, retryAfterMs: 1000, userMessage: 'Context window full. Starting fresh session.' }
    case 'timeout':
      return { shouldRetry: true, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 5000, userMessage: 'Request timed out. Retrying...' }
    case 'subprocess_crash':
      return { shouldRetry: true, shouldNewChat: true, shouldSwitchModel: false, retryAfterMs: 2000, userMessage: 'Agent process crashed. Restarting...' }
    case 'network':
      return { shouldRetry: true, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 10000, userMessage: 'Network error. Retrying...' }
    case 'billing':
      return { shouldRetry: false, shouldNewChat: false, shouldSwitchModel: true, retryAfterMs: 0, userMessage: 'Billing limit reached or quota exceeded.' }
    case 'overloaded':
      return { shouldRetry: true, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 15000, userMessage: 'Service overloaded. Waiting...' }
    default:
      return { shouldRetry: false, shouldNewChat: false, shouldSwitchModel: false, retryAfterMs: 0, userMessage: 'An unexpected error occurred.' }
  }
}
