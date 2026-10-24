// Sweeps native USDC from kolo mainnet wallets to a single destination. Keys loaded in-process only; never logged.
import fs from "fs"; import os from "os";
import { createPublicClient, createWalletClient, http, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const DEST = "0x6956f5a0D5cd136BDBf2C7FF9bAf0bE3a220190B";
const EXEC = process.argv[2] === "--execute";
const chain = defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } } });
const pub = createPublicClient({ chain, transport: http() });
const parse = f => Object.fromEntries(fs.readFileSync(os.homedir() + "/.kolo/" + f, "utf8").split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const d = parse("mainnet-deployer.env"), k = parse("mainnet-keeper.env"), w = parse("mainnet-demo-wallets.env");
const list = [["keeper", k.KOLO_KEEPER_PK], ["demo-school", w.DEMO_SCHOOL_PK], ["demo-vendor", w.DEMO_VENDOR_PK], ["demo-organizer", w.DEMO_ORG_PK], ["demo-cosigner1", w.DEMO_COSIGNER1_PK], ["demo-cosigner2", w.DEMO_COSIGNER2_PK], ["deployer", d.KOLO_MAINNET_DEPLOYER_PK]];
const gp = await pub.getGasPrice(); const block = await pub.getBlock();
console.log("chain", await pub.getChainId(), "gasPrice gwei", Number(gp) / 1e9, "baseFee", block.baseFeePerGas);
const maxFee = gp * 2n; // cap; actual charge is effective price
const gasLimit = 21000n;
let total = 0n;
for (const [name, pk] of list) {
  const acct = privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk);
  const bal = await pub.getBalance({ address: acct.address });
  const est = await pub.estimateGas({ account: acct.address, to: DEST, value: 1n }).catch(() => gasLimit);
  const gas = est > gasLimit ? est : gasLimit;
  // Reserve gas at maxFee (2x) so the tx is always valid; unspent reserve stays as dust.
  const reserve = gas * maxFee;
  console.log(name, acct.address, "balance", formatEther(bal), "gas", gas.toString(), "reserve", formatEther(reserve));
  if (bal <= reserve) { console.log("  skip (below gas cost)"); continue; }
  const value = bal - reserve;
  if (!EXEC) { console.log("  would send", formatEther(value)); continue; }
  const wc = createWalletClient({ account: acct, chain, transport: http() });
  const hash = await wc.sendTransaction({ to: DEST, value, gas, maxFeePerGas: maxFee, maxPriorityFeePerGas: 0n });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log("  tx", hash, "status", r.status, "sent", formatEther(value));
  if (r.status === "success") total += value;
}
console.log("total sent", formatEther(total));
for (const [name, pk] of list) { const a = privateKeyToAccount(pk.startsWith("0x") ? pk : "0x" + pk); console.log("final", name, a.address, formatEther(await pub.getBalance({ address: a.address }))); }
console.log("dest balance", formatEther(await pub.getBalance({ address: DEST })));
