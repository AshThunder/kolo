# Kolo

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app.

---

## What This App Does

**Kolo** — group money that can only go where it was promised. GroupPot for gifts/events/trips (milestones, co-signer approvals, disputes, pro-rata refunds); TuitionPot for school fees paid per term to a verified school. EIP-1167 clones deployed by KoloFactory; payees verified in PayeeRegistry; CCTP pay-ins via KoloCctpReceiver / sweepers. Live on **Arc mainnet (chain 5042)**; Arc Testnet (5042002) is still selectable for development.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, wagmi v2, viem v2, ConnectKit (+ optional Circle Modular Wallets passkeys via `VITE_CIRCLE_CLIENT_KEY`)
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/kolo/`, tests in `contracts/test/kolo/`.
- Server: Bun + Hono + viem (`server/`) — indexer, ledger/CSV, stats, FX proxy, title metadata, keeper (pulls, terms, sweeper)
- Chain: **Arc mainnet (Chain ID 5042) is the default.** Arc Testnet (5042002) is selected with `VITE_KOLO_NETWORK=testnet` (web) or `KOLO_NETWORK=testnet` (server). `src/network.ts` (`NET`) is the single source of truth for chain, RPC, explorer, CCTP and Circle settings; addresses are in `src/addresses.ts`.
- USDC `0x3600000000000000000000000000000000000000` (6 decimals as an ERC-20; native gas is 18-decimal USDC, never mix the two)
- Explorer: https://explorer.arc.io (mainnet). CCTP V2 domain 26; pay-in source chain is Base (8453).

## Deployed Contracts

### Arc mainnet (chain 5042): production

Deployed 23 Oct 2026 from `contracts/kolo/` with `scripts/deploy-mainnet.sh`. Full record in `../notes/mainnet-deployment.json` (outside the repo). Foundry suite 94/94, internal security review (6 High fixed).

| Contract | Address | Explorer |
|---|---|---|
| PayeeRegistry | `0xd90008F52a37cA35b92Aa7bF39BF853cE2ff8F20` | https://explorer.arc.io/address/0xd90008F52a37cA35b92Aa7bF39BF853cE2ff8F20 |
| KoloGroupPot (impl) | `0x460C09572f4cE0FeF37E74A8dAE7C3b7A36A9E0f` | https://explorer.arc.io/address/0x460C09572f4cE0FeF37E74A8dAE7C3b7A36A9E0f |
| KoloTuitionPot (impl) | `0x597Cd6181046B25895dBe6D4ba9143136eAe8C50` | https://explorer.arc.io/address/0x597Cd6181046B25895dBe6D4ba9143136eAe8C50 |
| KoloFactory | `0xf9ab7f396d00955CB96Ef48fd98fA72f44bc262d` | https://explorer.arc.io/address/0xf9ab7f396d00955CB96Ef48fd98fA72f44bc262d |
| KoloCctpReceiver | `0x6b937828cE1005Dac2C459A253a46b1152236021` | https://explorer.arc.io/address/0x6b937828cE1005Dac2C459A253a46b1152236021 |
| KoloSweeperFactory | `0xfa1ac8b10cAdD65Bf6d839e9C4CE825f2d9e6FFb` | https://explorer.arc.io/address/0xfa1ac8b10cAdD65Bf6d839e9C4CE825f2d9e6FFb |

- Owner, fee treasury and registrar: `0x6449986070E1Ae8A1619BEd166d960843DaBcB2b`. Keeper (separate hot wallet): `0x757c8708A2FE522B48fBBd5DF7BC63b29748aCc6`. Factory fee 0 bps (cap 100 bps).
- CCTP V2 on Arc mainnet: domain 26, TokenMessengerV2 `0x28b5…cf5d`, MessageTransmitterV2 `0x81D4…4B64` (full addresses in `src/network.ts`).
- Payees in the registry: #1 Kolo Demo Academy (School, `0xA764e0133Bc228ac40FCd5D3314fFB1b8bAe1B6e`, Verified); #2 Kolo Demo Venue (Vendor, `0x925E63f23fC94F46f15De453A6c12A20BdDCfF3C`, Registered, not verified).
- Demo pots: #1 `0xd982…2c41` (completed), #2 `0xd6AC…e3f9` (active), #3 `0x1C88…717C` (tuition). Live at https://kolo-arc.vercel.app/p/1, /p/2, /p/3.
- Source is not yet verified on the explorer; Standard-JSON inputs are prepared in `../notes/verify/`.
- Hosting: web on Vercel project `kolo-arc` (https://kolo-arc.vercel.app); API on Fly app `kolo-arc-api` (`/api/kolo`).

### Arc Testnet (chain 5042002): development only

Self-deployed set used for development and E2E. Not used by the production app.

| Contract | Address |
|---|---|
| PayeeRegistry | `0xb6F13A2f400A7D870d023c1f9F751EF8f4b15dB7` |
| KoloGroupPot (impl) | `0xBdE7153E7689119C9DcB4176b2fb4926E54C2E22` |
| KoloTuitionPot (impl) | `0x27F4ae2dAc8c7b6A5081fF4478EcEeE70889fd5A` |
| KoloFactory | `0x019b846b47a09380CD444ECBA328Bbc54DC33E46` |
| KoloCctpReceiver | `0x7E9B1CA6C553E80811D8525c05C10A02833895a2` (v2, hookData offset 376; the earlier `0x8d55…40D3` mis-decoded real CCTP V2 messages, see `../notes/E2E_CHAIN.md`) |
| KoloSweeperFactory | `0x6B9a0b6Bd53800faEAb8ebaD1c6C0c01cc4809BC` |

Testnet explorer: https://explorer.testnet.arc.io. Test payees: #1 TEST Venue Vendor (Registered), #2 TEST Sunrise Academy (Verified).

> Note: Arc Studio also deployed a separate set (`0xed9f…ccca`, `0x7caf…` etc.) during an earlier session. Those are Studio-platform-owned; ignore them.

## Key Files

- `src/App.tsx` — routes; `src/pages/kolo/` — pages; `src/hooks/` — chain + server hooks; `src/config.ts` — wagmi config
- `contracts/kolo/` — Kolo contracts; `contracts/test/kolo/` — unit, fuzz and invariant tests
- `server/src/` — API (`app.ts`), indexer, keeper, FX, meta; tests in `server/src/__tests__`
- `qa/` — Playwright screenshots + E2E (injected test wallet)
- `docs/kolo-security-review.md` — security review

## Dev Commands

```bash
bun install
bun run dev                 # Vite frontend
bun run server:dev          # Kolo API + keeper (reads server/server.env, gitignored)
bun run server:test         # server unit tests
bun run contracts:test      # forge test
scripts/check-invariant-coverage.sh   # invariant campaign + release/refund coverage gate
```
