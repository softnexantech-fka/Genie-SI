# Test script pour l'API backend
$body = @{username="admin"; password="admin1234567"; email="admin@genie.local"} | ConvertTo-Json
$resp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/register" -Method POST -ContentType "application/json" -Body $body -ErrorAction SilentlyContinue
Write-Host "REGISTER Response:"
$resp.Content | ConvertFrom-Json | ConvertTo-Json
$token = ($resp.Content | ConvertFrom-Json).token

if ($token) {
  Write-Host "`n✅ Admin créé avec token: $($token.Substring(0,20))..."
  
  # Test login
  Write-Host "`n✅ Test login..."
  $login = @{username="admin"; password="admin1234567"} | ConvertTo-Json
  $resp2 = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body $login -ErrorAction SilentlyContinue
  Write-Host "LOGIN Response:"
  $resp2.Content
  
  # Test data access with token
  Write-Host "`n✅ Test /api/data/gc-session-logs avec header Authorization..."
  $token2 = ($resp2.Content | ConvertFrom-Json).token
  $headers = @{"Authorization" = "Bearer $token2"}
  $resp3 = Invoke-WebRequest -Uri "http://localhost:3001/api/data/gc-session-logs" -Method GET -Headers $headers -ErrorAction SilentlyContinue
  Write-Host "DATA ACCESS Response status: $($resp3.StatusCode)"
  $resp3.Content | ConvertFrom-Json | ConvertTo-Json -Depth 2
}
