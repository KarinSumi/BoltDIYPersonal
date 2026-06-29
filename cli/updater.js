import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'

const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/anomalyco/opencode-agent/main/VERSION'
const REMOTE_REPO = 'https://github.com/anomalyco/opencode-agent.git'

export async function selfUpdate(options = {}) {
  const repoRoot = options.repoRoot || resolve(import.meta.dirname, '..')
  const versionFile = join(repoRoot, 'VERSION')

  const currentVersion = existsSync(versionFile)
    ? readFileSync(versionFile, 'utf-8').trim()
    : '1.0.0'

  let remoteVersion
  try {
    const resp = await fetch(options.remoteUrl || REMOTE_VERSION_URL)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    remoteVersion = (await resp.text()).trim()
  } catch {
    throw new Error('Could not check remote version -- no internet?')
  }

  if (currentVersion === remoteVersion) {
    return { updated: false, currentVersion }
  }

  if (!options.dryRun) {
    execSync(`git pull ${REMOTE_REPO} main`, { cwd: repoRoot, stdio: 'inherit' })

    if (existsSync(join(repoRoot, 'package.json'))) {
      try {
        execSync('npm install', { cwd: repoRoot, stdio: 'inherit' })
      } catch {}
    }

    writeFileSync(versionFile, remoteVersion, 'utf-8')
  }

  return { updated: true, currentVersion, newVersion: remoteVersion }
}
