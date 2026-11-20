import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLanChildEnv,
  detectLanIPv4,
  getLocalLanIPv4List,
  isPrivateLanIPv4,
  isValidIPv4,
  isVirtualInterfaceName,
  scoreInterface,
} from '../scripts/lan-network.mjs'

test('LAN IPv4 validation & RFC1918 private subnet matching', () => {
  assert.equal(isValidIPv4('192.168.1.7'), true)
  assert.equal(isValidIPv4('10.0.0.15'), true)
  assert.equal(isValidIPv4('172.16.0.1'), true)
  assert.equal(isValidIPv4('0.0.0.0'), true)
  assert.equal(isValidIPv4('256.1.1.1'), false)
  assert.equal(isValidIPv4('192.168.01.7'), false)
  assert.equal(isValidIPv4('localhost'), false)
  assert.equal(isValidIPv4(''), false)

  assert.equal(isPrivateLanIPv4('192.168.1.7'), true)
  assert.equal(isPrivateLanIPv4('10.12.3.4'), true)
  assert.equal(isPrivateLanIPv4('172.20.10.2'), true)
  assert.equal(isPrivateLanIPv4('172.32.0.1'), false)
  assert.equal(isPrivateLanIPv4('127.0.0.1'), false)
  assert.equal(isPrivateLanIPv4('169.254.27.66'), false)
  assert.equal(isPrivateLanIPv4('8.8.8.8'), false)
})

test('Virtual adapter filtering excludes Loopback, WSL, VMware, VirtualBox, Docker, Tailscale & Wi-Fi Direct', () => {
  for (const virtualName of [
    'Loopback Pseudo-Interface 1',
    'vEthernet (Default Switch)',
    'vEthernet (WSL)',
    'VMware Network Adapter VMnet8',
    'VirtualBox Host-Only Network',
    'Local Area Connection* 1',
    'Local Area Connection* 2',
    'Tailscale',
    'ZeroTier One',
    'DockerNAT',
    'Bluetooth Network Connection',
  ]) {
    assert.equal(
      isVirtualInterfaceName(virtualName),
      true,
      `Expected virtual adapter rejected: ${virtualName}`,
    )
  }

  for (const physicalName of ['Wi-Fi', 'Ethernet', 'WLAN', 'en0', 'eth0', 'enp3s0']) {
    assert.equal(
      isVirtualInterfaceName(physicalName),
      false,
      `Expected physical adapter accepted: ${physicalName}`,
    )
  }
})

test('detectLanIPv4 prioritizes Wi-Fi over Ethernet and ignores virtual/link-local adapters', () => {
  const mockInterfaces = {
    'Loopback Pseudo-Interface 1': [
      { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
    ],
    'Local Area Connection* 2': [
      { address: '169.254.169.233', netmask: '255.255.0.0', family: 'IPv4', internal: false },
    ],
    'vEthernet (WSL)': [
      { address: '172.29.160.1', netmask: '255.255.240.0', family: 'IPv4', internal: false },
    ],
    'VMware Network Adapter VMnet8': [
      { address: '192.168.152.1', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    ],
    Ethernet: [{ address: '10.0.5.22', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
    'Wi-Fi': [
      { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false },
      { address: '192.168.1.7', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    ],
  }

  const detected = detectLanIPv4({ interfaces: mockInterfaces })
  assert.equal(detected.ip, '192.168.1.7')
  assert.equal(detected.interfaceName, 'Wi-Fi')
  assert.equal(detected.source, 'auto')

  const list = getLocalLanIPv4List(mockInterfaces)
  assert.deepEqual(list, ['192.168.1.7', '10.0.5.22'])
})

test('detectLanIPv4 falls back to Ethernet when Wi-Fi is unavailable and supports manual override', () => {
  const ethernetOnly = {
    Ethernet: [
      { address: '192.168.10.42', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    ],
    'vEthernet (Default Switch)': [
      { address: '172.24.0.1', netmask: '255.255.240.0', family: 'IPv4', internal: false },
    ],
  }
  const ethDetected = detectLanIPv4({ interfaces: ethernetOnly })
  assert.equal(ethDetected.ip, '192.168.10.42')
  assert.equal(ethDetected.interfaceName, 'Ethernet')
  assert.equal(ethDetected.source, 'auto')

  const manual = detectLanIPv4({ explicitIp: '10.20.30.40', interfaces: ethernetOnly })
  assert.equal(manual.ip, '10.20.30.40')
  assert.equal(manual.interfaceName, 'manual')
  assert.equal(manual.source, 'manual')

  assert.throws(() => detectLanIPv4({ explicitIp: '999.999.1.1', interfaces: ethernetOnly }))
  assert.throws(() => detectLanIPv4({ explicitIp: '0.0.0.0', interfaces: ethernetOnly }))

  const empty = detectLanIPv4({
    interfaces: {
      'Loopback Pseudo-Interface 1': [
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
      ],
    },
  })
  assert.equal(empty.ip, null)
  assert.equal(empty.source, 'none')
  assert.equal(scoreInterface('Wi-Fi', '169.254.1.2'), -1)
})

test('Wi-Fi Switching & Dynamic IPv4: 10 Interface Scenarios & Child Env Propagation', () => {
  // 1. Different Wi-Fi subnet (e.g. 192.168.50.14 on a guest or separate home router)
  const subnet50 = {
    'Wi-Fi': [
      { address: '192.168.50.14', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    ],
  }
  const res1 = detectLanIPv4({ interfaces: subnet50 })
  assert.equal(res1.ip, '192.168.50.14')
  assert.equal(res1.interfaceName, 'Wi-Fi')
  assert.equal(res1.source, 'auto')

  // 2. DHCP IP change (e.g. 192.168.1.7 -> 192.168.1.88) & dynamic NEXT_PUBLIC_SITE_URL propagation
  const dhcpNew = {
    'Wi-Fi': [
      { address: '192.168.1.88', netmask: '255.255.255.0', family: 'IPv4', internal: false },
    ],
  }
  const res2 = detectLanIPv4({ interfaces: dhcpNew })
  assert.equal(res2.ip, '192.168.1.88')
  const env2 = buildLanChildEnv({
    baseEnv: { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
    port: 3000,
    detected: res2,
  })
  assert.equal(env2.NEXT_PUBLIC_SITE_URL, 'http://192.168.1.88:3000')
  assert.equal(env2.NORI_LAN_IP, '192.168.1.88')

  // 3. Ethernet-only connection (e.g. office workstation with Wi-Fi disabled)
  const ethWorkstation = {
    Ethernet: [{ address: '10.20.1.55', netmask: '255.255.0.0', family: 'IPv4', internal: false }],
  }
  const res3 = detectLanIPv4({ interfaces: ethWorkstation })
  assert.equal(res3.ip, '10.20.1.55')
  assert.equal(res3.interfaceName, 'Ethernet')
  assert.equal(res3.source, 'auto')

  // 4. Mobile Hotspot (iPhone 172.20.10.x / Android 192.168.43.x)
  const iphoneHotspot = {
    'Wi-Fi': [
      { address: '172.20.10.3', netmask: '255.255.255.240', family: 'IPv4', internal: false },
    ],
  }
  const res4 = detectLanIPv4({ interfaces: iphoneHotspot })
  assert.equal(res4.ip, '172.20.10.3')
  assert.equal(res4.interfaceName, 'Wi-Fi')

  // 5. Multiple simultaneous adapters (Wi-Fi + Ethernet + WSL + Hyper-V + VMware + VirtualBox + Docker)
  const multiAdapters = {
    'vEthernet (WSL)': [{ address: '172.28.0.1', family: 'IPv4', internal: false }],
    'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '10.0.0.12', family: 'IPv4', internal: false }],
    'Wi-Fi': [{ address: '192.168.1.7', family: 'IPv4', internal: false }],
  }
  const res5 = detectLanIPv4({ interfaces: multiAdapters })
  assert.equal(res5.ip, '192.168.1.7') // Wi-Fi scored higher than Ethernet and virtuals rejected
  assert.deepEqual(getLocalLanIPv4List(multiAdapters), ['192.168.1.7', '10.0.0.12'])

  // 6. VPN connected (WireGuard / Tailscale / ProtonVPN alongside Wi-Fi)
  const withVpn = {
    Tailscale: [{ address: '100.64.0.5', family: 'IPv4', internal: false }],
    WireGuard: [{ address: '10.8.0.2', family: 'IPv4', internal: false }],
    'Wi-Fi': [{ address: '192.168.1.7', family: 'IPv4', internal: false }],
  }
  const res6 = detectLanIPv4({ interfaces: withVpn })
  assert.equal(res6.ip, '192.168.1.7')
  assert.equal(res6.interfaceName, 'Wi-Fi')

  // 7. No suitable interface (Loopback + APIPA link-local only) -> graceful fallback
  const noValid = {
    'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', internal: true, family: 'IPv4' }],
    'Local Area Connection* 1': [{ address: '169.254.12.34', internal: false, family: 'IPv4' }],
  }
  const res7 = detectLanIPv4({ interfaces: noValid })
  assert.equal(res7.ip, null)
  assert.equal(res7.source, 'none')
  assert.equal(res7.matchedLocalInterface, false)
  const env7 = buildLanChildEnv({
    baseEnv: { NORI_LAN_IP: '192.168.1.7', NEXT_PUBLIC_SITE_URL: 'http://192.168.1.7:3000' },
    port: 3000,
    detected: res7,
  })
  assert.equal(env7.NEXT_PUBLIC_SITE_URL, 'http://localhost:3000')
  assert.equal(env7.NORI_LAN_IP, undefined) // stale IP pruned

  // 8. Manual IPv4 matching an active local adapter
  const manualLocal = detectLanIPv4({ explicitIp: '10.0.0.12', interfaces: multiAdapters })
  assert.equal(manualLocal.ip, '10.0.0.12')
  assert.equal(manualLocal.source, 'manual')
  assert.equal(manualLocal.matchedLocalInterface, true)
  assert.equal(manualLocal.warning, null)

  // 9. Manual IPv4 NOT belonging to any local interface -> warning produced
  const manualMismatch = detectLanIPv4({ explicitIp: '192.168.99.200', interfaces: multiAdapters })
  assert.equal(manualMismatch.ip, '192.168.99.200')
  assert.equal(manualMismatch.source, 'manual')
  assert.equal(manualMismatch.matchedLocalInterface, false)
  assert.ok(manualMismatch.warning?.includes('không thuộc card mạng'))

  // 10. Disconnect -> reconnect transition
  let dynamicState = detectLanIPv4({
    interfaces: { 'Wi-Fi': [{ address: '192.168.1.7', family: 'IPv4', internal: false }] },
  })
  assert.equal(dynamicState.ip, '192.168.1.7')
  // Disconnect
  dynamicState = detectLanIPv4({ interfaces: {} })
  assert.equal(dynamicState.ip, null)
  assert.equal(dynamicState.source, 'none')
  // Reconnect on new network
  dynamicState = detectLanIPv4({
    interfaces: { 'Wi-Fi': [{ address: '192.168.1.145', family: 'IPv4', internal: false }] },
  })
  assert.equal(dynamicState.ip, '192.168.1.145')
  const env10 = buildLanChildEnv({ port: 3000, detected: dynamicState })
  assert.equal(env10.NEXT_PUBLIC_SITE_URL, 'http://192.168.1.145:3000')
})
