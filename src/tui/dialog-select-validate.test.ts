/**
 * Validates native DialogSelect API supports context item fields.
 * Fallback criteria: custom list only if DialogSelect cannot preserve
 * title/value/description/footer/category/onSelect or filter flow.
 */
import type { TuiDialogSelectOption, TuiDialogSelectProps } from "@opencode-ai/plugin/tui"

type TestOption = TuiDialogSelectOption<unknown>
const opt: TestOption = {
  title: "test",
  value: "test-value",
  description: "test item",
  footer: "footer text",
  category: "messages",
  disabled: false,
  onSelect: () => {},
}

type TestProps = TuiDialogSelectProps<unknown>
const props: TestProps = {
  title: "Select Item",
  placeholder: "Search...",
  options: [opt],
  flat: false,
  onFilter: (query) => {},
  onSelect: (o) => {},
  onMove: (o) => {},
  skipFilter: false,
}

// Native api.ui.DialogSelect is preferred over custom list implementation