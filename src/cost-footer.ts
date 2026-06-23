export type CostFooterMode = 'compact' | 'verbose' | 'cost' | 'full' | 'off'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function stripModelSuffix(model: string): string {
  return model.replace(/-\d{8}$/, '')
}

function estimateCost(inputTokens: number, outputTokens: number): string {
  const inputRate = 3.0 / 1_000_000
  const outputRate = 15.0 / 1_000_000
  const cost = (inputTokens * inputRate) + (outputTokens * outputRate)
  if (cost < 0.01) return '<$0.01'
  return `~$${cost.toFixed(2)}`
}

export function formatCostFooter(
  model: string,
  inputTokens: number,
  outputTokens: number,
  mode?: CostFooterMode
): string {
  if (mode === 'off') return ''

  const short = stripModelSuffix(model)
  if (mode === 'compact') return `[${short}]`
  if (mode === 'verbose') return `[${short} | ${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out]`
  if (mode === 'cost') return `[${short} | ${estimateCost(inputTokens, outputTokens)}]`
  if (mode === 'full') return `[${short} | ${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out | ${estimateCost(inputTokens, outputTokens)}]`

  return `[${short}]`
}
