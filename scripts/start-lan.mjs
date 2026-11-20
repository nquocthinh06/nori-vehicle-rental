import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildLanChildEnv, detectLanIPv4, inspectPortOwner } from './lan-network.mjs'
import { checkDatabaseCompatibility } from './check-db-schema.mjs'

function parseArgs(argv) {
  const opts = {
    ip: null,
    port: null,
    host: null,
    check: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      opts.help = true
    } else if (arg === '--check' || arg === '-c') {
      opts.check = true
    } else if (arg === '--ip' && argv[i + 1]) {
      opts.ip = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--ip=')) {
      opts.ip = arg.slice(5)
    } else if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      opts.port = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--port=')) {
      opts.port = arg.slice(7)
    } else if ((arg === '--host' || arg === '-H') && argv[i + 1]) {
      opts.host = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--host=')) {
      opts.host = arg.slice(7)
    }
  }
  return opts
}

function loadEnvDefaults(envPath) {
  /** @type {Record<string, string>} */
  const map = {}
  if (!fs.existsSync(envPath)) return map
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    map[key] = val
  }
  return map
}

function resolveDbSummary(envFileMap) {
  const uri =
    process.env.NORI_SQLITE_PATH?.trim() ||
    process.env.DATABASE_URI?.trim() ||
    envFileMap.NORI_SQLITE_PATH?.trim() ||
    envFileMap.DATABASE_URI?.trim() ||
    'file:./nori.db'
  const stripped = uri.startsWith('file:') ? uri.slice(5) : uri
  return `SQLite (${path.basename(stripped) || 'nori.db'})`
}

function printHelp() {
  console.log(`
NORI Vehicle Rental — LAN Development Launcher

Cách dùng:
  pnpm dev:lan                         Khởi chạy LAN server trên 0.0.0.0:3000 (tự nhận diện Wi-Fi/Ethernet IPv4)
  pnpm dev:lan -- --check              Kiểm tra IPv4 LAN, banner URL và trạng thái cổng 3000 mà không bật server
  pnpm dev:lan -- --ip 192.168.1.7     Chỉ định thủ công IPv4 LAN nếu máy có nhiều card mạng
  pnpm dev:lan -- --port 3001          Dùng port khác khi port 3000 đang có ứng dụng khác (không phải Next dev NORI)

Biến môi trường hỗ trợ (tùy chọn):
  NORI_LAN_IP                          Ghi đè IPv4 LAN hiển thị & allowlist trong Next dev
  PORT                                 Cổng HTTP (mặc định: 3000)
  NORI_LAN_BIND_HOST                   Địa chỉ bind socket (mặc định: 0.0.0.0)
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const rootDir = process.cwd()
  const envFileMap = loadEnvDefaults(path.resolve(rootDir, '.env'))

  const portRaw = args.port ?? process.env.PORT ?? envFileMap.PORT ?? '3000'
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[NORI LAN] Port không hợp lệ: "${portRaw}". Vui lòng chọn số nguyên 1..65535.`)
    process.exit(1)
  }

  const bindHost = (args.host ?? process.env.NORI_LAN_BIND_HOST ?? '0.0.0.0').trim() || '0.0.0.0'
  const explicitIp = args.ip ?? process.env.NORI_LAN_IP ?? envFileMap.NORI_LAN_IP ?? null

  const portOwner = await inspectPortOwner(port, rootDir)
  let detected
  try {
    detected = detectLanIPv4({ explicitIp })
  } catch (err) {
    console.error(`[NORI LAN] ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const childEnv = buildLanChildEnv({
    baseEnv: process.env,
    port,
    detected,
  })

  const lanUrl = detected.ip ? `http://${detected.ip}:${port}` : '(Chưa phát hiện IPv4 Wi-Fi/LAN)'
  const localUrl = `http://localhost:${port}`

  const printBanner = () => {
    console.log('')
    console.log('========================================')
    console.log('       NORI VEHICLE RENTAL SERVER')
    console.log('========================================')
    console.log('Mode       : LAN Development')
    console.log(`Bind       : ${bindHost}`)
    console.log(`Local      : ${localUrl}`)
    console.log(`Network    : ${lanUrl}`)
    console.log(`Site URL   : ${childEnv.NEXT_PUBLIC_SITE_URL}`)
    if (detected.ip) {
      console.log(
        `Interface  : ${detected.interfaceName} (${detected.source === 'manual' ? 'chỉ định thủ công' : 'tự động nhận diện'})`,
      )
    }
    console.log(`Port       : ${port}`)
    console.log(
      `Port Status: ${portOwner.inUse ? `Đang bận (PID ${portOwner.pid ?? 'không rõ'})` : 'Sẵn sàng'}`,
    )
    console.log(`Database   : ${resolveDbSummary(envFileMap)}`)
    if (detected.warning) {
      console.log('----------------------------------------')
      console.log(`[Cảnh báo] ${detected.warning}`)
    }
    if (bindHost === '::' || bindHost === '[::]') {
      console.log('----------------------------------------')
      console.log(
        '[Cảnh báo bảo mật] Đang bind trên "::" (IPv6 wildcard) — có thể tiếp nhận kết nối IPv6 công khai ra ngoài mạng LAN. Khuyên dùng mặc định 0.0.0.0.',
      )
    }
    if (detected.ip) {
      console.log('----------------------------------------')
      console.log(`Login      : ${lanUrl}/login`)
      console.log(`Dashboard  : ${lanUrl}/dashboard`)
      console.log(`Payload CMS: ${lanUrl}/admin`)
    } else {
      console.log('----------------------------------------')
      console.log(
        '[Cảnh báo] Không tìm thấy IPv4 mạng LAN khả dụng (mạng chưa kết nối hoặc chỉ có adapter ảo).',
      )
      console.log('Bạn có thể chỉ định thủ công: pnpm dev:lan -- --ip <IPv4_của_máy>')
    }
    if (detected.candidates.length > 1) {
      console.log(
        `Adapters   : ${detected.candidates.map((c) => `${c.interfaceName}=${c.ip}`).join(', ')}`,
      )
    }
    console.log('========================================')
    console.log('')
  }

  if (args.check) {
    printBanner()
    return
  }

  if (portOwner.inUse) {
    console.error('')
    console.error('========================================')
    console.error(`  CỔNG ${port} ĐANG ĐƯỢC SỬ DỤNG (XUNG ĐỘT PORT)`)
    console.error('========================================')
    console.error(
      `Tiến trình giữ cổng : ${portOwner.name ?? 'Không rõ'}${portOwner.pid ? ` (PID ${portOwner.pid})` : ''}`,
    )
    if (portOwner.localAddress) {
      console.error(`Địa chỉ đang lắng   : ${portOwner.localAddress}:${port}`)
    }
    console.error(
      `Thuộc workspace NORI: ${portOwner.isNoriWorkspace ? 'Có (Next dev NORI đang giữ .next/dev/lock)' : 'Không xác định / ứng dụng khác'}`,
    )
    console.error('')
    console.error('Hệ thống KHÔNG tự động tắt tiến trình để tránh ảnh hưởng công việc đang chạy.')
    if (portOwner.isNoriWorkspace) {
      console.error(
        'Lưu ý Next.js 16 khóa `.next/dev/lock` theo thư mục dự án — cần dừng server cũ trước khi mở `pnpm dev:lan`:',
      )
      if (portOwner.pid) {
        console.error(
          `  - Dừng bằng Ctrl+C ở cửa sổ gốc hoặc chạy: Stop-Process -Id ${portOwner.pid}`,
        )
      } else {
        console.error(`  - Dừng cửa sổ đang chạy \`pnpm dev\``)
      }
      console.error(`  - Sau đó chạy lại: pnpm dev:lan`)
    } else {
      console.error('Vui lòng chọn một trong hai cách:')
      console.error(`  1. Đóng ứng dụng đang dùng cổng ${port}, rồi chạy lại pnpm dev:lan`)
      console.error(
        `  2. Hoặc chạy NORI LAN trên cổng khác: pnpm dev:lan -- --port ${port === 3000 ? 3001 : port + 1}`,
      )
    }
    console.error('========================================')
    process.exit(1)
  }

  const nextBin = path.resolve(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  if (!fs.existsSync(nextBin)) {
    console.error('[NORI LAN] Không tìm thấy Next.js CLI. Vui lòng chạy `pnpm install` trước.')
    process.exit(1)
  }

  // Preflight Database Compatibility Guard
  const dbCheck = checkDatabaseCompatibility({ rootDir })
  if (!dbCheck.ok) {
    console.error('\n========================================================')
    console.error(' [NORI LAN BLOCKED] DATABASE SCHEMA MISMATCH / PENDING MIGRATION')
    console.error('========================================================')
    console.error(`Database:  ${dbCheck.dbPath}`)
    console.error(`Integrity: ${dbCheck.integrity} (FK Violations: ${dbCheck.fkViolations})`)
    if (dbCheck.missingColumns && Object.keys(dbCheck.missingColumns).length > 0) {
      console.error('\nMissing columns detected:')
      for (const [table, cols] of Object.entries(dbCheck.missingColumns)) {
        console.error(`  - Table "${table}": missing [${cols.join(', ')}]`)
      }
    }
    if (dbCheck.pendingMigrations?.length > 0) {
      console.error(`\nPending migrations: [${dbCheck.pendingMigrations.join(', ')}]`)
    }
    console.error(
      '\nHướng dẫn xử lý: Vui lòng chạy lệnh migration an toàn trước khi chạy LAN server:',
    )
    console.error('  pnpm db:migrate')
    console.error('========================================================\n')
    process.exit(1)
  }

  printBanner()

  const child = spawn(
    process.execPath,
    [nextBin, 'dev', '--hostname', bindHost, '--port', String(port)],
    {
      cwd: rootDir,
      env: childEnv,
      stdio: 'inherit',
    },
  )

  let shuttingDown = false
  let childExited = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let killTimer = null

  const shutdown = (sig) => {
    if (childExited || shuttingDown) return
    shuttingDown = true
    if (!child.killed) {
      try {
        child.kill(sig)
      } catch {
        // ignore signal forwarding errors
      }
    }
    if (process.platform === 'win32' && child.pid) {
      killTimer = setTimeout(() => {
        if (!childExited && child.pid) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        }
      }, 2500)
      killTimer.unref()
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  child.on('exit', (code, signal) => {
    childExited = true
    if (killTimer) {
      clearTimeout(killTimer)
      killTimer = null
    }
    if (shuttingDown) {
      process.exit(0)
      return
    }
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

main().catch((err) => {
  console.error('[NORI LAN] Lỗi khởi chạy:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
