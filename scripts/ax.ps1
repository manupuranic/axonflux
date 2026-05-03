# AxonFlux dev shortcuts
# Add to PowerShell profile (run once):
#   Add-Content $PROFILE ". $($PSScriptRoot -replace '\\scripts$','')\..\axonflux\scripts\ax.ps1"
# Or simpler:
#   Add-Content $PROFILE ". D:\projects\axonflux\scripts\ax.ps1"

$_AX = (Resolve-Path "$PSScriptRoot\..")

function ax-demo-reset {
    Set-Location $_AX
    $env:PYTHONPATH = "."
    python scripts/demo_reset.py --env .env.demo --yes
}

function ax-api-demo {
    Set-Location $_AX
    $env:dbname = "axonflux_demo"
    $env:PYTHONPATH = "."
    python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
}

function ax-api-prod {
    Set-Location $_AX
    Remove-Item Env:\dbname -ErrorAction SilentlyContinue
    $env:PYTHONPATH = "."
    python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
}

function ax-web {
    Set-Location "$_AX\web"
    npm run dev
}

function ax-pipeline {
    Set-Location $_AX
    $env:PYTHONPATH = "."
    python pipelines/weekly_pipeline.py
}

function ax-help {
    Write-Host ""
    Write-Host "  ax-demo-reset   wipe + reload demo DB, run full pipeline"
    Write-Host "  ax-api-demo     start API -> axonflux_demo"
    Write-Host "  ax-api-prod     start API -> axonflux (production)"
    Write-Host "  ax-web          start Next.js frontend"
    Write-Host "  ax-pipeline     run weekly pipeline (production)"
    Write-Host ""
}
