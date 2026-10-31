[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8091,
  [switch]$NoBrowser,
  [ValidateRange(2, 60)]
  [int]$StartupTimeoutSeconds = 12
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseUrl = "http://127.0.0.1:$Port/"
$CapabilityUrl = "${BaseUrl}api/local-coach/capability"
$ExpectedSchema = 'ai-engineer-game.local-coach.v1'

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
  } catch {
    # Windows PowerShell installations without Get-NetTCPConnection use netstat below.
  }

  $pattern = "^\s*TCP\s+\S+:$ListenPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
  foreach ($line in (& netstat -ano -p tcp 2>$null)) {
    if ($line -match $pattern) { return [int]$Matches[1] }
  }
  return $null
}

function Get-ProcessSummary([int]$ProcessId) {
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    if ($process) { return "PID $ProcessId ($($process.Name))：$($process.CommandLine)" }
  } catch {
    # PID alone is still enough to diagnose the conflict safely.
  }
  return "PID $ProcessId"
}

function Test-ExpectedGameServer {
  try {
    $indexResponse = Invoke-WebRequest -UseBasicParsing -Uri "${BaseUrl}index.html" -TimeoutSec 2
    $renderResponse = Invoke-WebRequest -UseBasicParsing -Uri "${BaseUrl}src/case-02/render.js" -TimeoutSec 2
    $capability = Invoke-RestMethod -Uri $CapabilityUrl -TimeoutSec 2

    $localIndex = Get-Content -LiteralPath (Join-Path $ProjectRoot 'index.html') -Raw -Encoding UTF8
    $localRender = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\case-02\render.js') -Raw -Encoding UTF8
    $sameAssets = (Normalize-Text $indexResponse.Content) -eq (Normalize-Text $localIndex) -and
      (Normalize-Text $renderResponse.Content) -eq (Normalize-Text $localRender)
    $sameCapability = $capability.schema -eq $ExpectedSchema -and
      $capability.endpoint -eq '/api/local-coach/runs' -and
      $capability.analysisEndpoint -eq '/api/local-coach/analyze'

    return [pscustomobject]@{
      Healthy = [bool]($sameAssets -and $sameCapability)
      AssetsMatch = [bool]$sameAssets
      CapabilityMatch = [bool]$sameCapability
    }
  } catch {
    return [pscustomobject]@{
      Healthy = $false
      AssetsMatch = $false
      CapabilityMatch = $false
    }
  }
}

function Open-Game {
  if (-not $NoBrowser) {
    Start-Process $BaseUrl | Out-Null
  }
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'scripts\serve.mjs'))) {
    throw "找不到 scripts\serve.mjs。請從完整的 GitHub 專案資料夾執行啟動器。"
  }

  $existing = Test-ExpectedGameServer
  if ($existing.Healthy) {
    Write-Host "AI 工程接案遊戲已在 $BaseUrl 執行；沿用現有服務，不重複啟動。" -ForegroundColor Green
    Write-Host "同一個 127.0.0.1:$Port 來源會保留這個瀏覽器原有的職涯存檔。"
    Open-Game
    exit 0
  }

  $ownerPid = Get-ListeningProcessId $Port
  if ($ownerPid) {
    $summary = Get-ProcessSummary $ownerPid
    throw "連接埠 $Port 已被其他或不同版本的服務占用（$summary）。為保護既有存檔，啟動器不會改用其他 port，也不會自動終止該程序。請先確認並停止占用者，再重新執行。"
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw '找不到 Node.js。請先從 https://nodejs.org/ 安裝 Node.js 24 以上版本，重新開啟終端機後再試。'
  }
  $nodeVersionText = (& $node.Source --version).Trim()
  $nodeVersion = [Version](($nodeVersionText.TrimStart('v') -split '-')[0])
  if ($nodeVersion.Major -lt 24) {
    throw "Node.js 版本為 $nodeVersionText；本遊戲需要 Node.js 24 以上。"
  }

  $claudePath = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
  if (Test-Path -LiteralPath $claudePath) {
    $claudeVersion = (& $claudePath --version 2>$null | Select-Object -First 1)
    Write-Host "Claude Code：$claudeVersion" -ForegroundColor DarkGray
  } else {
    Write-Warning '未找到 Claude Code（預期位置：~\.local\bin\claude.exe）。遊戲仍可完整遊玩與本機存檔，但「Claude 賽後教練」會在按下分析時明確失敗。'
  }

  Write-Host "啟動 AI 工程接案遊戲：$BaseUrl" -ForegroundColor Cyan
  $server = Start-Process -FilePath $node.Source -ArgumentList @('scripts/serve.mjs', [string]$Port) -WorkingDirectory $ProjectRoot -WindowStyle Minimized -PassThru

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  do {
    Start-Sleep -Milliseconds 250
    if ($server.HasExited) {
      throw "本機服務在完成啟動前結束（exit $($server.ExitCode)）。請在 PowerShell 執行 npm start -- $Port 查看完整錯誤。"
    }
    $started = Test-ExpectedGameServer
  } while (-not $started.Healthy -and (Get-Date) -lt $deadline)

  if (-not $started.Healthy) {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    throw "本機服務未在 $StartupTimeoutSeconds 秒內通過版本與 MCP capability 檢查。已停止這次啟動的子程序；沒有終止任何原有程序。"
  }

  Write-Host "啟動完成（PID $($server.Id)）。" -ForegroundColor Green
  Write-Host '停止服務可執行 Stop-AIEngineerGame.cmd；瀏覽器 localStorage 不會被刪除。'
  Open-Game
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
