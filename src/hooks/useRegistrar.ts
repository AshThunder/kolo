import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { keccak256, toBytes, type Hex } from 'viem'
import { useState } from 'react'
import { toast } from 'sonner'
import { PAYEE_REGISTRY_ABI } from '../abi/PayeeRegistry'
import { KOLO_ADDRESSES } from '../config'
import { ARC_CHAIN_ID } from '../addresses'
import { koloPublicClient, useRefreshRegistry } from './usePayeeRegistry'
import { api } from '../lib/api'
import { txError } from '../lib/txError'

const registry = KOLO_ADDRESSES.payeeRegistry
const REGISTRAR_ROLE = keccak256(toBytes('REGISTRAR_ROLE'))
const ZERO32 = ('0x' + '0'.repeat(64)) as Hex

/** Does the connected wallet hold REGISTRAR_ROLE on the PayeeRegistry? Public read; only the registrar's wallet can ever succeed in the write. */
export function useIsRegistrar() {
  const { address } = useAccount()
  const { data, isLoading } = useReadContract({ address: registry, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'hasRole', args: [REGISTRAR_ROLE, address ?? '0x0000000000000000000000000000000000000000'], query: { enabled: !!address } })
  return { address, isRegistrar: !!data, isLoading: !!address && isLoading }
}

export type RegistrarAction =
  | { kind: 'register'; payeeKind: 0 | 1 | 2; wallet: `0x${string}`; name: string; regNo?: string }
  | { kind: 'verify'; id: number; docRef?: string }
  | { kind: 'revoke'; id: number }
  | { kind: 'executeWalletChange'; id: number }

/** One on-chain registrar transaction at a time: wallet confirmation, wait for the receipt, refresh the registry, publish the name for new payees. */
export function useRegistrarTx() {
  const { writeContractAsync } = useWriteContract()
  const refresh = useRefreshRegistry()
  const [busy, setBusy] = useState<string | undefined>()
  async function run(a: RegistrarAction): Promise<boolean> {
    const key = a.kind + ':' + ('id' in a ? a.id : a.wallet)
    setBusy(key)
    const base = { address: registry, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID } as const
    try {
      let hash: Hex
      if (a.kind === 'register') hash = await writeContractAsync({ ...base, functionName: 'registerPayee', args: [a.payeeKind, a.wallet, keccak256(toBytes(a.name.trim())), a.regNo ? keccak256(toBytes(a.regNo.trim())) : ZERO32] })
      else if (a.kind === 'verify') hash = await writeContractAsync({ ...base, functionName: 'verify', args: [BigInt(a.id), a.docRef ? keccak256(toBytes(a.docRef.trim())) : ZERO32] })
      else if (a.kind === 'revoke') hash = await writeContractAsync({ ...base, functionName: 'revoke', args: [BigInt(a.id)] })
      else hash = await writeContractAsync({ ...base, functionName: 'executeWalletChange', args: [BigInt(a.id)] })
      toast.loading('Waiting for Arc to confirm…', { id: key })
      const rc = await koloPublicClient.waitForTransactionReceipt({ hash })
      if (rc.status !== 'success') throw new Error('Transaction reverted')
      if (a.kind === 'register') await api('/payees/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: a.name.trim() }) }).catch(() => undefined)
      await refresh()
      toast.success({ register: 'Payee registered', verify: 'Payee verified', revoke: 'Payee revoked', executeWalletChange: 'Wallet change applied' }[a.kind], { id: key })
      return true
    } catch (e) { toast.error(txError(e), { id: key }); return false } finally { setBusy(undefined) }
  }
  return { run, busy }
}
