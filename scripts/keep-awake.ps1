# Prevent Windows sleep, lock screen only, add wake timer
# Run as Admin: powershell -ExecutionPolicy Bypass -File scripts\keep-awake.ps1

Write-Host "=== OpenCode OS: Keep Awake Setup ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Prevent sleep on AC power ──
Write-Host "[1/4] Preventing sleep on AC power..." -ForegroundColor Yellow
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 30   # screen off after 30min is fine
Write-Host "  OK - Sleep disabled, hibernate disabled" -ForegroundColor Green

# ── 2. Prevent sleep on battery (laptops) ──
Write-Host "[2/4] Preventing sleep on battery..." -ForegroundColor Yellow
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-dc 0
powercfg /change monitor-timeout-dc 15
Write-Host "  OK - Battery sleep disabled" -ForegroundColor Green

# ── 3. Create wake-up scheduled task (every 4 hours) ──
Write-Host "[3/4] Creating wake-up scheduled task..." -ForegroundColor Yellow
$taskName = "OpenCodeOS_KeepAwake"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command Write-Host 'OpenCode OS wake ping'"
$trigger = New-ScheduledTaskTrigger -Daily -At "00:00" -RepetitionInterval (New-TimeSpan -Hours 4) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
    Write-Host "  OK - Wake task '$taskName' runs every 4 hours" -ForegroundColor Green
} catch {
    Write-Host "  WARN - Could not create scheduled task (run as Admin): $_" -ForegroundColor Yellow
}

# ── 4. Disable sleep via power request (alternative guard) ──
Write-Host "[4/4] Creating background keep-awake guard..." -ForegroundColor Yellow
$guardScript = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class KeepAwake {
    [DllImport("kernel32.dll")]
    static extern uint SetThreadExecutionState(uint esFlags);
    const uint ES_CONTINUOUS = 0x80000000;
    const uint ES_SYSTEM_REQUIRED = 0x00000001;

    public static void Main() {
        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
        Thread.Sleep(Timeout.Infinite);
    }
}
"@

$guardPath = Join-Path (Split-Path $PSScriptRoot -Parent) "store"
$exePath = Join-Path $guardPath "KeepAwakeGuard.exe"
try {
    Add-Type -TypeDefinition $guardScript -Language CSharp -OutputAssembly $exePath
    Write-Host "  OK - Guard compiled to $exePath" -ForegroundColor Green
    Write-Host "  Run it manually or add to startup: Start-Process '$exePath' -WindowStyle Hidden"
} catch {
    Write-Host "  WARN - Could not compile guard (C# compiler needed): $_" -ForegroundColor Yellow
    Write-Host "  Fallback: system powercfg settings are sufficient"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "The PC will NOT sleep while on AC power."
Write-Host "Screen will turn off after 30 min (AC) / 15 min (battery)."
Write-Host "PC will wake every 4 hours to check on the bot."
Write-Host "Lock screen is recommended: Win + L" -ForegroundColor Green
Write-Host ""
Write-Host "To revert sleep settings:"
Write-Host "  powercfg /change standby-timeout-ac 30"
Write-Host "  powercfg /change hibernate-timeout-ac 60"
Write-Host "  powercfg /change standby-timeout-dc 15"
Write-Host "  powercfg /change hibernate-timeout-dc 30"
Write-Host ""
Write-Host "To remove wake task:"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
