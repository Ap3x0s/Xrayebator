import { useEffect, useMemo, useState } from 'react'
import { AlertDialog, Button, Chip, Input, Label, Spinner, TextField } from '@heroui/react'
import { Globe2, Plus, RotateCcw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BypassGroupInfo, SshAccessInput } from '@shared/types'
import styles from '../pages/ServerSettings.module.css'

interface BypassSectionProps {
  serverId: string
  access: SshAccessInput
  disabled: boolean
  onError: (message: string) => void
  onToast: (message: string) => void
}

const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/

/**
 * Bypass-группы (RU-банки/стриминг напрямую): список доменов в обходе + add/remove/
 * reset + готовые группы сервера (_bypass_bundle_groups) чекбоксами.
 * Данные подтягиваются лениво по кнопке — лишний SSH-коннект на каждое открытие
 * страницы профилей не нужен.
 */
export function BypassSection({
  serverId,
  access,
  disabled,
  onError,
  onToast
}: BypassSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [domains, setDomains] = useState<string[]>([])
  const [groups, setGroups] = useState<BypassGroupInfo[]>([])
  const [draft, setDraft] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    onError('')
    try {
      const [state, groupList] = await Promise.all([
        window.api.bypass.list(serverId, access),
        window.api.bypass.groups(serverId, access)
      ])
      if (!state.ok) throw new Error(state.error ?? t('settings.bypassLoadFailed'))
      setDomains(state.domains ?? [])
      if (groupList.ok) {
        setGroups(groupList.groups ?? [])
      } else {
        setGroups([])
        onError(groupList.error ?? t('settings.bypassLoadFailed'))
      }
      setLoaded(true)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Смена сервера сбрасывает состояние секции (иначе чужой список доменов).
  useEffect(() => {
    setLoaded(false)
    setDomains([])
    setGroups([])
    setDraft('')
  }, [serverId])

  const domainSet = useMemo(() => new Set(domains), [domains])

  const refresh = async (): Promise<void> => {
    const state = await window.api.bypass.list(serverId, access)
    if (state.ok) setDomains(state.domains ?? [])
  }

  const add = async (): Promise<void> => {
    const domain = draft.trim().replace(/^domain:/, '')
    // Пустое поле — не ошибка пользователя: он просто ещё ничего не написал.
    // Валидируем и НЕ дёргаем сервер (иначе SSH-вызов падал кодом 1).
    if (!domain) return
    if (!DOMAIN_RE.test(domain)) {
      onError(t('settings.bypassInvalidDomain'))
      return
    }
    setBusy(true)
    onError('')
    try {
      const result = await window.api.bypass.add(serverId, access, domain)
      if (result.ok) {
        toastIfNew(domain, result.duplicate === true)
        setDraft('')
        await refresh()
      } else {
        onError(result.error ?? t('settings.bypassAddFailed'))
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toastIfNew = (domain: string, duplicate: boolean): void => {
    onToast(
      duplicate
        ? t('settings.bypassDuplicate', { domain })
        : t('settings.bypassAdded', { domain })
    )
  }

  const remove = async (domain: string): Promise<void> => {
    setBusy(true)
    onError('')
    try {
      const result = await window.api.bypass.remove(serverId, access, domain)
      if (result.ok) {
        onToast(t('settings.bypassRemoved', { domain }))
        await refresh()
      } else {
        onError(result.error ?? t('settings.bypassRemoveFailed'))
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const resetAll = async (): Promise<void> => {
    setConfirmReset(false)
    setBusy(true)
    onError('')
    try {
      const result = await window.api.bypass.reset(serverId, access)
      if (result.ok) {
        onToast(t('settings.bypassResetDone'))
        await refresh()
      } else {
        onError(result.error ?? t('settings.bypassResetFailed'))
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleGroup = async (group: BypassGroupInfo): Promise<void> => {
    const covered = group.domains.every((d) => domainSet.has(d))
    setBusy(true)
    onError('')
    try {
      const result = covered
        ? await window.api.bypass.unbundle(serverId, access, [group.id])
        : await window.api.bypass.bundle(serverId, access, [group.id])
      if (result.ok) {
        onToast(
          covered
            ? t('settings.bypassGroupOff', { title: group.title })
            : t('settings.bypassGroupOn', { title: group.title })
        )
        await refresh()
      } else {
        onError(result.error ?? t('settings.bypassGroupFailed'))
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.listCard}>
      <h2 className={styles.sectionTitle}>
        <Globe2 size={16} className={styles.titleIcon} />
        {t('settings.bypassTitle')}
      </h2>
      <p className={styles.sectionHint}>{t('settings.bypassHint')}</p>

      {!loaded ? (
        <div className={styles.bypassRow}>
          <Button
            variant="secondary"
            size="sm"
            isDisabled={disabled || loading}
            onPress={() => void load()}
          >
            {loading ? <Spinner size="sm" /> : <Globe2 size={14} />}
            {loading ? t('settings.bypassLoading') : t('settings.bypassLoad')}
          </Button>
        </div>
      ) : (
        <div className={styles.bypassSection}>
          {groups.length > 0 && (
            <div className={styles.fpField}>
              <span className={styles.fieldLabel}>{t('settings.bypassGroups')}</span>
              <div className={styles.bypassGroups}>
                {groups.map((group) => {
                  const covered = group.domains.every((d) => domainSet.has(d))
                  const partial = !covered && group.domains.some((d) => domainSet.has(d))
                  const label = covered
                    ? t('settings.bypassGroupStateOn')
                    : partial
                      ? t('settings.bypassGroupStatePartial')
                      : t('settings.bypassGroupStateOff')
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={`${styles.bypassGroupCard} ${
                        covered ? styles.bypassGroupCardActive : ''
                      }`}
                      disabled={busy}
                      onClick={() => void toggleGroup(group)}
                    >
                      <span className={styles.bypassGroupTitle}>{group.title}</span>
                      <span className={styles.bypassGroupCount}>
                        {group.domains.length} · {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className={styles.bypassRow}>
            <TextField variant="secondary" className={styles.bypassDomainField}>
              <Label>{t('settings.bypassAddLabel')}</Label>
              <Input
                value={draft}
                disabled={busy}
                placeholder="example.ru"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void add()
                }}
              />
            </TextField>
            <Button
              variant="primary"
              size="sm"
              isDisabled={busy || !draft.trim()}
              onPress={() => void add()}
            >
              <Plus size={14} />
              {t('settings.bypassAdd')}
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              isDisabled={busy || domains.length === 0}
              onPress={() => setConfirmReset(true)}
            >
              <RotateCcw size={14} />
              {t('settings.bypassReset')}
            </Button>
            <Chip size="sm" color="default">
              {t('settings.bypassCount', { count: domains.length })}
            </Chip>
          </div>

          {domains.length === 0 ? (
            <p className={styles.bypassEmpty}>{t('settings.bypassEmpty')}</p>
          ) : (
            <div className={styles.bypassDomainList}>
              {domains.map((domain) => (
                <span key={domain} className={styles.bypassDomainItem}>
                  <span>{domain}</span>
                  <button
                    type="button"
                    className={styles.bypassDomainRemove}
                    disabled={busy}
                    title={t('settings.bypassRemoveTitle')}
                    onClick={() => void remove(domain)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog.Root
        isOpen={confirmReset}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmReset(false)
        }}
      >
        <AlertDialog.Backdrop className={styles.blurBackdrop}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className={styles.confirmDialog}>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger">
                  <RotateCcw size={20} />
                </AlertDialog.Icon>
                <AlertDialog.Heading>{t('settings.bypassResetTitle')}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>{t('settings.bypassResetBody')}</AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="secondary" onPress={() => setConfirmReset(false)}>
                  {t('dashboard.cancel')}
                </Button>
                <Button variant="danger" onPress={() => void resetAll()}>
                  {t('settings.bypassReset')}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog.Root>
    </section>
  )
}