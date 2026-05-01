$base="http://localhost:3000"
$adm=(irm "$base/auth/staff/login" -Method Post -ContentType "application/json" -Body '{"username":"adminn","password":"admin123"}').token
$h=@{Authorization="Bearer $adm"}

# Create a fresh user + lookup their account
$uname="cache_$(Get-Random)"
$u=irm "$base/admin/users" -Method Post -ContentType "application/json" -Headers $h -Body (@{username=$uname;password="pw12345";email="$uname@x.com";name="CacheTest";role="customer"}|ConvertTo-Json)
$uid=$u.user.id
$accId=(irm "$base/admin/accounts/$uid" -Headers $h).accountId
"uid=$uid acct=$accId"

# Customer login to test /balance (which is the customer endpoint)
$cust=(irm "$base/auth/customer/login" -Method Post -ContentType "application/json" -Body (@{username=$uname;password="pw12345"}|ConvertTo-Json)).token
$ch=@{Authorization="Bearer $cust"}

"--- balance MISS (cold) ---"
docker exec infrastructure-redis-1 redis-cli DEL "balance:user:$uid" | Out-Null
$b1=irm "$base/balance" -Headers $ch
"  bal=$($b1.balance)"
"  redis key after fetch: " + (docker exec infrastructure-redis-1 redis-cli GET "balance:user:$uid")

"--- balance HIT (warm) ---"
$b2=irm "$base/balance" -Headers $ch
"  bal=$($b2.balance)"

"--- deposit -> invalidation ---"
irm "$base/admin/deposit" -Method Post -ContentType "application/json" -Headers $h -Body (@{accountId=$accId;amount=42}|ConvertTo-Json) | Out-Null
Start-Sleep 1
"  redis key after deposit: " + (docker exec infrastructure-redis-1 redis-cli GET "balance:user:$uid")
$b3=irm "$base/balance" -Headers $ch
"  bal after deposit=$($b3.balance) (expected 42)"
"  redis key now: " + (docker exec infrastructure-redis-1 redis-cli GET "balance:user:$uid")

"--- rate-limit Redis sharing ---"
docker exec infrastructure-redis-1 redis-cli KEYS "rl:auth:*" | Select-Object -First 5
# Fire 5 bad logins, check Redis key increments
1..5 | %{ try{ irm "$base/auth/staff/login" -Method Post -ContentType "application/json" -Body '{"username":"adminn","password":"WRONG"}' | Out-Null }catch{} }
"  rl keys after 5 bad logins:"
docker exec infrastructure-redis-1 redis-cli KEYS "rl:auth:*"
docker exec infrastructure-redis-1 redis-cli KEYS "rl:auth:*" | %{ "    " + $_ + " = " + (docker exec infrastructure-redis-1 redis-cli GET $_) }
