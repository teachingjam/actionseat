# 효과음·배경음악을 다시 만들어 public/assets/sfx 에 넣습니다 (Node.js 와 ffmpeg 필요).
# 사용: powershell -ExecutionPolicy Bypass -File tools\build-audio.ps1
$tmp = Join-Path $env:TEMP 'actionseat-audio'
$dst = Join-Path $PSScriptRoot '..\public\assets\sfx'
node (Join-Path $PSScriptRoot 'make-sfx.js') $tmp
node (Join-Path $PSScriptRoot 'make-music.js') $tmp
Get-ChildItem $tmp -Filter *.wav | ForEach-Object { ffmpeg -v error -y -i $_.FullName -c:a libvorbis -q:a 4 (Join-Path $dst ($_.BaseName + '.ogg')) }
