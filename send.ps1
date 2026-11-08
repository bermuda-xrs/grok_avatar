# Sends a message to a Grok Bot chat through the app's own deep links, then presses Enter.
# Exit codes: 1 window never appeared, 2 invalid agent id, 3 Grok Bot lost focus (nothing typed).
# Note: if the chat already holds an unsent draft, Grok Bot keeps it and Enter sends the draft.
param([Parameter(Mandatory)][string]$Msg, [string]$AgentId = '', [switch]$Minimize)

Add-Type @"
using System; using System.Runtime.InteropServices; using System.Threading;
public static class Win {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  static void Key(byte k, bool up) { keybd_event(k, 0, up ? 2u : 0u, UIntPtr.Zero); }
  public static void Enter() { Key(0x0D, false); Thread.Sleep(30); Key(0x0D, true); }
  public static void Paste() { Key(0x11, false); Thread.Sleep(80); Key(0x56, false); Thread.Sleep(30); Key(0x56, true); Thread.Sleep(80); Key(0x11, true); }
}
"@

$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Msg))
if ($AgentId -notmatch '^[A-Za-z0-9_-]{0,128}$') { exit 2 }

$id = if ($AgentId) { "id=$AgentId&" } else { '' }
$prompt = "grokbot://app/v1/prompt?${id}text=" + [Uri]::EscapeDataString($text)
$prefill = $text.Length -le 1000 -and $prompt.Length -le 2000   # the app's link limits

$findWindow = { Get-Process 'Grok Bot' -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1 }
$previous = [Win]::GetForegroundWindow()
$cold = -not (& $findWindow)

if ($prefill) { Start-Process $prompt }
elseif ($AgentId) { Start-Process "grokbot://app/v1/agent?id=$AgentId" }
else { Start-Process 'grokbot://app/v1/open' }

$proc = $null
for ($i = 0; $i -lt 60 -and -not $proc; $i++) { $proc = & $findWindow; if (-not $proc) { Start-Sleep -Milliseconds 500 } }
if (-not $proc) { exit 1 }
if ($cold) { Start-Sleep -Seconds 6 }

$hwnd = $proc.MainWindowHandle
[Win]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
[Win]::SetForegroundWindow($hwnd) | Out-Null
$shell = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt 10 -and -not $shell.AppActivate('Grok Bot'); $i++) { Start-Sleep -Milliseconds 300 }
Start-Sleep -Milliseconds 1200

if ([Win]::GetForegroundWindow() -ne $hwnd) { exit 3 }
if (-not $prefill) {
  $clipboard = try { Get-Clipboard -Raw } catch { $null }
  Set-Clipboard -Value $text
  Start-Sleep -Milliseconds 150
  [Win]::Paste()
  Start-Sleep -Milliseconds 300
  if ($clipboard) { Set-Clipboard -Value $clipboard }
  if ([Win]::GetForegroundWindow() -ne $hwnd) { exit 3 }
}
[Win]::Enter()
Start-Sleep -Milliseconds 600

if ($Minimize) {
  [Win]::ShowWindow($hwnd, 6) | Out-Null   # SW_MINIMIZE
  if ($previous -ne [IntPtr]::Zero) { [Win]::SetForegroundWindow($previous) | Out-Null }
}
