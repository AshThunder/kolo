#!/usr/bin/env bash
# Start a LOCAL anvil fork of Arc mainnet (port 8599) for dry runs. Nothing here can broadcast to mainnet.
# Arc's USDC (0x3600…) is a proxy whose transfers call a native-coin precompile (0x1800…) that anvil
# cannot execute, so on the fork ONLY we swap its code for a 6-decimal ERC-20 mock (name/symbol/decimals set).
# => logic/accounting is exercised faithfully; USDC-call gas is under-counted and corrected in the report.
set -euo pipefail; export PATH=$HOME/.foundry/bin:$PATH; cd "$(dirname "$0")/.."
pkill -f "anvil.*--port 8599" 2>/dev/null || true; sleep 1
(anvil --fork-url https://rpc.mainnet.arc.io --chain-id 5042 --port 8599 --silent >/tmp/anvil.log 2>&1 &)
for i in $(seq 30); do cast chain-id --rpc-url http://127.0.0.1:8599 >/dev/null 2>&1 && break; sleep 1; done
F=http://127.0.0.1:8599; U=0x3600000000000000000000000000000000000000
RT=$(jq -r .deployedBytecode.object contracts/out/MockERC20.sol/MockERC20.json)
S=0x5553444300000000000000000000000000000000000000000000000000000008
cast rpc anvil_setCode $U "$RT" --rpc-url $F >/dev/null
cast rpc anvil_setStorageAt $U 0x0 $S --rpc-url $F >/dev/null
cast rpc anvil_setStorageAt $U 0x1 $S --rpc-url $F >/dev/null
cast rpc anvil_setStorageAt $U 0x2 0x0000000000000000000000000000000000000000000000000000000000000006 --rpc-url $F >/dev/null
echo "fork up: chain $(cast chain-id --rpc-url $F), USDC symbol $(cast call $U 'symbol()(string)' --rpc-url $F)"
