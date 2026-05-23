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
Write-Host "  API    -> http://localhost:8000/api/docs"
Write-Host "  Web    -> http://localhost:3000"
Write-Host "  Phone  -> https://desktop-jb2ntpf.tail961410.ts.net:8443"
Write-Host ""
Write-Host "Close this window (or Ctrl+C) to stop the Tailscale tunnel."
Write-Host "Close the other two windows to stop API + web."
Write-Host ""

# Tailscale Serve — HTTPS tunnel on port 8443 (Manastra uses 443).
# Next.js handles /api/* via rewrite to localhost:8000 — backend never exposed.
& "C:\Program Files\Tailscale\tailscale.exe" serve reset
& "C:\Program Files\Tailscale\tailscale.exe" serve --bg --https=8443 http://localhost:3000
& "C:\Program Files\Tailscale\tailscale.exe" serve status
Write-Host ""
Write-Host "Tunnel running in background. Close this window to keep tunnel alive."
Write-Host "To stop tunnel later: tailscale serve reset"
Read-Host "Press Enter when done"
& "C:\Program Files\Tailscale\tailscale.exe" serve reset
