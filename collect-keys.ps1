$keyFile = "C:\Users\Administrator\BigDogsFX\cloud-keys.json"

Write-Host "=== KEY COLLECTOR ==="
Write-Host ""
Write-Host "Step 1: Go to https://cloud.mongodb.com -> Organization -> Access Manager -> API Keys"
Write-Host "         Create key with Organization Owner + Project Owner permissions"
Write-Host ""
Write-Host "Copy your Atlas PUBLIC KEY to clipboard, then press Ctrl+C here"
pause
$pubKey = Get-Clipboard
Write-Host "Got Public Key: $pubKey"
Write-Host ""

Write-Host "Step 2: Copy your Atlas PRIVATE KEY to clipboard, then press Ctrl+C here"
pause
$privKey = Get-Clipboard
Write-Host "Got Private Key: $privKey"
Write-Host ""

Write-Host "Step 3: Go to https://dashboard.render.com -> Account Settings -> API Keys"
Write-Host "         Create a new API key and copy it"
Write-Host ""
Write-Host "Copy your Render API KEY to clipboard, then press Ctrl+C here"
pause
$renderKey = Get-Clipboard
Write-Host "Got Render Key: $renderKey"
Write-Host ""

$keys = @{
    atlasPublicKey = $pubKey
    atlasPrivateKey = $privKey
    renderApiKey = $renderKey
} | ConvertTo-Json

Set-Content -Path $keyFile -Value $keys
Write-Host "Keys saved to cloud-keys.json"
