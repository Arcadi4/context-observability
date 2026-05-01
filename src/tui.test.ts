import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as path from "path"

describe("TUI command registration", () => {
  const source = fs.readFileSync(path.join(__dirname, "tui.tsx"), "utf-8")

  test("keeps /context slash command registration intact", () => {
    expect(source).toContain('const commandName = typeof options?.commandName === "string" ? options.commandName : "context"')
    expect(source).toContain("api.command.register")
    expect(source).toContain("slash:")
    expect(source).toContain("name: commandName")
  })

  test("keeps command-palette path grouped under Context", () => {
    expect(source).toContain('title: "Context Observability"')
    expect(source).toContain('category: "Context"')
    expect(source).toContain('value: `${commandName}.overview`')
  })

  test("command-palette selection opens the dialog with fallback data", () => {
    expect(source).toContain("onSelect()")
    expect(source).toContain("buildTuiFallbackRecord(api, sessionID)")
    expect(source).toContain("api.ui.dialog.replace")
    expect(source).toContain("<ContextObservabilityDialog")
    expect(source).toContain("fallbackRecord={fallbackRecord}")
  })
})
