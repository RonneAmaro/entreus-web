param(
  [int]$MaxRounds = 10
)

$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3000"
$migrateUrl = "$baseUrl/api/r2/migrate-post-media-batch?limit=5"
$diagnoseUrl = "$baseUrl/api/r2/diagnose-supabase-media"

Write-Host "EntreUS R2 post media migration helper"
Write-Host "Make sure the local server is running at $baseUrl before continuing."
Write-Host "This script calls the local API only. It runs up to $MaxRounds controlled rounds."
Write-Host ""

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Uri
  )

  try {
    return Invoke-RestMethod -Method $Method -Uri $Uri
  } catch {
    $message = $_.Exception.Message
    throw "Request failed: $Method $Uri. $message"
  }
}

function Get-RemainingPostMediaCount {
  param(
    [Parameter(Mandatory = $true)]
    $Diagnosis
  )

  return [int]$Diagnosis.postsImageCount + [int]$Diagnosis.postsVideoCount
}

try {
  $initialDiagnosis = Invoke-JsonRequest -Method "GET" -Uri $diagnoseUrl

  if (-not $initialDiagnosis.ok) {
    throw "Initial diagnosis failed: $($initialDiagnosis.message)"
  }

  $initialRemaining = Get-RemainingPostMediaCount -Diagnosis $initialDiagnosis
  Write-Host "Initial remaining post media on Supabase Storage: $initialRemaining"
  Write-Host "posts.image_url: $($initialDiagnosis.postsImageCount)"
  Write-Host "posts.video_url: $($initialDiagnosis.postsVideoCount)"
  Write-Host ""

  if ($initialRemaining -eq 0) {
    Write-Host "Nothing to migrate for posts.image_url or posts.video_url."
    exit 0
  }

  for ($round = 1; $round -le $MaxRounds; $round++) {
    Write-Host "Round $round of $MaxRounds"

    $migration = Invoke-JsonRequest -Method "POST" -Uri $migrateUrl

    if (-not $migration.ok -and $migration.processed -eq 0) {
      throw "Migration stopped by grave error: $($migration.message)"
    }

    $diagnosis = Invoke-JsonRequest -Method "GET" -Uri $diagnoseUrl

    if (-not $diagnosis.ok) {
      throw "Diagnosis failed after round ${round}: $($diagnosis.message)"
    }

    $remaining = Get-RemainingPostMediaCount -Diagnosis $diagnosis

    Write-Host "Migrated: $($migration.migrated)"
    Write-Host "Failed: $($migration.failed)"
    Write-Host "Remaining post media on Supabase Storage: $remaining"
    Write-Host "posts.image_url: $($diagnosis.postsImageCount)"
    Write-Host "posts.video_url: $($diagnosis.postsVideoCount)"
    Write-Host ""

    if ($migration.failed -gt 0) {
      Write-Host "Some items failed in this round. Check the API response details by calling the migration route manually."
    }

    if ($remaining -eq 0) {
      Write-Host "Done. No remaining posts.image_url or posts.video_url entries using Supabase Storage."
      exit 0
    }
  }

  Write-Host "Stopped after $MaxRounds rounds. Run the script again if you want another controlled batch window."
} catch {
  Write-Error $_
  exit 1
}
