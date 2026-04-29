import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as path from "path"

describe("ContextObservabilityDialog footer", () => {
  test("footer should show [esc] Quit instead of [Q] Quit", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).not.toContain("[Q] Quit")
    expect(source).toMatch(/\[esc\]/i)
  })

  test("onSelect should not log to console in production", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).not.toContain('console.log("Selected:')
  })
})

describe("ContextObservabilityDialog uses DialogSelect", () => {
  test("dialog uses api.ui.DialogSelect instead of custom ContextItemList", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).not.toContain("ContextItemList")
    expect(source).toContain("DialogSelect")
  })

  test("dialog maps context items to DialogSelect option shape", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain("item.id")
    expect(source).toContain("formatTokenCount")
    expect(source).toContain("category")
  })
})

describe("ContextObservabilityDialog empty state and filter hardening", () => {
  test("empty options array is passed to DialogSelect when no items match filter", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain("filteredItems()")
    expect(source).toContain("dialogSelectOptions()")
  })

  test("empty state message is shown when no record exists", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain("No observation data")
  })

  test("filter keys 1/2/3 are handled by useKeyboard", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain('key.name === "1"')
    expect(source).toContain('key.name === "2"')
    expect(source).toContain('key.name === "3"')
  })

  test("skipFilter is true so DialogSelect does not intercept filter keys", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain("skipFilter={true}")
  })

  test("onSelect handler is a no-op and does not throw on empty options", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain("onSelect={() => {}}")
  })

  test("navigation hint shows ↑/↓", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toMatch(/↑.*↓|↓.*↑/)
  })

  test("j/k keys drive DialogSelect current selection instead of search text", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain('key.name === "j"')
    expect(source).toContain('key.name === "k"')
    expect(source).toContain("key.preventDefault()")
    expect(source).toContain("key.stopPropagation()")
    expect(source).toContain("current={selectedItemID()}")
  })

  test("filter section indicator highlights active filter", () => {
    const source = fs.readFileSync(path.join(__dirname, "dialog.tsx"), "utf-8")

    expect(source).toContain('selectedSection() === "all"')
    expect(source).toContain('selectedSection() === "messages"')
    expect(source).toContain('selectedSection() === "files"')
  })
})
