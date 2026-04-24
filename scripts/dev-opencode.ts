#!/usr/bin/env bun
import path from "node:path"
import { rm } from "node:fs/promises"

import {
  buildLauncherState,
  clearIsolatedPackageCache,
  ensureIsolatedProfile,
  normalizePluginRefs,
  parseLauncherArgs,
  runCommand,
} from "./dev-opencode-lib.ts"

function printUsage() {
  console.log(`Package this plugin, install it into OpenCode, then launch OpenCode.

Usage:
  bun ./scripts/dev-opencode.ts [options]

Options:
  --global                  Install into your real global OpenCode config.
                            Default is an isolated dev profile under ./.opencode-dev/
  --profile-dir <path>      Override the isolated profile directory.
  --install-tarball         Install from the packed .tgz artifact instead of the local directory.
                            Default is the local directory because TUI loading is more reliable in dev.
  --run <message>           Run 'opencode run <message>' instead of launching the TUI.
  --no-launch               Only package + install, do not start OpenCode.
  -h, --help                Show this help.
`)
}

async function main() {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
    printUsage()
    return
  }

  const args = parseLauncherArgs(rawArgs)
  const rootDir = process.cwd()
  const packageJson = await Bun.file(path.join(rootDir, "package.json")).json() as {
    name: string
    version: string
  }

  const state = buildLauncherState({
    installTarball: args.installTarball,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    profileDir: args.profileDir,
    rootDir,
    useGlobal: args.useGlobal,
  })

  await ensureRequirements()

  console.log("==> Packing plugin")
  await rm(state.tarballPath, { force: true })
  await runCommand(["bun", "pm", "pack"], { cwd: state.rootDir })

  await ensureIsolatedProfile(state)
  await clearIsolatedPackageCache(state)

  await normalizePluginRefs(path.join(state.configDir, "opencode.json"), state)
  await normalizePluginRefs(path.join(state.configDir, "tui.json"), state)

  console.log("==> Installing plugin")
  console.log(`    package: ${state.pluginRef}`)
  console.log(`    packed:  ${state.tarballRef}`)
  console.log(`    config:  ${state.configDir}`)
  await runCommand(["opencode", "plugin", state.pluginRef, "--global", "--force"], {
    cwd: state.rootDir,
    env: state.env,
  })

  if (args.noLaunch) {
    console.log("==> Done (install only)")
    return
  }

  console.log("==> Launching OpenCode")
  if (args.runMessage) {
    await runCommand(["opencode", "run", args.runMessage], {
      cwd: state.rootDir,
      env: state.env,
    })
    return
  }

  await runCommand(["opencode", state.rootDir], {
    cwd: state.rootDir,
    env: state.env,
  })
}

async function ensureRequirements() {
  if (!Bun.which("bun")) {
    throw new Error("bun is required but was not found in PATH.")
  }

  if (!Bun.which("opencode")) {
    throw new Error("opencode is required but was not found in PATH.")
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
