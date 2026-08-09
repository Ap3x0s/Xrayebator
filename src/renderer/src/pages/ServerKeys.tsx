import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button, Chip } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import type { Server, VlessLink } from '@shared/types'
import styles from './ServerKeys.module.css'

interface ServerKeysProps {
  server: Server
  onBack: () => void
}

export function ServerKeys({ server, onBack }: ServerKeysProps): React.JSX.Element {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<VlessLink[]>(server.keys ?? [])
  const [subscriptionUrl, setSubscriptionUrl] = useState(server.subscriptionUrl)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!server.subscriptionUrl) return
    window.api.subscription
      .fetch(server.id)
      .then((result) => {
        if (cancelled) return
        setKeys(result.keys)
        setSubscriptionUrl(result.subscriptionUrl)
      })
      .catch(() => {
        if (!cancelled) setKeys(server.keys ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [server.id])

  const copy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setToast(t('keys.copied'))
    setTimeout(() => setToast(null), 1500)
  }

  const showQr = async (url: string): Promise<void> => {
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 })
    const modal = document.createElement('div')
    modal.className = styles.qrModal
    modal.innerHTML = `<img src="${dataUrl}" alt="QR" />`
    modal.onclick = () => modal.remove()
    document.body.appendChild(modal)
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Button variant="secondary" size="sm" onPress={onBack}>
          {t('dashboard.back')}
        </Button>
        <h1 className={styles.title}>{server.name}</h1>
      </header>

      <div className={styles.content}>
        {keys.length === 0 && <div className={styles.empty}>{t('keys.none')}</div>}

        {keys.map((key) => (
          <div key={key.url} className={styles.keyCard}>
            <div className={styles.keyHeader}>
              <Chip size="sm" color="accent">
                {key.transport.toUpperCase()} :443
              </Chip>
            </div>
            <div className={styles.keyUrl} title={key.url}>
              {key.url}
            </div>
            <div className={styles.keyActions}>
              <Button size="sm" variant="secondary" onPress={() => copy(key.url)}>
                {t('keys.copy')}
              </Button>
              <Button size="sm" variant="secondary" onPress={() => showQr(key.url)}>
                {t('keys.qr')}
              </Button>
            </div>
          </div>
        ))}

        {subscriptionUrl && (
          <div className={styles.keyCard}>
            <div className={styles.keyHeader}>
              <Chip size="sm" color="default">
                {t('keys.subscription')}
              </Chip>
            </div>
            <div className={styles.keyUrl} title={subscriptionUrl}>
              {subscriptionUrl}
            </div>
            <div className={styles.keyActions}>
              <Button size="sm" variant="secondary" onPress={() => copy(subscriptionUrl)}>
                {t('keys.copy')}
              </Button>
            </div>
          </div>
        )}

        {keys.length > 0 && (
          <Button
            className={styles.copyAllBtn}
            variant="primary"
            size="lg"
            onPress={() =>
              copy(keys.map((k) => k.url).join('\n') + '\n' + subscriptionUrl)
            }
          >
            {t('keys.copy_all')}
          </Button>
        )}
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
