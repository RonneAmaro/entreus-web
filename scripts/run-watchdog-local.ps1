$ProjectPath = "C:\Porjetos\EntreUS\entreus-web"
$LogDir = Join-Path $ProjectPath "reports\watchdog-logs"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "watchdog-$Stamp.log"

Set-Location $ProjectPath

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Iniciando EntreUS Supabase/R2 Watchdog" | Out-File -FilePath $LogFile -Encoding utf8

npm.cmd run watchdog:supabase-r2 *>> $LogFile

$ExitCode = $LASTEXITCODE

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Finalizado com código $ExitCode" | Out-File -FilePath $LogFile -Append -Encoding utf8

exit $ExitCode
