#!/data/data/com.termux/files/usr/bin/bash

echo "===== SYSTEM INFO ====="
date
node -v
pnpm -v
uname -a

echo "\n===== PROJECT ROOT ====="
pwd
ls -la

echo "\n===== PACKAGE.JSON (ROOT) ====="
cat package.json

echo "\n===== API PACKAGE.JSON ====="
cat apps/api/package.json

echo "\n===== SHARED PACKAGE.JSON ====="
cat packages/shared/package.json

echo "\n===== DEAL ENGINE ====="
cat apps/api/src/lib/dealEngine.ts

echo "\n===== SCORING ENGINE ====="
cat packages/shared/src/scoring.ts

echo "\n===== API ROUTE ====="
cat apps/api/src/routes/deal.ts

echo "\n===== HMAC VERIFY ====="
cat apps/api/src/lib/verifyHmac.ts

echo "\n===== AUTH ROUTES ====="
cat apps/api/src/routes/auth.ts

echo "\n===== DB CONFIG ====="
cat apps/api/src/db.ts

echo "\n===== ENV (SANITIZED) ====="
cat apps/api/.env | sed 's/=.*/=***HIDDEN***/g'

echo "\n===== TEST FILES ====="
ls packages/shared/src/*.test.ts 2>/dev/null

echo "\n===== SAMPLE TEST CONTENT ====="
cat packages/shared/src/*.test.ts 2>/dev/null

echo "\n===== RUN TESTS ====="
pnpm --filter @easyfinderai/shared test

echo "\n===== DB TABLES ====="
psql -U postgres -d easyfinder -c "\dt" 2>/dev/null

echo "\n===== SAMPLE API RESPONSE ====="
curl -s -X POST http://localhost:8080/api/deal/evaluate \
-H "Content-Type: application/json" \
-d '{
  "listing_id": "demo-bd-001",
  "asking_price": 142000,
  "category": "bulldozer",
  "hours": 2100,
  "condition": "good",
  "operable": true,
  "distance_miles": 150,
  "market_p50": 155000,
  "market_p90": 200000,
  "is_auction": false
}'

echo "\n===== DONE ====="
