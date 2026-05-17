# Push local .env values to a Render web service (after Blueprint deploy).
# Usage:
#   $env:RENDER_API_KEY = "rnd_..."
#   .\scripts\push-render-env.ps1
#   .\scripts\push-render-env.ps1 -ServiceId srv-xxxxxxxx

param(
  [string]$ServiceId = $env:RENDER_SERVICE_ID,
  [string]$ServiceName = "threadframe"
)

$ErrorActionPreference = "Stop"

if (-not $env:RENDER_API_KEY) {
  Write-Error "Set RENDER_API_KEY (Render Dashboard → Account Settings → API Keys)."
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) {
  Write-Error "Missing .env in project root."
}

function Read-DotEnv([string]$path) {
  $map = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $map[$key] = $val
  }
  return $map
}

function Invoke-RenderApi {
  param([string]$Method, [string]$Uri, $Body = $null)
  $headers = @{
    Authorization = "Bearer $($env:RENDER_API_KEY)"
    Accept        = "application/json"
  }
  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 6)
  }
  return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
}

$local = Read-DotEnv $envFile

if (-not $ServiceId) {
  Write-Host "Looking up service '$ServiceName'..."
  $services = Invoke-RenderApi -Method GET -Uri "https://api.render.com/v1/services?limit=50"
  foreach ($item in $services) {
    $svc = $item.service
    if ($svc.name -eq $ServiceName) {
      $ServiceId = $svc.id
      break
    }
  }
}

if (-not $ServiceId) {
  Write-Error "Service not found. Deploy the Blueprint first, or pass -ServiceId."
}

$viewerPassword = $local["VIEWER_PASSWORD"]
if (-not $viewerPassword) {
  $viewerPassword = [Convert]::ToBase64String((1..18 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]]).TrimEnd("=")
  Write-Host "Generated VIEWER_PASSWORD (save this): $viewerPassword"
}

$payload = @(
  @{ envVar = @{ key = "APP_ID"; value = $local["APP_ID"] } } },
  @{ envVar = @{ key = "API_SECRET"; value = $local["API_SECRET"] } } },
  @{ envVar = @{ key = "VIEWER_PASSWORD"; value = $viewerPassword } } },
  @{ envVar = @{ key = "NODE_ENV"; value = "production" } } },
  @{ envVar = @{ key = "TRUST_PROXY"; value = "true" } } }
)

if ($local["INITIAL_ACCESS_TOKEN"] -and $local["INITIAL_ACCESS_TOKEN"] -ne "your_long_lived_token") {
  $payload += @{ envVar = @{ key = "INITIAL_ACCESS_TOKEN"; value = $local["INITIAL_ACCESS_TOKEN"] } } }
}
if ($local["INITIAL_USER_ID"]) {
  $payload += @{ envVar = @{ key = "INITIAL_USER_ID"; value = $local["INITIAL_USER_ID"] } } }
}

Write-Host "Updating env vars on $ServiceId ..."
Invoke-RenderApi -Method PUT -Uri "https://api.render.com/v1/services/$ServiceId/env-vars" -Body $payload | Out-Null

Write-Host "Triggering deploy..."
Invoke-RenderApi -Method POST -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Body @{ clearCache = "do_not_clear" } | Out-Null

$detail = Invoke-RenderApi -Method GET -Uri "https://api.render.com/v1/services/$ServiceId"
$url = $detail.service.serviceDetails.url
if (-not $url -and $detail.service.slug) {
  $url = "https://$($detail.service.slug).onrender.com"
}

Write-Host ""
Write-Host "Service URL: $url"
Write-Host "Viewer login: $url/login.html"
if ($local["ADMIN_SETUP_KEY"]) {
  Write-Host "Owner OAuth: $url/auth?key=$($local['ADMIN_SETUP_KEY'])"
} else {
  Write-Host "Owner OAuth: $url/auth?key=<ADMIN_SETUP_KEY from Render dashboard>"
}
