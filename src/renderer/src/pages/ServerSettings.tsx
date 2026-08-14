import { useMemo, useState } from 'react'
import { Button, TextField, Label, Input, Chip, Spinner, AlertDialog } from '@heroui/react'
import { Settings2, Play, Trash2, RefreshCw, Lock, CloudDownload, CloudOff } from 'lucide-react'
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

export const FINGERPRINTS = [
  'chrome',
  'firefox',
  'safari',
  'edge',
  'ios',
  'random'
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

  const [updating, setUpdating] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<ServerProfile | null>(null)

  const [fpTarget, setFpTarget] = useState<ServerProfile | null>(null)
  const [fpRoute, setFpRoute] = useState<number>(1)
  const [fpValue, setFpValue] = useState<string>('firefox')
  const [fpBusy, setFpBusy] = useState(false)

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
    const beforeNames = new Set((profiles ?? []).map((p) => p.name))
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
      // Если create вернул ошибку парсинга («пустой ответ»), но заказанные
      // профили реально появились на сервере — считаем создание успешным.
      if (createdCount === 0 && failedMessage) {
        const newlyAppeared = (fresh.profiles ?? []).filter(
          (p) => futureNames.includes(p.name) && !beforeNames.has(p.name)
        )
        if (newlyAppeared.length > 0) {
          createdCount = newlyAppeared.length
          failedMessage = null
        }
      }
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
        // Удаление могло пройти на сервере, даже если ответ не распарсился.
        // Перечитываем список: профиля больше нет — считаем удаление успешным.
        const fresh = await window.api.profiles.list(server.id, password)
        const stillThere = (fresh.profiles ?? []).some((p) => p.name === profile.name)
        if (stillThere) {
          setError(result.error ?? t('settings.deleteFailed'))
        } else {
          toastText(t('settings.deleted', { name: profile.name }))
          setProfiles(fresh.profiles ?? [])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const changeFingerprint = async (): Promise<void> => {
    if (!fpTarget || !password.trim()) return
    setFpBusy(true)
    setError(null)
    const input = {
      name: fpTarget.name,
      fingerprint: fpValue,
      ...(fpTarget.multi_route ? { route: fpRoute } : {})
    }
    try {
      const result = await window.api.profiles.changeFingerprint(server.id, password, input)
      if (result.ok) {
        toastText(t('settings.fpChanged', { name: fpTarget.name, fp: result.fingerprint ?? fpValue }))
        const fresh = await window.api.profiles.list(server.id, password)
        setProfiles(fresh.profiles ?? [])
        setFpTarget(null)
      } else {
        setError(result.error ?? t('settings.fpFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setFpBusy(false)
    }
  }

  const copyUrl = async (profile: ServerProfile): Promise<void> => {
    if (!profile.subscription_url) return
    await navigator.clipboard.writeText(profile.subscription_url)
    toastText(t('settings.copied'))
  }

  const updateServer = async (): Promise<void> => {
    if (!password.trim()) return
    setBusy(true)
    setUpdating(true)
    setError(null)
    try {
      const result = await window.api.server.update(server.id, password, 'experimental')
      if (result.ok) {
        toastText(t('settings.updated'))
      } else {
        setError(result.error ?? t('settings.updateFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setUpdating(false)
    }
  }

  const uninstallServer = async (): Promise<void> => {
    if (!password.trim()) return
    setConfirmUninstall(false)
    setBusy(true)
    setUninstalling(true)
    setError(null)
    try {
      const result = await window.api.server.uninstall(server.id, password)
      if (result.ok) {
        toastText(t('settings.uninstalled'))
      } else {
        setError(result.error ?? t('settings.uninstallFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setUninstalling(false)
    }
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
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy}
          onPress={onBack}
        >
          {t('dashboard.back')}
        </Button>
        <h1 className={styles.title}>
          <Settings2 size={20} className={styles.titleIcon} />
          {t('settings.title')}
        </h1>
        <span className={styles.serverName}>{server.name}</span>
        {connected && (
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              size="sm"
              isDisabled={busy && !updating}
              onPress={updateServer}
            >
              <CloudDownload
                size={16}
                className={updating ? styles.iconDownloading : undefined}
              />
              {updating ? t('settings.updating') : t('settings.updateServer')}
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              className={uninstalling ? styles.breathing : undefined}
              isDisabled={busy && !uninstalling}
              onPress={() => setConfirmUninstall(true)}
            >
              <CloudOff size={16} />
              {uninstalling ? t('settings.uninstalling') : t('settings.uninstallServer')}
            </Button>
          </div>
        )}
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
                className={busy ? styles.glowPulse : undefined}
                isDisabled={busy || !password.trim()}
                onPress={load}
              >
                <Play size={16} />
                {busy ? t('settings.connecting') : t('settings.connect')}
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
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={busy}
                      onPress={() => {
                        setFpTarget(profile)
                        setFpValue(profile.fingerprint || 'firefox')
                        setFpRoute(1)
                      }}
                    >
                      {t('settings.changeFingerprint')}
                    </Button>
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
                        onPress={() => setConfirmRemove(profile)}
                      >
                        <Trash2 size={14} />
                        {t('settings.deleteKey')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      <AlertDialog.Root
        isOpen={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null)
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className={styles.confirmDialog}>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger">
                  <Trash2 size={20} />
                </AlertDialog.Icon>
                <AlertDialog.Heading>
                  {t('settings.deleteKeyTitle')}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {t('settings.deleteKeyBody', {
                  name: confirmRemove?.name ?? '',
                  server: server.name,
                })}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="secondary" onPress={() => setConfirmRemove(null)}>
                  {t('dashboard.cancel')}
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    if (confirmRemove) void remove(confirmRemove)
                    setConfirmRemove(null)
                  }}
                >
                  {t('settings.deleteKey')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog.Root>

      <AlertDialog.Root
        isOpen={fpTarget !== null}
        onOpenChange={(open) => {
          if (!open && !fpBusy) setFpTarget(null)
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className={styles.confirmDialog}>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  {t('settings.fpTitle')} — {fpTarget?.name ?? ''}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className={styles.fpHint}>{t('settings.fpHint')}</p>
                {fpTarget && (
                  <p className={styles.fpCurrent}>
                    {t('settings.fpCurrent', { fp: fpTarget.fingerprint || '—' })}
                  </p>
                )}
                {fpTarget?.multi_route && (
                  <div className={styles.fpField}>
                    <span className={styles.fieldLabel}>{t('settings.fpRoute')}</span>
                    <div className={styles.fpRouteGrid}>
                      {Array.from({ length: fpTarget.routes }, (_, i) => i + 1).map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`${styles.fpRouteCard} ${
                            fpRoute === r ? styles.fpRouteCardActive : ''
                          }`}
                          disabled={fpBusy}
                          onClick={() => setFpRoute(r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.fpField}>
                  <span className={styles.fieldLabel}>{t('settings.protocol')}</span>
                  <div className={styles.fpGrid}>
                    {FINGERPRINTS.map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        className={`${styles.fpCard} ${
                          fpValue === fp ? styles.fpCardActive : ''
                        }`}
                        disabled={fpBusy}
                        onClick={() => setFpValue(fp)}
                      >
                        <span className={styles.fpCardName}>{fp}</span>
                        <span className={styles.fpCardDesc}>{t(`settings.fpOptions.${fp}`)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className={styles.fpNote}>{t('settings.fpRemember')}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="secondary" isDisabled={fpBusy} onPress={() => setFpTarget(null)}>
                  {t('dashboard.cancel')}
                </Button>
                <Button
                  variant="primary"
                  isDisabled={fpBusy || !fpValue}
                  onPress={changeFingerprint}
                >
                  {fpBusy && <Spinner size="sm" />}
                  {t('settings.changeFingerprint')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog.Root>

      <AlertDialog.Root
        isOpen={confirmUninstall}
        onOpenChange={(open) => {
          if (!open) setConfirmUninstall(false)
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className={styles.confirmDialog}>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger">
                  <Trash2 size={20} />
                </AlertDialog.Icon>
                <AlertDialog.Heading>
                  {t('settings.uninstallTitle')}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {t('settings.uninstallBody', { name: server.name })}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="secondary" onPress={() => setConfirmUninstall(false)}>
                  {t('dashboard.cancel')}
                </Button>
                <Button variant="danger" onPress={uninstallServer}>
                  {t('settings.uninstallServer')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog.Root>
    </div>
  )
}