$root = $PSScriptRoot

Write-Host "Starting AxonFlux dev..."

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root'; `$env:PYTHONPATH = '.'; python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000"
) -WindowStyle Normal

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root\web'; npm run dev"
) -WindowStyle Normal

Write-Host ""
Write-Host "  API  -> http://localhost:8000/api/docs"
Write-Host "  Web  -> http://localhost:3000"
Write-Host ""
Write-Host "Close the two terminal windows to stop."
