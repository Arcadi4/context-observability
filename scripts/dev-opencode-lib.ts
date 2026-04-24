import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import path from "node:path"

export type LauncherArgs = {
  installTarball: boolean
  noLaunch: boolean
  profileDir: string | null
  runMessage: string
  useGlobal: boolean
}

export type LauncherState = {
  cacheDir: string
  configDir: string
  dataDir: string
  env: NodeJS.ProcessEnv
  pluginRef: string
  profileDir: string
  rootDir: string
  tarballName: string
  tarballPath: string
  tarballRef: string
  useGlobal: boolean
}

type BuildLauncherStateInput = {
  installTarball: boolean
  packageName: string
  packageVersion: string
  profileDir: string | null
  rootDir: string
  useGlobal: boolean
}

type NormalizePluginConfigInput = {
  rootDir: string
  tarballRef: string
}

export function parseLauncherArgs(argv: string[]): LauncherArgs {
  const parsed: LauncherArgs = {
    installTarball: false,
    noLaunch: false,
    profileDir: null,
    runMessage: "",
    useGlobal: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    switch (value) {
      case "--global":
        parsed.useGlobal = true
        break
      case "--profile-dir": {
        const nextValue = argv[index + 1]
        if (!nextValue) throw new Error("Missing value for --profile-dir")
        parsed.profileDir = nextValue
        index += 1
        break
      }
      case "--install-tarball":
        parsed.installTarball = true
        break
      case "--run": {
        const nextValue = argv[index + 1]
        if (!nextValue) throw new Error("Missing value for --run")
        parsed.runMessage = nextValue
        index += 1
        break
      }
      case "--no-launch":
        parsed.noLaunch = true
        break
      case "-h":
      case "--help":
        break
      default:
        throw new Error(`Unknown option: ${value}`)
    }
  }

  return parsed
}

export function buildLauncherState(input: BuildLauncherStateInput): LauncherState {
  const normalizedName = input.packageName.startsWith("@") ? input.packageName.slice(1) : input.packageName
  const tarballName = normalizedName.replaceAll("/", "-") + `-${input.packageVersion}.tgz`
  const tarballPath = path.join(input.rootDir, tarballName)
  const tarballRef = `file:${tarballPath}`
  const profileDir = input.profileDir ?? path.join(input.rootDir, ".opencode-dev")

  if (input.useGlobal) {
    return {
      cacheDir: path.join(process.env.HOME ?? "", ".cache", "opencode"),
      configDir: path.join(process.env.HOME ?? "", ".config", "opencode"),
      dataDir: path.join(process.env.HOME ?? "", ".local", "share", "opencode"),
      env: { ...process.env },
      pluginRef: input.installTarball ? tarballRef : input.rootDir,
      profileDir,
      rootDir: input.rootDir,
      tarballName,
      tarballPath,
      tarballRef,
      useGlobal: true,
    }
  }

  const configRoot = path.join(profileDir, "config")
  const dataRoot = path.join(profileDir, "data")
  const cacheRoot = path.join(profileDir, "cache")

  return {
    cacheDir: path.join(cacheRoot, "opencode"),
    configDir: path.join(configRoot, "opencode"),
    dataDir: path.join(dataRoot, "opencode"),
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: path.join(configRoot, "opencode"),
      XDG_CACHE_HOME: cacheRoot,
      XDG_CONFIG_HOME: configRoot,
      XDG_DATA_HOME: dataRoot,
    },
    pluginRef: input.installTarball ? tarballRef : input.rootDir,
    profileDir,
    rootDir: input.rootDir,
    tarballName,
    tarballPath,
    tarballRef,
    useGlobal: false,
  }
}

export function normalizePluginConfig(source: string, input: NormalizePluginConfigInput): { changed: boolean; json: string } {
  const parsed = JSON.parse(source) as { plugin?: unknown } & Record<string, unknown>
  const plugin = Array.isArray(parsed.plugin) ? parsed.plugin : []
  const filtered = plugin.filter((entry) => entry !== input.rootDir && entry !== input.tarballRef)
  const changed = filtered.length !== plugin.length

  return {
    changed,
    json: `${JSON.stringify({ ...parsed, plugin: filtered }, null, 2)}\n`,
  }
}

export async function ensureIsolatedProfile(state: LauncherState) {
  if (state.useGlobal) return

  await Promise.all([
    mkdir(state.configDir, { recursive: true }),
    mkdir(state.dataDir, { recursive: true }),
    mkdir(state.cacheDir, { recursive: true }),
  ])

  const home = process.env.HOME ?? ""
  await copyIfMissing(path.join(home, ".config", "opencode", "opencode.json"), path.join(state.configDir, "opencode.json"))
  await copyIfMissing(path.join(home, ".config", "opencode", "tui.json"), path.join(state.configDir, "tui.json"))
  await copyIfMissing(path.join(home, ".local", "share", "opencode", "auth.json"), path.join(state.dataDir, "auth.json"))
}

export async function clearIsolatedPackageCache(state: LauncherState) {
  if (state.useGlobal) return
  await rm(path.join(state.cacheDir, "packages"), { force: true, recursive: true })
}

export async function normalizePluginRefs(configPath: string, input: NormalizePluginConfigInput) {
  if (!(await fileExists(configPath))) return

  const source = await readFile(configPath, "utf8")
  const normalized = normalizePluginConfig(source, input)
  if (normalized.changed) {
    await writeFile(configPath, normalized.json)
  }
}

export async function runCommand(command: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  })

  const exitCode = await child.exited
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`)
  }
}

async function copyIfMissing(source: string, target: string) {
  if (!(await fileExists(source)) || (await fileExists(target))) return
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
}

async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}
