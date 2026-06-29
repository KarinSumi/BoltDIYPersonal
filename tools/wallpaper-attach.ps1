param(
    [Parameter(Mandatory = $false)]
    [string]$ProcessName = "godot.windows.opt.tools.x86_64.exe",

    [Parameter(Mandatory = $false)]
    [int]$SearchTimeout = 10,

    [Parameter(Mandatory = $false)]
    [switch]$Detach
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32Window {
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetShellWindow();

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const int SW_HIDE = 0;
    public const int SW_SHOW = 5;
    public const int SW_SHOWNA = 8;

    public static IntPtr FindWorkerW() {
        IntPtr shellWindow = GetShellWindow();
        IntPtr workerW = IntPtr.Zero;
        IntPtr progman = IntPtr.Zero;

        EnumWindows((hWnd, lParam) => {
            StringBuilder sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString();

            if (title == "Program Manager") {
                progman = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (progman == IntPtr.Zero) {
            return IntPtr.Zero;
        }

        IntPtr child = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (child == IntPtr.Zero) {
            EnumWindows((hWnd, lParam) => {
                child = FindWindowEx(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (child != IntPtr.Zero) {
                    workerW = hWnd;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
        } else {
            workerW = FindWindowEx(IntPtr.Zero, progman, "WorkerW", null);
        }

        return workerW != IntPtr.Zero ? workerW : progman;
    }
}
"@

function Get-WindowByProcessName {
    param([string]$Name)
    $procs = Get-Process -Name ($Name -replace '\.exe$', '') -ErrorAction SilentlyContinue
    if (-not $procs) {
        return $null
    }
    foreach ($p in $procs) {
        if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
            return $p.MainWindowHandle
        }
    }
    return $null
}

if ($Detach) {
    Write-Host "Detaching from wallpaper..."
    $hwnd = Get-WindowByProcessName -Name $ProcessName
    if ($hwnd -ne [IntPtr]::Zero) {
        [Win32Window]::ShowWindow($hwnd, [Win32Window]::SW_SHOW)
        [Win32Window]::SetParent($hwnd, [Win32Window]::GetDesktopWindow())
        Write-Host "Detached. Window is now standalone."
    } else {
        Write-Host "Process window not found."
    }
    return
}

Write-Host "Waiting for Godot window ($ProcessName)..."

$hwnd = $null
$elapsed = 0
while ($elapsed -lt $SearchTimeout) {
    $hwnd = Get-WindowByProcessName -Name $ProcessName
    if ($hwnd -ne [IntPtr]::Zero) {
        Write-Host "Found Godot window handle: $hwnd"
        break
    }
    Start-Sleep -Seconds 1
    $elapsed++
}

if ($hwnd -eq [IntPtr]::Zero) {
    Write-Host "ERROR: Could not find Godot window within ${SearchTimeout}s." -ForegroundColor Red
    exit 1
}

$workerW = [Win32Window]::FindWorkerW()
if ($workerW -eq [IntPtr]::Zero) {
    Write-Host "ERROR: Could not find WorkerW/Progman." -ForegroundColor Red
    exit 1
}

Write-Host "Found WorkerW: $workerW"

$screenWidth = [System.Windows.Forms.SystemInformation]::VirtualScreen.Width
$screenHeight = [System.Windows.Forms.SystemInformation]::VirtualScreen.Height

[Win32Window]::ShowWindow($hwnd, [Win32Window]::SW_SHOWNA)
[Win32Window]::SetParent($hwnd, $workerW)
[Win32Window]::MoveWindow($hwnd, 0, 0, $screenWidth, $screenHeight, $true)

Write-Host "SUCCESS: Godot window attached as wallpaper behind desktop icons."
Write-Host "Window is NOT visible in Alt+Tab."
exit 0
