param([uint32]$DriverPid, [uint32]$AppPid)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'token-probe.cs')
$driver = [NativeTokenProbe]::Facts($DriverPid)
$app = [NativeTokenProbe]::Facts($AppPid)
if ($app[0] -gt 0x2000 -or ($app[1] -band 4) -ne 0) {
    throw "App retained elevated access: integrity=$($app[0]), administrators=$($app[1])"
}
if ($driver[0] -ge 0x3000 -and $app[0] -ge $driver[0]) {
    throw 'App integrity was not lowered'
}
Write-Output "Verified token: driver integrity=$($driver[0]), app integrity=$($app[0]), admin flags=$($app[1])"
