import { execFileSync } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

/**
 * Validates strict dotted-quad IPv4 format (`0.0.0.0` .. `255.255.255.255`) without leading zeros.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidIPv4(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  const parts = trimmed.split('.')
  if (parts.length !== 4) return false
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return false
    const num = Number(part)
    if (!Number.isInteger(num) || num < 0 || num > 255) return false
  }
  return true
}

/**
 * Returns true only for RFC1918 private LAN IPv4 ranges (`10/8`, `172.16/12`, `192.168/16`),
 * excluding loopback (`127/8`), APIPA link-local (`169.254/16`), and unspecified (`0.0.0.0`).
 * @param {unknown} ip
 * @returns {boolean}
 */
export function isPrivateLanIPv4(ip) {
  if (!isValidIPv4(ip)) return false
  const [a, b] = ip.trim().split('.').map(Number)
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

const VIRTUAL_INTERFACE_PATTERNS = [
  /loopback/i,
  /pseudo/i,
  /vethernet/i,
  /hyper-v/i,
  /\bwsl\b/i,
  /docker/i,
  /vmware/i,
  /\bvmnet/i,
  /virtualbox/i,
  /\bvboxnet/i,
  /host-only/i,
  /tailscale/i,
  /zerotier/i,
  /wireguard/i,
  /\bwintun\b/i,
  /\btap[-\s_]?/i,
  /\btun\d*\b/i,
  /\butun\d+/i,
  /\bawdl\d+/i,
  /\bllw\d+/i,
  /bluetooth/i,
  /local area connection\*/i,
  /npcap/i,
  /hamachi/i,
  /radmin/i,
  /\bbridge\b/i,
  /\bbr-/i,
  /\bveth/i,
  /teredo/i,
  /isatap/i,
  /proton/i,
  /nordlynx/i,
  /\bclash\b/i,
]

/**
 * Identifies loopback, tunnel, hypervisor, VPN, Bluetooth PAN, and Microsoft Wi-Fi Direct virtual adapters.
 * @param {string} name
 * @returns {boolean}
 */
export function isVirtualInterfaceName(name) {
  if (!name || typeof name !== 'string') return true
  const trimmed = name.trim()
  if (!trimmed) return true
  return VIRTUAL_INTERFACE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * Scores a network interface + address candidate for LAN suitability.
 * Returns `-1` for unsuitable / virtual / non-RFC1918 entries.
 * @param {string} name
 * @param {string | { address?: string; family?: string | number; internal?: boolean }} addressInfo
 * @returns {number}
 */
export function scoreInterface(name, addressInfo) {
  const ip = typeof addressInfo === 'string' ? addressInfo.trim() : addressInfo?.address?.trim()
  if (typeof addressInfo === 'object' && addressInfo !== null) {
    if (addressInfo.internal) return -1
    const family = String(addressInfo.family ?? '')
    if (family && family !== 'IPv4' && family !== '4') return -1
  }
  if (!isPrivateLanIPv4(ip)) return -1
  if (isVirtualInterfaceName(name)) return -1

  let score = 40
  if (/\b(wi-?fi|wlan|wireless|airport)\b/i.test(name) || /^(wl|en0)\b/i.test(name)) {
    score = 100
  } else if (/\b(ethernet|gigabit|lan)\b/i.test(name) || /^(eth|enp|eno|ens)/i.test(name)) {
    score = 90
  }

  const [a, b] = ip.split('.').map(Number)
  if (a === 192 && b === 168) {
    score += 20
  } else if (a === 10) {
    score += 15
  } else if (a === 172 && b >= 16 && b <= 31) {
    score += 10
  }

  return score
}

/**
 * Returns ranked physical private LAN IPv4 candidates from `os.networkInterfaces()` or a provided map.
 * @param {NodeJS.Dict<os.NetworkInterfaceInfo[]>} [interfaces]
 * @returns {Array<{ interfaceName: string; ip: string; score: number; netmask?: string }>}
 */
export function collectLanCandidates(interfaces) {
  const map = interfaces ?? os.networkInterfaces()
  /** @type {Array<{ interfaceName: string; ip: string; score: number; netmask?: string }>} */
  const candidates = []
  for (const [interfaceName, entries] of Object.entries(map)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!entry) continue
      const score = scoreInterface(interfaceName, entry)
      if (score > 0 && entry.address) {
        candidates.push({
          interfaceName,
          ip: entry.address.trim(),
          score,
          netmask: entry.netmask,
        })
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip))
  return candidates
}

/**
 * Returns deduplicated private LAN IPv4 addresses sorted by interface priority.
 * @param {NodeJS.Dict<os.NetworkInterfaceInfo[]>} [interfaces]
 * @returns {string[]}
 */
export function getLocalLanIPv4List(interfaces) {
  return [...new Set(collectLanCandidates(interfaces).map((item) => item.ip))]
}

/**
 * Collects all non-internal IPv4 addresses present on local interfaces (including secondary/VPN adapters).
 * @param {NodeJS.Dict<os.NetworkInterfaceInfo[]>} [interfaces]
 * @returns {Set<string>}
 */
function collectAllNonInternalIPv4Set(interfaces) {
  const map = interfaces ?? os.networkInterfaces()
  const out = new Set()
  for (const entries of Object.values(map)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!entry || entry.internal || !entry.address) continue
      const family = String(entry.family ?? '')
      if (family && family !== 'IPv4' && family !== '4') continue
      const ip = entry.address.trim()
      if (isValidIPv4(ip)) out.add(ip)
    }
  }
  return out
}

/**
 * Detects the best LAN IPv4 address for accessing this host from other devices on the same Wi-Fi/LAN.
 * Supports explicit manual override (`--ip` or `NORI_LAN_IP`) with strict IPv4 validation and interface verification.
 * @param {{ explicitIp?: string | null; interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]> }} [options]
 * @returns {{
 *   ip: string | null;
 *   interfaceName: string | null;
 *   source: 'manual' | 'auto' | 'none';
 *   matchedLocalInterface: boolean;
 *   warning: string | null;
 *   candidates: Array<{ interfaceName: string; ip: string; score: number; netmask?: string }>;
 * }}
 */
export function detectLanIPv4(options = {}) {
  const { explicitIp, interfaces } = options
  const candidates = collectLanCandidates(interfaces)
  const manual = typeof explicitIp === 'string' ? explicitIp.trim() : ''
  if (manual) {
    if (!isValidIPv4(manual) || manual === '0.0.0.0') {
      throw new Error(
        `Địa chỉ IP LAN chỉ định thủ công không hợp lệ ("${manual}"). Vui lòng nhập IPv4 đúng định dạng (ví dụ 192.168.1.7).`,
      )
    }
    const matchedCandidate = candidates.find((c) => c.ip === manual)
    const allNonInternal = collectAllNonInternalIPv4Set(interfaces)
    const matchedLocalInterface = Boolean(matchedCandidate) || allNonInternal.has(manual)
    return {
      ip: manual,
      interfaceName: matchedCandidate ? matchedCandidate.interfaceName : 'manual',
      source: 'manual',
      matchedLocalInterface,
      warning: matchedLocalInterface
        ? null
        : `Địa chỉ IPv4 chỉ định thủ công (${manual}) không thuộc card mạng đang hoạt động nào trên máy này. Thiết bị khác trong mạng LAN sẽ không truy cập được cho đến khi có interface giữ IP này.`,
      candidates,
    }
  }

  const best = candidates[0] ?? null
  if (!best) {
    return {
      ip: null,
      interfaceName: null,
      source: 'none',
      matchedLocalInterface: false,
      warning: null,
      candidates: [],
    }
  }
  return {
    ip: best.ip,
    interfaceName: best.interfaceName,
    source: 'auto',
    matchedLocalInterface: true,
    warning: null,
    candidates,
  }
}

/**
 * Builds the environment object passed into the Next.js LAN child process so dynamic LAN IP changes
 * update `NEXT_PUBLIC_SITE_URL` and `NORI_LAN_IP` automatically without editing `.env` or source code.
 * @param {{
 *   baseEnv?: Record<string, string | undefined>;
 *   port: number | string;
 *   detected?: { ip?: string | null } | null;
 * }} options
 * @returns {Record<string, string | undefined>}
 */
export function buildLanChildEnv(options) {
  const { baseEnv = process.env, port, detected } = options
  const portStr = String(port)
  const ip = typeof detected?.ip === 'string' && detected.ip.trim() ? detected.ip.trim() : null
  const figmaUrl = baseEnv?.FIGMA_PUBLIC_URL?.trim()
  const resolvedSiteUrl =
    figmaUrl || (ip ? `http://${ip}:${portStr}` : `http://localhost:${portStr}`)

  /** @type {Record<string, string | undefined>} */
  const env = {
    ...baseEnv,
    PORT: portStr,
    NORI_LAN_MODE: '1',
    NEXT_PUBLIC_SITE_URL: resolvedSiteUrl,
  }
  if (ip) {
    env.NORI_LAN_IP = ip
  } else {
    delete env.NORI_LAN_IP
  }
  return env
}

/**
 * Checks whether a TCP port accepts connections on `host`.
 * @param {number} port
 * @param {string} [host]
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>}
 */
export function isPortListening(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/**
 * Checks whether a TCP port can be bound on a given bind address (detects OS EADDRINUSE safely).
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function canBindPort(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.unref()
    srv.once('error', () => resolve(false))
    srv.listen({ port, host, exclusive: false }, () => {
      srv.close(() => resolve(true))
    })
  })
}

/**
 * Inspects whether TCP `port` is already occupied and identifies the owning process safely without terminating it.
 * @param {number} port
 * @param {string} [cwd]
 * @returns {Promise<{
 *   inUse: boolean;
 *   pid: number | null;
 *   name: string | null;
 *   commandLine: string | null;
 *   localAddress: string | null;
 *   isNoriWorkspace: boolean;
 * }>}
 */
export async function inspectPortOwner(port, cwd = process.cwd()) {
  const numericPort = Number(port)
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    throw new Error(`Số port không hợp lệ: "${port}". Port phải là số nguyên từ 1 đến 65535.`)
  }

  const normalizedCwd = path.resolve(cwd).toLowerCase()

  if (process.platform === 'win32') {
    try {
      const psScript = [
        `$c = Get-NetTCPConnection -LocalPort ${numericPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 LocalAddress,OwningProcess`,
        `if ($c) {`,
        `  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue`,
        `  [PSCustomObject]@{ pid = [int]$c.OwningProcess; localAddress = $c.LocalAddress; name = $p.Name; commandLine = $p.CommandLine } | ConvertTo-Json -Compress`,
        `}`,
      ].join('; ')
      const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (raw) {
        const info = JSON.parse(raw)
        const commandLine = typeof info.commandLine === 'string' ? info.commandLine : null
        const cmdLower = (commandLine ?? '').toLowerCase()
        const isNoriWorkspace =
          cmdLower.includes(normalizedCwd) || cmdLower.includes('nori-vehicle-rental')
        return {
          inUse: true,
          pid: typeof info.pid === 'number' ? info.pid : null,
          name: typeof info.name === 'string' ? info.name : null,
          commandLine,
          localAddress: typeof info.localAddress === 'string' ? info.localAddress : null,
          isNoriWorkspace,
        }
      }
    } catch {
      // Fall back to socket probes below if PowerShell query is unavailable
    }
  }

  const [v4Busy, v6Busy] = await Promise.all([
    isPortListening(numericPort, '127.0.0.1'),
    isPortListening(numericPort, '::1'),
  ])
  if (v4Busy || v6Busy) {
    return {
      inUse: true,
      pid: null,
      name: null,
      commandLine: null,
      localAddress: v4Busy ? '127.0.0.1' : '::1',
      isNoriWorkspace: false,
    }
  }

  const bindFree = await canBindPort(numericPort, '0.0.0.0')
  if (!bindFree) {
    return {
      inUse: true,
      pid: null,
      name: null,
      commandLine: null,
      localAddress: '0.0.0.0',
      isNoriWorkspace: false,
    }
  }

  return {
    inUse: false,
    pid: null,
    name: null,
    commandLine: null,
    localAddress: null,
    isNoriWorkspace: false,
  }
}
