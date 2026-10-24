/**
 * setup-kolo.ts
 *
 * Post-deploy setup script for the Kolo contract stack on Arc Testnet.
 * Must be run by the account that owns PayeeRegistry and KoloFactory
 * (i.e. the deployer wallet).
 *
 * Usage:
 *   PRIVATE_KEY=0x<deployer-key> bun scripts/setup-kolo.ts
 *
 * What it does:
 *   1. factory.setGroupPotImpl(GROUP_POT_IMPL)
 *   2. factory.setTuitionPotImpl(TUITION_POT_IMPL)
 *   3. factory.setCctpReceiver(CCTP_RECEIVER)
 *   4. registry.registerPayee(Vendor, TEST_VENDOR_WALLET, ...)  → payeeId 1
 *   5. registry.registerPayee(School, TEST_SCHOOL_WALLET, ...)  → payeeId 2
 *   6. registry.verify(schoolId, ...)
 */

import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ── Arc Testnet chain definition ──────────────────────────────────────────────

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
});

// ── Deployed addresses (from deploy_contract results) ────────────────────────

const REGISTRY        = '0xed9fc9643ec31bee53c5df9f590e8b73a931ccca';
const GROUP_POT_IMPL  = '0xf46b9899c4b1720cf841ff74641a0d252eaa6fba';
const TUITION_POT_IMPL= '0xd8cda5606d35622df7fc0ec1e438b50034102f9c';
const FACTORY         = '0x7caf3a6292e3f02dea2a4626a08d1ebe4375f7d3';
const CCTP_RECEIVER   = '0x0717df7f137102d2ac82e3f83ded68735b870e80';

// TEST payee wallets (placeholder — replace with real institution wallets for production)
const TEST_VENDOR_WALLET = '0x1111111111111111111111111111111111111111' as `0x${string}`;
const TEST_SCHOOL_WALLET = '0x2222222222222222222222222222222222222222' as `0x${string}`;

// ── Minimal ABIs ─────────────────────────────────────────────────────────────

const FACTORY_ABI = [
  { name: 'setGroupPotImpl',   type: 'function', inputs: [{ name: 'impl',     type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'setTuitionPotImpl', type: 'function', inputs: [{ name: 'impl',     type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'setCctpReceiver',   type: 'function', inputs: [{ name: 'receiver', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { name: 'groupPotImpl',      type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'tuitionPotImpl',    type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'cctpReceiver',      type: 'function', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

const REGISTRY_ABI = [
  {
    name: 'registerPayee',
    type: 'function',
    inputs: [
      { name: 'kind',     type: 'uint8'   },
      { name: 'wallet',   type: 'address' },
      { name: 'nameHash', type: 'bytes32' },
      { name: 'docHash',  type: 'bytes32' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'verify',
    type: 'function',
    inputs: [
      { name: 'id',      type: 'uint256' },
      { name: 'docHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { name: 'payeeCount', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────


async function main() {
  const rawKey = process.env.PRIVATE_KEY;
  if (!rawKey) {
    console.error('ERROR: PRIVATE_KEY env var not set');
    console.error('  Usage: PRIVATE_KEY=0x<key> bun scripts/setup-kolo.ts');
    process.exit(1);
  }

  const account = privateKeyToAccount(rawKey as `0x${string}`);
  console.log('Deployer:', account.address);

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });

  async function send(to: `0x${string}`, abi: readonly object[], functionName: string, args: unknown[]) {
    console.log(`  → ${functionName}(${args.join(', ')})`);
    const hash = await walletClient.writeContract({ address: to, abi: abi as never, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`    tx: ${hash}  (block ${receipt.blockNumber}, status: ${receipt.status})`);
    if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
    return hash;
  }

  const { keccak256, toBytes } = await import('viem');
  const name = (s: string) => keccak256(toBytes(s));

  // ── 1-3: Configure factory ─────────────────────────────────────────────────
  console.log('\n── Configure KoloFactory ──');

  const txSetGroup = await send(FACTORY, FACTORY_ABI, 'setGroupPotImpl', [GROUP_POT_IMPL]);
  const txSetTuition = await send(FACTORY, FACTORY_ABI, 'setTuitionPotImpl', [TUITION_POT_IMPL]);
  const txSetCctp = await send(FACTORY, FACTORY_ABI, 'setCctpReceiver', [CCTP_RECEIVER]);

  // Verify
  const groupImpl   = await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'groupPotImpl' });
  const tuitionImpl = await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'tuitionPotImpl' });
  const cctpRec     = await publicClient.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'cctpReceiver' });
  console.log('  groupPotImpl   :', groupImpl);
  console.log('  tuitionPotImpl :', tuitionImpl);
  console.log('  cctpReceiver   :', cctpRec);

  // ── 4: Register TEST Venue Vendor (Kind=1=Vendor) ──────────────────────────
  console.log('\n── Register TEST Venue Vendor (payeeId 1) ──');
  // Kind enum: School=0, Vendor=1, Hospital=2
  const txVendorReg = await send(REGISTRY, REGISTRY_ABI, 'registerPayee', [
    1,                                            // Kind.Vendor
    TEST_VENDOR_WALLET,
    name('TEST Venue Vendor ABC'),
    name('TEST_VENDOR_REGISTRATION_DOC_001'),
  ]);
  console.log('  Status: Registered (not verified)');

  // ── 5-6: Register + verify TEST School (Kind=0=School) ────────────────────
  console.log('\n── Register + Verify TEST Sunrise Academy (payeeId 2) ──');
  const txSchoolReg = await send(REGISTRY, REGISTRY_ABI, 'registerPayee', [
    0,                                            // Kind.School
    TEST_SCHOOL_WALLET,
    name('TEST Sunrise Academy'),
    name('TEST_SCHOOL_KYC_DOC_002'),
  ]);

  const schoolId = 2n; // 1-based; vendor=1, school=2
  const txVerify = await send(REGISTRY, REGISTRY_ABI, 'verify', [
    schoolId,
    name('TEST_SCHOOL_KYC_DOC_002'),
  ]);
  console.log('  Status: Verified');

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=== Setup complete ===');
  console.log('factory.setGroupPotImpl  tx:', txSetGroup);
  console.log('factory.setTuitionPotImpl tx:', txSetTuition);
  console.log('factory.setCctpReceiver  tx:', txSetCctp);
  console.log('registry.registerPayee (vendor) tx:', txVendorReg);
  console.log('registry.registerPayee (school) tx:', txSchoolReg);
  console.log('registry.verify (school)        tx:', txVerify);
  console.log('\nTEST payee wallets (replace with real institution wallets for production):');
  console.log('  Vendor (payeeId=1):', TEST_VENDOR_WALLET);
  console.log('  School (payeeId=2):', TEST_SCHOOL_WALLET);
}

main().catch((e) => {
  console.error('Setup failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
