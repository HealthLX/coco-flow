# Starts the coco-canonical FastAPI backend with output dirs pointed at coco-flow/data/
# so generated XML files never land inside the coco-canonical repo.
#
# Usage (from the coco-flow directory):
#   npm run api
#   -- or --
#   powershell -ExecutionPolicy Bypass -File start-api.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

$env:COCO_CANONICAL_SAMPLES_DIR = "$scriptDir\data\canonical-samples"
$env:COCO_FHIR_SAMPLES_DIR      = "$scriptDir\data\fhir-samples"

$apiDir = "$scriptDir\..\coco-canonical"

if (-not (Test-Path $apiDir)) {
    Write-Error "coco-canonical not found at: $apiDir`nClone it next to coco-flow."
    exit 1
}

Write-Host "Canonical samples -> $env:COCO_CANONICAL_SAMPLES_DIR"
Write-Host "FHIR samples      -> $env:COCO_FHIR_SAMPLES_DIR"
Write-Host ""

Set-Location $apiDir
& ".\venv\Scripts\uvicorn" api.main:app --reload
