# 현재 폴더를 GitHub 레포에 커밋합니다 (git 설치 불필요, GitHub API 사용).
# 사전 준비: 사용자 환경변수 GITHUB_TOKEN 에 GitHub 토큰(Contents 읽기/쓰기 권한) 저장
# 사용: powershell -ExecutionPolicy Bypass -File tools\push-github.ps1 -Message "커밋 메시지"
#       -Check 만 붙이면 레포 상태만 확인하고 아무것도 올리지 않습니다.
param(
  [string]$Repo = 'actionseat',
  [string]$Owner = '',
  [string]$Message = '액션 자리뽑기 업데이트',
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$token = $env:GITHUB_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN', 'User') }
if (-not $token) { throw 'GITHUB_TOKEN 환경변수가 없습니다.' }
$H = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'action-seat-uploader' }
$api = 'https://api.github.com'
function Call($method, $path, $body) {
  $p = @{ Method = $method; Uri = "$api$path"; Headers = $H }
  if ($body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 8 -Compress)); $p.ContentType = 'application/json; charset=utf-8' }
  Invoke-RestMethod @p
}
function Status($e) { try { [int]$e.Exception.Response.StatusCode } catch { 0 } }

if (-not $Owner) { $Owner = (Call GET '/user').login }
try { $repoInfo = Call GET "/repos/$Owner/$Repo" } catch { throw "레포 $Owner/$Repo 를 찾을 수 없습니다 ($((Status $_)))." }
$branch = $repoInfo.default_branch
$head = $null
try { $head = (Call GET "/repos/$Owner/$Repo/git/ref/heads/$branch").object.sha } catch { if ((Status $_) -notin 404, 409) { throw } }
Write-Host "레포: $Owner/$Repo  브랜치: $branch  비공개: $($repoInfo.private)"
if ($head) {
  $tree = Call GET "/repos/$Owner/$Repo/git/trees/$head"
  Write-Host ("현재 최상위 항목: " + (($tree.tree | ForEach-Object { $_.path }) -join ', '))
} else { Write-Host '현재 레포가 비어 있습니다.' }
if ($Check) { return }

# 빈 레포는 Git Data API가 동작하지 않으므로 .gitignore 하나로 첫 커밋을 만든다
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
if (-not $head) {
  $gi = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root '.gitignore')))
  $r = Call PUT "/repos/$Owner/$Repo/contents/.gitignore" @{ message = '초기 커밋'; content = $gi; branch = $branch }
  $head = $r.commit.sha
}

# 올릴 파일 목록 (.gitignore 의 폴더 제외)
$ignore = @('tools/raw/', 'images/', '.claude/')
$files = Get-ChildItem $root -Recurse -File -Force | ForEach-Object { $_.FullName.Substring($root.Length + 1).Replace('\', '/') } |
  Where-Object { $p = $_; -not ($ignore | Where-Object { $p.StartsWith($_) }) -and -not $p.StartsWith('.git/') }
$items = @(); $i = 0
foreach ($f in $files) {
  $i++
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root $f)))
  $blob = $null
  for ($t = 1; $t -le 3 -and -not $blob; $t++) { try { $blob = Call POST "/repos/$Owner/$Repo/git/blobs" @{ content = $b64; encoding = 'base64' } } catch { if ($t -eq 3) { throw "업로드 실패: $f" }; Start-Sleep 2 } }
  $items += @{ path = $f; mode = '100644'; type = 'blob'; sha = $blob.sha }
  if ($i % 20 -eq 0) { Write-Host "[$i/$($files.Count)]" }
}
# base_tree 없이 만들면 레포 내용이 지금 폴더와 똑같아짐 (폴더에 없는 파일은 레포에서도 빠짐)
$newTree = Call POST "/repos/$Owner/$Repo/git/trees" @{ tree = $items }
$commit = Call POST "/repos/$Owner/$Repo/git/commits" @{ message = $Message; tree = $newTree.sha; parents = @($head) }
Call PATCH "/repos/$Owner/$Repo/git/refs/heads/$branch" @{ sha = $commit.sha } | Out-Null
Write-Host "커밋 완료: $($commit.sha.Substring(0,7))  파일 $($items.Count)개"
Write-Host "https://github.com/$Owner/$Repo/commit/$($commit.sha)"
