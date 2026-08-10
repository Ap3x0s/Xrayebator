import { Button, Chip } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import type { Server } from '@shared/types'
import { CountryFlag } from '../components/CountryFlag'
import styles from './Dashboard.module.css'

interface DashboardProps {
  servers: Server[]
  onAdd: () => void
  onOpen: (server: Server) => void
  onRemove: (id: string) => void
}

export function Dashboard({
  servers,
  onAdd,
  onOpen,
  onRemove
}: DashboardProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('dashboard.title')}</h1>
        {servers.length > 0 && (
          <Button variant="primary" size="md" onPress={onAdd}>
            + {t('dashboard.add')}
          </Button>
        )}
      </header>

      <div className={styles.list}>
        {servers.map((server) => (
          <div key={server.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.statusDot} />
              <div className={styles.cardInfo}>
                <div className={styles.cardTitle}>
                  <CountryFlag flag={server.flag} className={styles.flag} />
                  {server.name}
                </div>
                <div className={styles.cardMeta}>
                  <Chip size="sm" color="default">
                    {server.country || '—'}
                  </Chip>
                  {server.city && <span>{server.city}</span>}
                  <Chip size="sm" color="default">
                    {server.os ?? '—'}
                  </Chip>
                  <span>
                    {t('dashboard.routes', { count: server.routesCount ?? 0 })}
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.cardActions}>
              <Button size="sm" variant="secondary" onPress={() => onOpen(server)}>
                {t('dashboard.keys')}
              </Button>
              <Button
                size="sm"
                variant="danger-soft"
                onPress={() => onRemove(server.id)}
              >
                {t('dashboard.delete')}
              </Button>
            </div>
          </div>
        ))}

        {servers.length === 0 && (
          <Button
            className={styles.emptyCard}
            variant="ghost"
            size="lg"
            onPress={onAdd}
          >
            <span className={styles.emptyPlus}>+</span>
            <span className={styles.emptyText}>{t('dashboard.empty')}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
