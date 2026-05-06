#!/bin/bash
BASE="https://easyfinder.fly.dev"
FRONT="https://easy-equip-finder-trmx-mvp-web.vercel.app"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZjY2NzU0YjViZDRkNTA0YzEzODkwOSIsImVtYWlsIjoiYW5keWdkejkzQGdtYWlsLmNvbSIsInJvbGUiOiJidXllciIsIm5hbWUiOiJBbmR5IiwiaWF0IjoxNzc3Nzk0Nzk5fQ.q-PDGBg4Ytxg s1hqjMbdUHP_1y8rUHvtwGl7_FzphL4"

echo "=== EasyFinder Smoke Test ==="
curl -s -o /dev/null -w "Frontend:     %{http_code}\n" $FRONT
curl -s -o /dev/null -w "API Health:   %{http_code}\n" $BASE/health
curl -s -o /dev/null -w "Listings:     %{http_code}\n" $BASE/api/listings -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "Me:           %{http_code}\n" $BASE/api/me -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "Watchlist:    %{http_code}\n" $BASE/api/watchlist -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "Offers:       %{http_code}\n" $BASE/api/offers -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "Inquiries:    %{http_code}\n" $BASE/api/inquiries -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "Billing:      %{http_code}\n" -X POST $BASE/api/billing/create-checkout-session -H "Authorization: Bearer $TOKEN"
echo "=== Done ==="
