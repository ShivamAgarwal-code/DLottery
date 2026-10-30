#!/bin/sh
# Start a local Hardhat node, wait until it answers, then deploy the contracts.
set -e

echo "starting hardhat node..."
npx hardhat node --hostname 0.0.0.0 > /tmp/node.log 2>&1 &

echo "waiting for RPC to be ready..."
for i in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})}).then(r=>r.json()).then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "RPC is up"
    break
  fi
  sleep 1
done

echo "deploying USD8 + DLottery..."
npx hardhat run scripts/deploy.ts --network localhost

echo "deployment complete; streaming node logs"
tail -f /tmp/node.log
