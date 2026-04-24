import { describe, expect, test } from "bun:test"

import {
  buildLauncherState,
  normalizePluginConfig,
  parseLauncherArgs,
} from "../scripts/dev-opencode-lib.ts"

describe("parseLauncherArgs", () => {
  test("uses local directory install by default", () => {
    expect(parseLauncherArgs([])).toEqual({
      installTarball: false,
      noLaunch: false,
      profileDir: null,
      runMessage: "",
      useGlobal: false,
    })
  })

  test("parses explicit launcher options", () => {
    expect(
      parseLauncherArgs([
        "--global",
        "--profile-dir",
        "/tmp/opencode-dev",
        "--install-tarball",
        "--run",
        "verification ping",
        "--no-launch",
      ]),
    ).toEqual({
      installTarball: true,
      noLaunch: true,
      profileDir: "/tmp/opencode-dev",
      runMessage: "verification ping",
      useGlobal: true,
    })
  })
})

describe("normalizePluginConfig", () => {
  test("removes stale root and tarball refs while preserving others", () => {
    const source = JSON.stringify({
      plugin: [
        "/repo/context-observability",
        "file:/repo/context-observability/pkg.tgz",
        "some-other-plugin",
      ],
      theme: "dark",
    })

    expect(
      normalizePluginConfig(source, {
        rootDir: "/repo/context-observability",
        tarballRef: "file:/repo/context-observability/pkg.tgz",
      }),
    ).toEqual({
      changed: true,
      json: '{\n  "plugin": [\n    "some-other-plugin"\n  ],\n  "theme": "dark"\n}\n',
    })
  })

  test("leaves unrelated config untouched", () => {
    const source = JSON.stringify({ plugin: ["some-other-plugin"], theme: "dark" })

    expect(
      normalizePluginConfig(source, {
        rootDir: "/repo/context-observability",
        tarballRef: "file:/repo/context-observability/pkg.tgz",
      }),
    ).toEqual({
      changed: false,
      json: '{\n  "plugin": [\n    "some-other-plugin"\n  ],\n  "theme": "dark"\n}\n',
    })
  })
})

describe("buildLauncherState", () => {
  test("prefers local directory plugin ref by default", () => {
    expect(
      buildLauncherState({
        packageName: "@4rcadia/opencode-context-observability",
        packageVersion: "0.1.0",
        rootDir: "/repo/context-observability",
        profileDir: null,
        useGlobal: false,
        installTarball: false,
      }),
    ).toMatchObject({
      pluginRef: "/repo/context-observability",
      tarballName: "4rcadia-opencode-context-observability-0.1.0.tgz",
      tarballRef: "file:/repo/context-observability/4rcadia-opencode-context-observability-0.1.0.tgz",
      configDir: "/repo/context-observability/.opencode-dev/config/opencode",
      dataDir: "/repo/context-observability/.opencode-dev/data/opencode",
      cacheDir: "/repo/context-observability/.opencode-dev/cache/opencode",
    })
  })

  test("switches to tarball install when requested", () => {
    expect(
      buildLauncherState({
        packageName: "@4rcadia/opencode-context-observability",
        packageVersion: "0.1.0",
        rootDir: "/repo/context-observability",
        profileDir: "/tmp/dev-profile",
        useGlobal: false,
        installTarball: true,
      }).pluginRef,
    ).toBe("file:/repo/context-observability/4rcadia-opencode-context-observability-0.1.0.tgz")
  })
})
