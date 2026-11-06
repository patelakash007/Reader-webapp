$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

$requiredPaths = @(
  'manifest.webmanifest',
  'sw.js',
  'index.html',
  'style.css',
  'script.js',
  'vendor/marked.esm.mjs',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
)

$srcFiles = Get-ChildItem -Path (Join-Path $projectRoot "src") -Filter "*.mjs" | ForEach-Object { "src/$($_.Name)" }
$requiredPaths += $srcFiles

$missing = $requiredPaths | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $projectRoot $_) -PathType Leaf)
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing required PWA files: " + ($missing -join ', '))
}

Write-Output "PWA validation passed: required app shell files exist."
