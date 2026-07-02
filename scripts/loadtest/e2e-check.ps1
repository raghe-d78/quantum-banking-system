$base="http://localhost:3000"
$adm=(irm "$base/auth/staff/login" -Method Post -ContentType "application/json" -Body '{"username":"adminn","password":"admin123"}').token
$h=@{Authorization="Bearer $adm"}
$uname="aud_$(Get-Random)"
$u=irm "$base/admin/users" -Method Post -ContentType "application/json" -Headers $h -Body (@{username=$uname;password="pw12345";email="$uname@x.com";name="Audit Test";role="customer"}|ConvertTo-Json)
$uid=$u.user.id
"uid=$uid"
$body='{"userId":"'+$uid+'","currency":"TND"}'
$created = docker exec infrastructure-api-gateway-1 wget -qO- --post-data=$body --header="Content-Type: application/json" --header="Authorization: Bearer $adm" http://account-service:3000/accounts/create 2>&1
"created: $created"
$accId=($created | ConvertFrom-Json).account.id
"accId=$accId"
foreach($i in 1..5){
  try{
    irm "$base/admin/deposit" -Method Post -ContentType "application/json" -Headers $h -Body (@{accountId=$accId;amount=10}|ConvertTo-Json) | Out-Null
    "ok ${i}"
  }catch{
    $msg = $_.ErrorDetails.Message
    "err ${i}: ${msg}"
  }
}
Start-Sleep 6
"--- outbox ---"
docker exec cockroachdb /cockroach/cockroach sql --insecure --database=ledger_db --execute="SELECT status, COUNT(*) FROM event_outbox GROUP BY status;"
"--- audit_logs ---"
docker exec cockroachdb /cockroach/cockroach sql --insecure --database=audit_db --execute="SELECT event_type, COUNT(*) FROM audit_logs GROUP BY event_type;"
"--- /audit/stats ---"
irm "http://localhost:3004/audit/stats" | ConvertTo-Json -Compress
"--- account-service relay tail ---"
docker logs infrastructure-account-service-1 --tail 50 2>&1 | Select-Object -Last 25
