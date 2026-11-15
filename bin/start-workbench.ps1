param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$nodeExe = 'F:/AGH/tools/node/node.exe'
$aghEntry = 'F:/AGH/runtime/agnes.mjs'
$logDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$launchLog = Join-Path $logDir 'workbench-launch.log'
function Log([string]$message) { $line = ('{0:u} {1}' -f (Get-Date), $message); Write-Host $message; Add-Content -LiteralPath $launchLog -Value $line -Encoding UTF8 }
function ServiceState([int]$port, [string]$kind) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { return 'missing' }
    try { $response = Invoke-WebRequest ('http://127.0.0.1:{0}/' -f $port) -UseBasicParsing -TimeoutSec 5 } catch { return 'occupied' }
    if ($response.StatusCode -ne 200) { return 'occupied' }
    if ($kind -eq 'agh' -and $response.Content -match 'id=["'']agnes-config["'']' -and $response.Content -match 'data-ws=') { return 'ready' }
    if ($kind -eq 'product' -and $response.Content -match '一间好自习' -and $response.Content -match 'id="generate"' -and $response.Content -match 'historyReplay') { return 'ready' }
    return 'occupied'
}
function EnsureService([int]$port, [string]$kind, [string[]]$arguments) {
    $state = ServiceState $port $kind
    if ($state -eq 'ready') { Log ('复用已识别服务：{0} 端口 {1}' -f $kind,$port); return }
    if ($state -eq 'occupied') { throw ('端口 {0} 已被未识别服务占用。请核对服务地址与端口；脚本不会结束该进程。' -f $port) }
    $stdout = Join-Path $logDir ('workbench-{0}.out.log' -f $kind)
    $stderr = Join-Path $logDir ('workbench-{0}.err.log' -f $kind)
    $child = Start-Process -FilePath $nodeExe -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    Log ('已启动指定服务：{0} PID {1}，等待就绪' -f $kind,$child.Id)
    $deadline = (Get-Date).AddSeconds(40)
    do {
        Start-Sleep -Milliseconds 500
        $state = ServiceState $port $kind
        if ($state -eq 'ready') { Log ('服务已就绪：{0}' -f $kind); return }
        $child.Refresh()
        if ($child.HasExited) { throw ('{0} 服务已退出，请查看 {1}' -f $kind,$stderr) }
    } while ((Get-Date) -lt $deadline)
    throw ('{0} 服务等待超时，未结束进程。请查看 {1} 并核对端口。' -f $kind,$stderr)
}
try {
    if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw '缺少指定 Node。请核对 F:/AGH/tools/node/node.exe；不自动安装。' }
    if (-not (Test-Path -LiteralPath $aghEntry -PathType Leaf)) { throw '缺少已安装 AGH 入口。请核对 F:/AGH/runtime/agnes.mjs。' }
    # Process environment only; do not read credentials or modify system configuration.
    $env:AGH_HOME = 'F:/AGH/state'
    $env:AGNES_PROFILE = 'local-dev'
    $env:TEMP = 'F:/AGH/temp'
    $env:TMP = 'F:/AGH/temp'
    $env:PATH = 'F:/AGH/tools/node;F:/AGH/tools/bin;' + $env:PATH
    $env:NO_PROXY = 'localhost,127.0.0.1,::1'
    if ($env:NODE_OPTIONS -notmatch '(^|\s)--use-env-proxy(\s|$)') { $env:NODE_OPTIONS = ($env:NODE_OPTIONS + ' --use-env-proxy').Trim() }
    $proxy = [Net.WebRequest]::GetSystemWebProxy().GetProxy([Uri]'https://totokens.cc/v1')
    if ($proxy -and $proxy.AbsoluteUri -ne 'https://totokens.cc/v1') {
        $env:HTTP_PROXY = $proxy.AbsoluteUri
        $env:HTTPS_PROXY = $proxy.AbsoluteUri
        Log '已读取系统代理地址，仅设置本进程及子进程代理环境。'
    }
    EnsureService 4177 'agh' @('--use-env-proxy',$aghEntry,'serve','--port','4177','--profile','local-dev','--cwd',$projectRoot)
    EnsureService 4319 'product' @('--use-env-proxy',(Join-Path $projectRoot 'src/task-api.mjs'))
    Log '工作台就绪：http://127.0.0.1:4319/；模型配置由 AGH 保管。'
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4319/' }
    exit 0
} catch {
    Log ('启动失败：' + $_.Exception.Message)
    Log ('处理步骤：核对指定安装文件、端口服务和 AGH 配置，再重试。日志：' + $launchLog)
    exit 1
}
