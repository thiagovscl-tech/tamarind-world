param(
  [int]$Rounds = 3,
  [string]$BaseUrl = 'https://www.tamarindstudio.com.br'
)

$assets = @(
  'ilha_texturizada.glb',
  'observatorioTec_Texturizado.glb',
  'arquiteturaColiseu_texturizado.glb',
  'basilica_texturizada.glb',
  'arvore.glb',
  'templo.glb',
  'casasite.glb',
  'casteloSite.glb',
  'bode_rigged.glb'
)

$results = @()
for ($round = 1; $round -le $Rounds; $round += 1) {
  foreach ($asset in $assets) {
    $url = "$BaseUrl/artwork/models/$asset"
    $line = & curl.exe -sS -L -H 'Cache-Control: no-cache' -o NUL `
      -w '%{url_effective}|%{http_code}|%{num_redirects}|%{time_starttransfer}|%{time_total}|%{size_download}|%{content_type}' `
      $url
    $parts = $line -split '\|'
    $entry = [pscustomobject]@{
      round = $round
      asset = $asset
      url = $parts[0]
      status = [int]$parts[1]
      redirects = [int]$parts[2]
      ttfbMs = [math]::Round([double]::Parse($parts[3], [Globalization.CultureInfo]::InvariantCulture) * 1000)
      downloadMs = [math]::Round(([double]::Parse($parts[4], [Globalization.CultureInfo]::InvariantCulture) - [double]::Parse($parts[3], [Globalization.CultureInfo]::InvariantCulture)) * 1000)
      totalMs = [math]::Round([double]::Parse($parts[4], [Globalization.CultureInfo]::InvariantCulture) * 1000)
      bytes = [long]$parts[5]
      contentType = $parts[6]
    }
    $results += $entry
    Write-Host ("Round {0}: {1} - {2} ms ({3:N2} MB)" -f $round, $asset, $entry.totalMs, ($entry.bytes / 1MB))
  }
}

$outputPath = Join-Path $PSScriptRoot '../reports/production-network-rounds.json'
$results | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 $outputPath
$results | Format-Table round, asset, status, redirects, ttfbMs, downloadMs, totalMs, @{n='MB';e={[math]::Round($_.bytes / 1MB, 2)}} -AutoSize
