import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import type { Server, VlessLink } from '@shared/types'

interface StoredServer extends Omit<Server, 'id' | 'createdAt'> {
  id: string
  createdAt: string
}

interface ServersSchema {
  servers: StoredServer[]
}

export interface ServerStore {
  list: () => StoredServer[]
  get: (id: string) => StoredServer | undefined
  add: (input: Omit<Server, 'id' | 'createdAt'>) => StoredServer
  updateKeys: (id: string, keys: VlessLink[]) => StoredServer | undefined
  remove: (id: string) => boolean
}

export function createServerStore(): ServerStore {
  const store = new Store<ServersSchema>({
    name: 'xrayebator',
    defaults: { servers: [] }
  })

  return {
    list(): StoredServer[] {
      return store.get('servers')
    },

    get(id: string): StoredServer | undefined {
      return store.get('servers').find((s) => s.id === id)
    },

    add(input: Omit<Server, 'id' | 'createdAt'>): StoredServer {
      const server: StoredServer = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        keys: input.keys ?? []
      }
      store.set('servers', [...store.get('servers'), server])
      return server
    },

    updateKeys(id: string, keys: VlessLink[]): StoredServer | undefined {
      const servers = store.get('servers')
      const idx = servers.findIndex((s) => s.id === id)
      if (idx === -1) return undefined
      const updated: StoredServer = { ...servers[idx], keys }
      const next = [...servers]
      next[idx] = updated
      store.set('servers', next)
      return updated
    },

    remove(id: string): boolean {
      const servers = store.get('servers')
      const next = servers.filter((s) => s.id !== id)
      if (next.length === servers.length) return false
      store.set('servers', next)
      return true
    }
  }
}
