import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import type { Server } from '@shared/types'

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
        createdAt: new Date().toISOString()
      }
      store.set('servers', [...store.get('servers'), server])
      return server
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
