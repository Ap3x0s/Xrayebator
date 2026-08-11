import { useMemo, useState } from 'react'
import { Button, TextField, Label, Input, Chip, Spinner } from '@heroui/react'
import { Settings2, Play, Trash2, RefreshCw, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Server, ServerProfile } from '@shared/types'
import styles from './ServerSettings.module.css'

interface ServerSettingsProps {
  server: Server
  onBack: () => void
}

const PROTOCOLS = [
  { id: 'xhttp', label: 'XHTTP' },
  { id: 'tcp', label: 'TCP' },
  { id: 'tcp-utls', label: 'TCP-uTLS' },
  { id: 'tcp-xudp', label: 'TCP-XUDP' },
  { id: 'tcp-mux', label: 'TCP-MUX' },
  { id: 'grpc', label: 'gRPC' }
] as const

export function ServerSettings({ server, onBack }: ServerSettingsProps): React.JSX.Element {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [profiles, setProfiles] = useState<ServerProfile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [transport, setTransport] = useState('xhttp')
  const [count, setCount] = useState('1')
  const [creating, setCreating] = useState(false)

  const connected = profiles !== null

  const futureNames = useMemo(() => {
    const base = name.trim() || 'phone-1'
    const n = Math.min(Math.max(Number(count) || 1, 1), 50)
    const list: string[] = []
    for (let i = 1; i <= n; i++) {
      list.push(i === 1 ? base : `${base}-${i}`)
    }
    return list
  }, [name, count])

  const toastText = (text: string): void => {
    setToast(text)
    setTimeout(() => setToast(null), 1800)
  }

  const load = async (): Promise<void> => {
    if (!password.trim()) {
      setError(t('settings.errorPassword'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.profiles.list(server.id, password)
      setProfiles(result.profiles ?? [])
    } catch (err) {
      setProfiles(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const create = async (): Promise<void> => {
    if (!password.trim()) {
      setError(t('settings.errorPassword'))
      return
    }
    if (!name.trim()) {
      setError(t('settings.errorName'))
      return
    }
    setBusy(true)
    setCreating(true)
    setError(null)
    let createdCount = 0
    let failedMessage: string | null = null
    try {
      const result = await window.api.profiles.create(server.id, password, {
        name: name.trim(),
        transport,
        count: Math.max(1, Number(count) || 1)
      })
      if (result.ok && result.names.length > 0) {
        createdCount = result.names.length
      } else {
        failedMessage = result.errors[0] ?? t('settings.createFailed')
      }
    } catch (err) {
      failedMessage = err instanceof Error ? err.message : String(err)
    }
    // Профили могли создаться на сервере, даже если ответ не распарсился —
    // всегда перечитываем список, чтобы показать реальное состояние.
    try {
      const fresh = await window.api.profiles.list(server.id, password)
      setProfiles(fresh.profiles ?? [])
    } catch {
      // список не критичен, ошибку создания уже показываем
    }
    if (createdCount > 0) {
      toastText(t('settings.created', { count: createdCount }))
      setName('')
    } else if (failedMessage) {
      setError(failedMessage)
    }
    setBusy(false)
    setCreating(false)
  }

  const remove = async (profile: ServerProfile): Promise<void> => {
    if (!password.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.profiles.remove(server.id, password, profile.name)
      if (result.ok) {
        toastText(t('settings.deleted', { name: profile.name }))
        setProfiles((prev) => (prev ?? []).filter((p) => p.name !== profile.name))
      } else {
        setError(result.error ?? t('settings.deleteFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const copyUrl = async (profile: ServerProfile): Promise<void> => {
    if (!profile.subscription_url) return
    await navigator.clipboard.writeText(profile.subscription_url)
    toastText(t('settings.copied'))
  }

  const transportLabel = (profile: ServerProfile): string =>
    profile.multi_route ? `${profile.transport} · ${profile.routes} ${t('settings.routes')}` : profile.transport

  const reset = (): void => {
    setProfiles(null)
    setError(null)
    setPassword('')
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Button variant="secondary" size="sm" onPress={onBack}>
          {t('dashboard.back')}
        </Button>
        <h1 className={styles.title}>
          <Settings2 size={20} className={styles.titleIcon} />
          {t('settings.title')}
        </h1>
        <span className={styles.serverName}>{server.name}</span>
      </header>

      <div className={styles.body}>
        <section className={styles.connectCard}>
          <p className={styles.hint}>
            {t('settings.hint')}
          </p>
          <div className={styles.passwordRow}>
            <TextField variant="secondary" className={styles.passwordField}>
              <Label>{t('settings.sshPassword')}</Label>
              <Input
                type="password"
                value={password}
                disabled={busy}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
              />
            </TextField>
            {!connected ? (
              <Button
                variant="primary"
                size="lg"
                isDisabled={busy || !password.trim()}
                onPress={load}
              >
                {busy && <Spinner size="sm" />}
                <Play size={16} />
                {t('settings.connect')}
              </Button>
            ) : (
              <Button variant="secondary" size="lg" isDisabled={busy} onPress={reset}>
                <RefreshCw size={16} />
                {t('settings.changePassword')}
              </Button>
            )}
          </div>
          <p className={styles.passwordNote}>{t('settings.passwordNote')}</p>
        </section>

        {error && <div className={styles.error}>{t('settings.error')}: {error}</div>}
        {toast && <div className={styles.toast}>{toast}</div>}

        {connected && (
          <>
            <section
              className={`${styles.createCard} ${creating ? styles.createCardBusy : ''}`}
            >
              <h2 className={styles.sectionTitle}>{t('settings.createTitle')}</h2>
              <p className={styles.sectionHint}>{t('settings.createHint')}</p>
              {creating && (
                <div className={styles.createBusy}>
                  <span className={styles.createBusyDot} />
                  {t('settings.creating')}
                </div>
              )}
              <div className={styles.createRow}>
                <TextField variant="secondary" className={styles.nameField}>
                  <Label>{t('settings.profileName')}</Label>
                  <Input
                    value={name}
                    disabled={busy}
                    placeholder="phone-1"
                    onChange={(e) => setName(e.target.value)}
                  />
                </TextField>
                <TextField variant="secondary" className={styles.countField}>
                  <Label>{t('settings.count')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    disabled={busy}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </TextField>
                <Button
                  variant="primary"
                  size="lg"
                  className={styles.createBtn}
                  isDisabled={busy || !password.trim() || !name.trim()}
                  onPress={create}
                >
                  {busy && <Spinner size="sm" />}
                  {t('settings.createBtn')}
                </Button>
              </div>
              <div className={styles.createPreview}>
                <span className={styles.createPreviewLabel}>{t('settings.previewLabel')}</span>
                <div className={styles.createPreviewNames}>
                  {futureNames.slice(0, 6).map((nm, idx) => (
                    <span key={`${nm}-${idx}`} className={styles.createPreviewName}>
                      {nm}
                    </span>
                  ))}
                  {futureNames.length > 6 && (
                    <span className={styles.createPreviewMore}>
                      +{futureNames.length - 6}
                    </span>
                  )}
                </div>
                <span className={styles.createPreviewHint}>{t('settings.previewHint')}</span>
              </div>
              <div className={styles.transportField}>
                <span className={styles.fieldLabel}>{t('settings.protocol')}</span>
                <p className={styles.sectionHint}>{t('settings.protocolPrompt')}</p>
                <div className={styles.transportGrid}>
                  {PROTOCOLS.map((proto) => {
                    const active = transport === proto.id
                    return (
                      <button
                        key={proto.id}
                        type="button"
                        className={`${styles.transportCard} ${
                          active ? styles.transportCardActive : ''
                        }`}
                        disabled={busy}
                        onClick={() => setTransport(proto.id)}
                      >
                        <span className={styles.transportCardName}>
                          {proto.label}
                          {proto.id === 'xhttp' && (
                            <span className={styles.transportCardTag}>
                              {t('settings.recommended')}
                            </span>
                          )}
                        </span>
                        <span className={styles.transportCardDesc}>
                          {t(`settings.protocolHint.${proto.id}`)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className={styles.listCard}>
              <h2 className={styles.sectionTitle}>{t('settings.listTitle')}</h2>
              {profiles!.length === 0 && <div className={styles.empty}>{t('settings.empty')}</div>}
              {profiles!.map((profile) => (
                <div key={profile.name} className={styles.profileCard}>
                  <div className={styles.profileMain}>
                    <div className={styles.profileNameRow}>
                      <span className={styles.profileName}>{profile.name}</span>
                      {profile.multi_route && <Chip size="sm" color="accent">{t('settings.happ')}</Chip>}
                      {profile.pq_enabled && <Chip size="sm" color="default">PQ</Chip>}
                    </div>
                    <div className={styles.profileMeta}>
                      <Chip size="sm" color="default">{transportLabel(profile)}</Chip>
                      <Chip size="sm" color="default">:{profile.port}</Chip>
                      <span className={styles.profileSni}>{profile.sni}</span>
                    </div>
                    {profile.subscription_url && (
                      <div className={styles.profileUrl} title={profile.subscription_url}>
                        {profile.subscription_url}
                      </div>
                    )}
                  </div>
                  <div className={styles.profileActions}>
                    {profile.subscription_url && (
                      <Button size="sm" variant="secondary" onPress={() => copyUrl(profile)}>
                        {t('settings.copy')}
                      </Button>
                    )}
                    {profile.multi_route ? (
                      <span className={styles.protectedProfile} title={t('settings.mainProfileHint')}>
                        <Lock size={13} />
                        {t('settings.mainProfile')}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger-soft"
                        isDisabled={busy}
                        onPress={() => remove(profile)}
                      >
                        <Trash2 size={14} />
                        {t('dashboard.delete')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}