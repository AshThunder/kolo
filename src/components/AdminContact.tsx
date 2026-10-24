import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../design/Button'

export const ADMIN_TELEGRAM = { handle: '@chrisgolde', url: 'https://t.me/chrisgolde' }

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

/** One quiet line: used on the apply page and the payee directory. */
export function AdminContactLine({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[13px] text-ink-3 ${className}`}>
      Need faster verification? Contact the admin on Telegram:{' '}
      <a href={ADMIN_TELEGRAM.url} {...ext} className="text-ink underline underline-offset-2 whitespace-nowrap" data-testid="admin-telegram-link">{ADMIN_TELEGRAM.handle}</a>
    </p>
  )
}

/** The prominent version, shown once an application has gone through. Telegram links cannot be pre-filled,
 *  so the reference and a ready-to-paste message sit next to the button. */
export function AdminContactCard({ reference, orgName }: { reference: string; orgName: string }) {
  const [done, setDone] = useState<'ref' | 'msg' | null>(null)
  const message = `Hi, I applied to the Kolo payee registry as "${orgName}". Reference ${reference}.`
  const copy = (text: string, what: 'ref' | 'msg') => {
    void navigator.clipboard.writeText(text).then(() => { setDone(what); toast.success(what === 'ref' ? 'Reference copied' : 'Message copied'); setTimeout(() => setDone(null), 2000) }, () => toast.error('Could not copy. Select the text instead.'))
  }
  return (
    <div className="border border-line rounded-[16px] bg-surface p-5 text-left" data-testid="admin-contact-card">
      <h3 className="font-display text-[20px] font-medium mb-1">For faster verification, message the admin on Telegram</h3>
      <p className="text-[14px] text-ink-2 mb-4">Send your reference and organisation name to <b className="font-semibold text-ink">{ADMIN_TELEGRAM.handle}</b> so the registrar can find your application straight away.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px] mb-4">
        <dt className="text-ink-3">Reference</dt>
        <dd className="flex items-center gap-2 min-w-0">
          <code className="font-mono text-[14px] bg-paper border border-line rounded-[8px] px-2 py-0.5" data-testid="application-reference">{reference}</code>
          <button type="button" onClick={() => copy(reference, 'ref')} aria-label="Copy reference" className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] border border-line text-ink-2 hover:text-ink cursor-pointer">
            {done === 'ref' ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </dd>
        <dt className="text-ink-3">Organisation</dt>
        <dd className="break-words min-w-0">{orgName}</dd>
      </dl>
      <div className="flex flex-col sm:flex-row gap-2">
        <a href={ADMIN_TELEGRAM.url} {...ext} className="sm:flex-1" data-testid="admin-telegram-cta">
          <Button variant="green" fullWidth type="button" tabIndex={-1}><Send size={16} />Message {ADMIN_TELEGRAM.handle} on Telegram</Button>
        </a>
        <Button variant="ghost" type="button" onClick={() => copy(message, 'msg')}>{done === 'msg' ? <Check size={16} /> : <Copy size={16} />}Copy message</Button>
      </div>
    </div>
  )
}
