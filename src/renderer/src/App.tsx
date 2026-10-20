import { useEffect, useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { AddServer } from './pages/AddServer'
import { ImportServer } from './pages/ImportServer'
import { ServerKeys } from './pages/ServerKeys'
import { ServerSettings } from './pages/ServerSettings'
import type { Server } from '@shared/types'

type View =
  | { name: 'dashboard' }
  | { name: 'add' }
  | { name: 'import' }
  | { name: 'keys'; server: Server }
  | { name: 'settings'; server: Server; editingAccess?: boolean }

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const [servers, setServers] = useState<Server[]>([])

  useEffect(() => {
    window.api.servers.list().then(setServers)
  }, [])

  const upsertServer = (server: Server): void => {
    setServers((prev) => {
      const others = prev.filter((s) => s.id !== server.id)
      return [...others, server]
    })
  }

  /** Обновляет карточку на месте, не меняя порядок на дашборде. */
  const replaceServer = (server: Server): void => {
    setServers((prev) => prev.map((s) => (s.id === server.id ? server : s)))
  }

  /**
   * Переход на страницу сервера со СВЕЖЕЙ карточкой из стора.
   *
   * Стор живёт своей жизнью: `profiles:list` пишет туда кэш ключей, сроков
   * профилей и ссылок форматов, `servers.list` читался один раз при старте —
   * поэтому `servers` в состоянии отстаёт. Раньше страница получала этот
   * устаревший объект и рисовалась без кэша: подписи сроков и карточки бэкендов
   * появлялись только после ответа SSH и дёргали разметку (жалоба 2026-10-20).
   * Чтение локального стора — единицы миллисекунд, поэтому делаем его ДО
   * навигации: страница монтируется уже с полным кэшем, без «дорастания».
   */
  const openServer = async (
    server: Server,
    target: 'keys' | 'settings',
    editingAccess = false
  ): Promise<void> => {
    const fresh = (await window.api.servers.get(server.id).catch(() => undefined)) ?? server
    replaceServer(fresh)
    setView(
      target === 'keys'
        ? { name: 'keys', server: fresh }
        : { name: 'settings', server: fresh, editingAccess }
    )
  }

  if (view.name === 'add') {
    return (
      <AddServer
        onDone={(server) => {
          upsertServer(server)
          setView({ name: 'keys', server })
        }}
        onBack={() => setView({ name: 'dashboard' })}
      />
    )
  }

  if (view.name === 'import') {
    return (
      <ImportServer
        onDone={(server) => {
          upsertServer(server)
          setView({ name: 'settings', server })
        }}
        onBack={() => setView({ name: 'dashboard' })}
      />
    )
  }

  if (view.name === 'keys') {
    return (
      <ServerKeys
        server={view.server}
        onBack={() => setView({ name: 'dashboard' })}
        onSettings={() => void openServer(view.server, 'settings')}
      />
    )
  }

  if (view.name === 'settings') {
    return (
      <ServerSettings
        server={view.server}
        editingAccess={view.editingAccess ?? false}
        onBack={() => setView({ name: 'dashboard' })}
      />
    )
  }

  return (
    <Dashboard
      servers={servers}
      onAdd={() => setView({ name: 'add' })}
      onImport={() => setView({ name: 'import' })}
      onOpen={(server) => void openServer(server, 'keys')}
      onSettings={(server) => void openServer(server, 'settings')}
      onEditAccess={(server) => void openServer(server, 'settings', true)}
      onRemove={async (id) => {
        await window.api.servers.remove(id)
        setServers((prev) => prev.filter((s) => s.id !== id))
      }}
    />
  )
}
