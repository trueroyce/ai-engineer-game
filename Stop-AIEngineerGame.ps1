[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8091
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseUrl = "http://127.0.0.1:$Port/"

function Normalize-Text([string]$Text) {
  if ($null -eq $Text) { return '' }
  return ($Text -replace "`r`n", "`n").TrimEnd("`r", "`n")
}

function Get-ListeningProcessId([int]$ListenPort) {
  try {
    $connection = Get-NetTCPConnection -State Listen -LocalPort $ListenPort -ErrorAction Stop |
      Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::1', '::') } |
      Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
  } catch {}
  $pattern = "^\s*TCP\s+\S+:$ListenPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
  foreach ($line in (& netstat -ano -p tcp 2>$null)) {
    if ($line -match $pattern) { return [int]$Matches[1] }
  }
  return $null
}

function Test-ExpectedGameServer {
  try {
    $indexResponse = Invoke-WebRequest -UseBasicParsing -Uri "${BaseUrl}index.html" -TimeoutSec 2
    $renderResponse = Invoke-WebRequest -UseBasicParsing -Uri "${BaseUrl}src/case-02/render.js" -TimeoutSec 2
    $capability = Invoke-RestMethod -Uri "${BaseUrl}api/local-coach/capability" -TimeoutSec 2
    $localIndex = Get-Content -LiteralPath (Join-Path $ProjectRoot 'index.html') -Raw -Encoding UTF8
    $localRender = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\case-02\render.js') -Raw -Encoding UTF8
    return (Normalize-Text $indexResponse.Content) -eq (Normalize-Text $localIndex) -and
      (Normalize-Text $renderResponse.Content) -eq (Normalize-Text $localRender) -and
      $capability.schema -eq 'ai-engineer-game.local-coach.v1'
  } catch {
    return $false
  }
}

try {
  $ownerPid = Get-ListeningProcessId $Port
  if (-not $ownerPid) {
    Write-Host "連接埠 $Port 沒有執行中的本遊戲服務。"
    exit 0
  }
  if (-not (Test-ExpectedGameServer)) {
    throw "連接埠 $Port 的服務未通過本遊戲版本與 capability 檢查；拒絕停止 PID $ownerPid。"
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction Stop
  $expectedCommand = "scripts[\\/]serve\.mjs\s+$Port(?:\s|$)"
  if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch $expectedCommand) {
    throw "PID $ownerPid 的命令列不是預期的 node scripts/serve.mjs $Port；拒絕停止。"
  }

  Stop-Process -Id $ownerPid -ErrorAction Stop
  Write-Host "已停止 AI 工程接案遊戲（PID $ownerPid，port $Port）。" -ForegroundColor Green
  Write-Host '瀏覽器 localStorage 與 runs/ 不會被刪除；下次執行 Start-AIEngineerGame.cmd 即可繼續。'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

