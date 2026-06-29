#!/usr/bin/env node
import { execSync } from 'child_process'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const BAGIDEA_SCRIPT = join(ROOT, 'cli', 'bagidea.js')
const STARTUP_SCRIPT_NAME = 'opencode-os'

export function installStartup() {
  const platform = process.platform

  switch (platform) {
    case 'win32':
      return installWindows()
    case 'darwin':
      return installMacOS()
    case 'linux':
      return installLinux()
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

export function uninstallStartup() {
  const platform = process.platform

  switch (platform) {
    case 'win32':
      return uninstallWindows()
    case 'darwin':
      return uninstallMacOS()
    case 'linux':
      return uninstallLinux()
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

function installWindows() {
  const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  const command = `node "${BAGIDEA_SCRIPT}" start`

  try {
    execSync(
      `reg add "${regPath}" /v "${STARTUP_SCRIPT_NAME}" /t REG_SZ /d "${command}" /f`,
      { stdio: 'ignore' }
    )
    return { platform: 'win32', installed: true, key: STARTUP_SCRIPT_NAME }
  } catch (err) {
    throw new Error(`Failed to install startup entry: ${err.message}`)
  }
}

function uninstallWindows() {
  const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

  try {
    execSync(
      `reg delete "${regPath}" /v "${STARTUP_SCRIPT_NAME}" /f 2>nul`,
      { stdio: 'ignore' }
    )
    return { platform: 'win32', installed: false }
  } catch {
    return { platform: 'win32', installed: false }
  }
}

function installMacOS() {
  const launchAgentDir = join(process.env.HOME || '', 'Library', 'LaunchAgents')
  const plistPath = join(launchAgentDir, `com.opencode.${STARTUP_SCRIPT_NAME}.plist`)

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.opencode.${STARTUP_SCRIPT_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>${BAGIDEA_SCRIPT}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
</dict>
</plist>`

  if (!existsSync(launchAgentDir)) {
    mkdirSync(launchAgentDir, { recursive: true })
  }

  writeFileSync(plistPath, plistContent, 'utf-8')

  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'ignore' })
  } catch {}

  return { platform: 'darwin', installed: true, plistPath }
}

function uninstallMacOS() {
  const launchAgentDir = join(process.env.HOME || '', 'Library', 'LaunchAgents')
  const plistPath = join(launchAgentDir, `com.opencode.${STARTUP_SCRIPT_NAME}.plist`)

  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: 'ignore' })
    } catch {}
    try {
      execSync(`rm "${plistPath}"`, { stdio: 'ignore' })
    } catch {}
  }

  return { platform: 'darwin', installed: false }
}

function installLinux() {
  const autostartDir = join(process.env.HOME || '', '.config', 'autostart')
  const desktopPath = join(autostartDir, `${STARTUP_SCRIPT_NAME}.desktop`)

  const desktopContent = `[Desktop Entry]
Type=Application
Name=OpenCode OS
Exec=node ${BAGIDEA_SCRIPT} start
Path=${ROOT}
Terminal=false
X-GNOME-Autostart-enabled=true
`

  if (!existsSync(autostartDir)) {
    mkdirSync(autostartDir, { recursive: true })
  }

  writeFileSync(desktopPath, desktopContent, 'utf-8')
  execSync(`chmod +x "${desktopPath}"`, { stdio: 'ignore' })

  return { platform: 'linux', installed: true, desktopPath }
}

function uninstallLinux() {
  const desktopPath = join(
    process.env.HOME || '',
    '.config',
    'autostart',
    `${STARTUP_SCRIPT_NAME}.desktop`
  )

  try {
    execSync(`rm "${desktopPath}" 2>/dev/null`, { stdio: 'ignore' })
  } catch {}

  return { platform: 'linux', installed: false }
}

if (process.argv[1] === import.meta.filename || process.argv[1] === resolve(import.meta.filename)) {
  const command = process.argv[2] || 'install'

  try {
    if (command === 'install') {
      const result = installStartup()
      console.log(`Startup installed for ${result.platform}`)
    } else if (command === 'uninstall') {
      const result = uninstallStartup()
      console.log(`Startup removed for ${result.platform}`)
    } else {
      console.error('Usage: node tools/install-startup.js [install|uninstall]')
      process.exit(1)
    }
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

export { installStartup, uninstallStartup }
