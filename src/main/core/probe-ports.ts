import type { Server } from '@shared/types'

export function probePortsFor(server: Server): number[] {
  const ports = new Set<number>()
  for (const key of server.keys ?? []) {
    const match = /@[^:]+:(\d+)/.exec(key.url)
    if (match) ports.add(Number(match[1]))
  }
  try {
    const url = new URL(server.subscriptionUrl)
    if (url.port) ports.add(Number(url.port))
  } catch {
    /* ignore malformed url */
  }
  if (ports.size === 0) ports.add(443)
  return [...ports]
}