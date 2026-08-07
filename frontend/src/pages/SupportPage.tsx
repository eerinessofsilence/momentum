import { ImageSquare as ImagePlus, Paperclip, PaperPlaneTilt as Send } from '@phosphor-icons/react'
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { localizeClientError, useClientI18n } from '../clientI18n'
import { PageHeading } from '../components/PageParts'
import { Button, Card, Notice } from '../components/UI'
import { timeLabel } from '../format'
import type { SupportMessage } from '../types'

export function SupportPage() {
  const { locale, t } = useClientI18n()
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<{ id: number; url: string; filename: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const { items } = await api<{ items: SupportMessage[]; unread_count: number }>('/support/messages')
      setMessages(items)
      await api('/support/read', { method: 'POST' })
      window.dispatchEvent(new CustomEvent('momentum:support-unread', { detail: 0 }))
    } catch (err) {
      setError(localizeClientError((err as Error).message, locale))
    }
  }, [locale])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 10_000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  const pickAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    const form = new FormData(); form.append('upload', file)
    try { setAttachment(await api('/support/attachments', { method: 'POST', body: form })) } catch (err) { setError(localizeClientError((err as Error).message, locale)) } finally { setUploading(false); event.target.value = '' }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    setSending(true); setError('')
    try { await api('/support/messages', { method: 'POST', body: JSON.stringify({ body: body.trim(), attachment_id: attachment?.id }) }); setBody(''); setAttachment(null); await load() } catch (err) { setError(localizeClientError((err as Error).message, locale)) } finally { setSending(false) }
  }

  return (
    <div className="page-content support-page">
      <PageHeading title={t('support')} description={t('supportDescription')} />
      <Card className="support-card">
        <header className="support-agent"><span className="avatar support-avatar">M</span><div><strong>{t('momentumSupport')}</strong><span><i /> {t('onlineAssistant')}</span></div></header>
        <div className="chat-messages" ref={listRef} aria-live="polite">
          {messages.map((message) => <div className={`chat-row ${message.sender}`} key={message.id}><div className="chat-bubble">{message.attachment && <a href={message.attachment.url} target="_blank" rel="noreferrer" className="chat-attachment"><img src={message.attachment.url} alt={message.attachment.filename} /><span><ImagePlus size={16} /> {message.attachment.filename}</span></a>}<p>{message.body}</p><time>{timeLabel(message.created_at)}</time></div></div>)}
        </div>
        <form className="chat-composer" onSubmit={submit}>
          {attachment && <div className="pending-attachment"><ImagePlus size={16} /><span>{attachment.filename}</span><Button variant="ghost" size="small" onClick={() => setAttachment(null)}>{t('remove')}</Button></div>}
          {error && <Notice variant="danger">{error}</Notice>}
          <div className="composer-row">
            <button type="button" className="attach-button" aria-label={t('attachScreenshot')} disabled={uploading} onClick={() => uploadRef.current?.click()}><Paperclip size={20} /></button>
            <input ref={uploadRef} className="visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={pickAttachment} disabled={uploading} tabIndex={-1} />
            <input value={body} onChange={(event) => setBody(event.target.value)} placeholder={uploading ? t('uploading') : t('typeMessage')} aria-label={t('supportMessage')} />
            <Button type="submit" variant="primary" size="small" className="composer-send" disabled={sending || uploading || !body.trim()} aria-label={t('sendMessage')}><Send size={20} /></Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
