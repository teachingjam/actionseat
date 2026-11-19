# public 폴더를 Vercel에 배포합니다 (Node/CLI 불필요).
# 사전 준비: 사용자 환경변수 VERCEL_TOKEN 에 Vercel 토큰 저장
# 사용: powershell -ExecutionPolicy Bypass -File tools\deploy-vercel.ps1
param(
  [string]$Project = 'action-seat',
  [string]$TeamId = 'team_pHJ00wpchepaHNw1UN8M1LLG',
  [string]$Dir = (Join-Path $PSScriptRoot '..\public'),
  [switch]$Preview
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$token = $env:VERCEL_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('VERCEL_TOKEN', 'User') }
if (-not $token) { throw 'VERCEL_TOKEN 환경변수가 없습니다.' }
$auth = @{ Authorization = "Bearer $token" }
$api = 'https://api.vercel.com'

$root = (Resolve-Path $Dir).Path.TrimEnd('\')
$sha1 = [Security.Cryptography.SHA1]::Create()
$list = @()
$files = Get-ChildItem $root -Recurse -File
$i = 0
foreach ($f in $files) {
  $i++
  $bytes = [IO.File]::ReadAllBytes($f.FullName)
  $sha = -join ($sha1.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $h = $auth.Clone(); $h['x-vercel-digest'] = $sha
  $ok = $false
  for ($try = 1; $try -le 3 -and -not $ok; $try++) {
    try {
      Invoke-RestMethod -Method Post -Uri "$api/v2/files?teamId=$TeamId" -Headers $h -Body $bytes -ContentType 'application/octet-stream' | Out-Null
      $ok = $true
    } catch {
      if ($try -eq 3) { throw "업로드 실패: $rel - $($_.Exception.Message)" }
      Start-Sleep -Seconds 2
    }
  }
  Write-Host ("[{0}/{1}] {2}" -f $i, $files.Count, $rel)
  $list += @{ file = $rel; sha = $sha; size = $bytes.Length }
}

$body = @{
  name = $Project
  project = $Project
  files = $list
  projectSettings = @{ framework = $null; buildCommand = $null; installCommand = $null; outputDirectory = $null }
}
if (-not $Preview) { $body.target = 'production' }
$json = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6 -Compress))
$dep = Invoke-RestMethod -Method Post -Uri "$api/v13/deployments?teamId=$TeamId&skipAutoDetectionConfirmation=1" -Headers $auth -Body $json -ContentType 'application/json; charset=utf-8'
Write-Host "배포 생성: $($dep.id)  https://$($dep.url)"

for ($n = 0; $n -lt 60; $n++) {
  Start-Sleep -Seconds 3
  $d = Invoke-RestMethod -Uri "$api/v13/deployments/$($dep.id)?teamId=$TeamId" -Headers $auth
  if ($d.readyState -in 'READY', 'ERROR', 'CANCELED') { break }
}
Write-Host "상태: $($d.readyState)"
if ($d.alias) { $d.alias | ForEach-Object { Write-Host "주소: https://$_" } }
