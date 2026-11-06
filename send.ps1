# usage: send.ps1 -Msg <b64 utf8> [-AgentId <roster id>] [-Minimize]
# Uses Grok Bot's own deep links, never coordinate clicks (a missed click once hit "+" and spawned duplicate bots):
#   grokbot://app/v1/prompt?id=<agent>&text=<msg>  -> opens the bot with <msg> prefilled; we only press Enter.
#   Long messages (link limit 2048 chars) fall back to: open the bot, paste via clipboard, Enter.
# Caveat (app behavior): if that bot already has an unsent draft, Grok Bot keeps it and Enter sends the draft.
param([string]$Msg, [string]$AgentId = '', [switch]$Minimize)
$msg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Msg))
if ($AgentId -and $AgentId -notmatch '^[A-Za-z0-9_-]{1,128}$') { exit 2 }   # same id rule as the app's link parser
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Threading;
public class F{
 [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 static void Key(byte k,bool up){keybd_event(k,0,up?2u:0u,UIntPtr.Zero);}
 public static void Enter(){Key(0x0D,false);Thread.Sleep(30);Key(0x0D,true);}
 public static void Paste(){Key(0x11,false);Thread.Sleep(80);Key(0x56,false);Thread.Sleep(30);Key(0x56,true);Thread.Sleep(80);Key(0x11,true);}
}
"@
$exe = "$env:LOCALAPPDATA\Programs\Grok Bot\Grok Bot.exe"
$prev = [F]::GetForegroundWindow()
$win = { Get-Process 'Grok Bot' -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1 }
$cold = -not (& $win)

$q = if ($AgentId) { "id=$AgentId&" } else { '' }   # no id = the app's main bot
$url = "grokbot://app/v1/prompt?${q}text=" + [Uri]::EscapeDataString($msg)
$prefill = $msg.Length -le 1000 -and $url.Length -le 2000
if ($prefill) { Start-Process $url }
elseif ($AgentId) { Start-Process "grokbot://app/v1/agent?id=$AgentId" }
elseif ($cold) { Start-Process $exe }

$p = $null
for ($i = 0; $i -lt 60 -and -not $p; $i++) { $p = & $win; if (-not $p) { Start-Sleep -m 500 } }
if (-not $p) { exit 1 }
if ($cold) { Start-Sleep 6 }   # let the UI finish loading
$h = $p.MainWindowHandle
[F]::ShowWindow($h, 9) | Out-Null; [F]::SetForegroundWindow($h) | Out-Null
$s = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt 10 -and -not $s.AppActivate('Grok Bot'); $i++) { Start-Sleep -m 300 }
Start-Sleep -m 1200   # chat switch + prefill
if ([F]::GetForegroundWindow() -ne $h) { exit 3 }   # never type into some other app

if (-not $prefill) {
  $old = try { Get-Clipboard -Raw } catch { '' }
  Set-Clipboard -Value $msg; Start-Sleep -m 150
  [F]::Paste(); Start-Sleep -m 300
}
if ([F]::GetForegroundWindow() -ne $h) { exit 3 }
[F]::Enter()
Start-Sleep -m 600
if (-not $prefill -and $old) { Set-Clipboard -Value $old }

if ($Minimize) {
  [F]::ShowWindow($h, 6) | Out-Null   # SW_MINIMIZE
  if ($prev -ne [IntPtr]::Zero) { [F]::SetForegroundWindow($prev) | Out-Null }   # hand focus back
}
