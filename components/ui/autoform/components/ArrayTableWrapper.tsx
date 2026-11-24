"use client";
// From the AutoForm docs' array table demo (vantezzen/autoform PR #209), with options for this app (see TableOptions).

import type { ArrayElementWrapperProps, ArrayWrapperProps, AutoFormFieldProps } from "@autoform/react";
import { useAutoForm } from "@autoform/react/react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormContext, useFormState } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ParsedField = ArrayWrapperProps["parsedField"];

/**
 * Per-table options, set on the array with `fieldConfig({ arrayWrapper: ArrayTableWrapper, customData: {...} })`.
 * - fixedRows: no "Add row" and no remove buttons (the rows are given, only their cells change).
 * - maxRows: "Add row" (or the AddControls) disappear at this many rows.
 * - AddControls: replaces the "Add row" button, e.g. preset rows. `add(values)` adds a row with those values.
 * - emptyText: shown when there are no rows.
 * A column with `customData: { hidden: true }` is kept in the values but not shown.
 */
export type TableOptions = {
  fixedRows?: boolean;
  maxRows?: number;
  AddControls?: React.ComponentType<{ add: (values?: Record<string, unknown>) => void }>;
  emptyText?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

type Cell = { row: number; column: number };

/** Focusable controls a cell editor may render (input, select trigger, …). */
const EDITOR_SELECTOR =
  "input:not([type='hidden']):not(:disabled), textarea:not(:disabled), button:not(:disabled), [role='combobox']";

const ARROW_MOVES: Record<string, [row: number, column: number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

const isPrintableKey = (event: React.KeyboardEvent) => event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;

const isSameCell = (a: Cell | null, b: Cell) => a?.row === b.row && a.column === b.column;

/** AutoForm's own label rule (@autoform/core getLabel): the configured label, the description, or the key. */
function getLabel(field: ParsedField): React.ReactNode {
  const label = field.fieldConfig?.label || field.description;
  if (label) return label as React.ReactNode;
  const key = field.key.replace(/([A-Z])/g, " $1");
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** A field's label as plain text, for aria attributes. */
const labelText = (field: ParsedField) => {
  const label = getLabel(field);
  return typeof label === "string" ? label : field.key;
};

/** Next cell for Tab / Shift+Tab, wrapping across rows. */
function tabTarget(cell: Cell, rows: number, columns: number, back: boolean) {
  const index = cell.row * columns + cell.column + (back ? -1 : 1);
  if (index < 0 || index >= rows * columns) return null;
  return { row: Math.floor(index / columns), column: index % columns };
}

/**
 * Replaces an input's value as if the user typed `character`. React tracks
 * input values internally, so the native setter is needed for onChange to fire.
 * Number and date inputs reject some characters; those leave the value as is.
 */
function typeInto(editor: HTMLElement, character: string) {
  if (!(editor instanceof HTMLInputElement) || editor.type === "checkbox") return;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  const previous = editor.value;
  setValue?.call(editor, character);
  if (editor.value !== character) return setValue?.call(editor, previous);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Strips the AutoForm controls' own borders so each cell looks flush. */
const GRID_STYLES = [
  // Editor wrapper fills the cell.
  "[&_[data-grid-editor]]:flex [&_[data-grid-editor]]:h-9 [&_[data-grid-editor]]:items-center",
  "[&_[data-grid-editor]>*]:h-full [&_[data-grid-editor]>*]:w-full",
  // Inputs (text, number, date) and select triggers. `ring-offset` must be
  // reset too: shadcn's focus ring-offset paints a background-colored halo.
  "[&_[data-grid-editor]_input]:h-full [&_[data-grid-editor]_input]:w-full [&_[data-grid-editor]_input]:px-2.5",
  "[&_[data-grid-editor]_input]:!rounded-none [&_[data-grid-editor]_input]:!border-0",
  "[&_[data-grid-editor]_input]:!bg-transparent [&_[data-grid-editor]_input]:!shadow-none",
  "[&_[data-grid-editor]_input]:!ring-0 [&_[data-grid-editor]_input]:!ring-offset-0",
  "[&_[data-grid-editor]_[role=combobox]]:h-full [&_[data-grid-editor]_[role=combobox]]:w-full [&_[data-grid-editor]_[role=combobox]]:px-2.5",
  "[&_[data-grid-editor]_[role=combobox]]:!rounded-none [&_[data-grid-editor]_[role=combobox]]:!border-0",
  "[&_[data-grid-editor]_[role=combobox]]:!bg-transparent [&_[data-grid-editor]_[role=combobox]]:!shadow-none",
  "[&_[data-grid-editor]_[role=combobox]]:!ring-0 [&_[data-grid-editor]_[role=combobox]]:!ring-offset-0",
  // Checkbox labels repeat the column header, so hide them visually.
  "[&_[data-grid-editor]_label]:sr-only",
].join(" ");

// ── Keyboard navigation ──────────────────────────────────────────────────────

/**
 * Spreadsheet-style focus model: one cell is "active" (focused) and at most one
 * is "editing" (its control is interactive). With remove buttons, the last column
 * holds them, and Enter and Space press them like any button. Focus moves are
 * requested through a ref and applied once the target cell has rendered.
 */
function useGridKeyboard(rowCount: number, columnCount: number, actionColumn: number | null) {
  const tableRef = React.useRef<HTMLTableElement>(null);
  const pendingFocus = React.useRef<{ cell: Cell; edit: boolean; character?: string } | null>(null);
  const [active, setActive] = React.useState<Cell | null>(null);
  const [editing, setEditing] = React.useState<Cell | null>(null);

  React.useLayoutEffect(() => {
    const request = pendingFocus.current;
    const element = request ? tableRef.current?.querySelector<HTMLElement>(`[data-grid-cell="${request.cell.row}:${request.cell.column}"]`) : null;
    // A new row may not have rendered yet; keep the request until it has.
    if (!request || !element) return;
    pendingFocus.current = null;
    const editor = request.edit ? element.querySelector<HTMLElement>(EDITOR_SELECTOR) : null;
    if (!editor) return element.focus();
    editor.focus();
    // Enter "presses" the control: opens a select, toggles a checkbox.
    if (request.character === undefined) editor.click();
    else typeInto(editor, request.character);
  });

  const focusCell = (cell: Cell) => {
    setEditing(null);
    setActive(cell);
    pendingFocus.current = { cell, edit: false };
  };

  const startEditing = (cell: Cell, character?: string) => {
    setActive(cell);
    setEditing(cell);
    pendingFocus.current = { cell, edit: true, character };
  };

  const moveByTab = (cell: Cell, back: boolean) => {
    const next = tabTarget(cell, rowCount, columnCount, back);
    if (next) focusCell(next);
    return next !== null;
  };

  /**
   * AutoForm's boolean field submits the form on Enter. Inside the grid,
   * Enter on a checkbox only leaves edit mode.
   */
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (!editing || event.key !== "Enter") return;
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest("[role='checkbox']")) return;
    event.preventDefault();
    event.stopPropagation();
    focusCell(editing);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest("[data-grid-cell]")) return;

    if (editing) {
      const commitsInput = event.key === "Enter" && event.target instanceof HTMLInputElement;
      if (event.key === "Escape" || commitsInput) {
        event.preventDefault();
        focusCell(editing);
      } else if (event.key === "Tab") {
        if (moveByTab(editing, event.shiftKey)) event.preventDefault();
        else setEditing(null);
      }
      return;
    }
    if (!active) return;

    const move = ARROW_MOVES[event.key];
    if (move) {
      event.preventDefault();
      focusCell({
        row: Math.max(0, Math.min(rowCount - 1, active.row + move[0])),
        column: Math.max(0, Math.min(columnCount - 1, active.column + move[1])),
      });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const column = event.key === "Home" ? 0 : columnCount - 1;
      focusCell({ row: active.row, column });
    } else if (event.key === "Tab") {
      if (moveByTab(active, event.shiftKey)) event.preventDefault();
    } else if (active.column === actionColumn) {
      // Let the remove button handle Enter and Space natively.
    } else if (event.key === "Enter") {
      event.preventDefault();
      startEditing(active);
    } else if (isPrintableKey(event)) {
      event.preventDefault();
      // Space toggles a checkbox; any other key starts typing a new value.
      startEditing(active, event.key === " " ? undefined : event.key);
    }
  };

  return {
    tableRef,
    onKeyDown,
    onKeyDownCapture,
    grid: { active, editing, setActive, setEditing, focusCell, startEditing },
  };
}

// ── Array wrapper ────────────────────────────────────────────────────────────

/**
 * Lays out an array of objects as an editable table. Set it on one array with
 * `fieldConfig({ arrayWrapper: ArrayTableWrapper })`.
 *
 * AutoForm still owns the array: it creates the rows (with stable keys and
 * their remove handlers), adds items with the schema defaults and validates
 * them. This wrapper only changes the layout. Instead of each row's generated
 * object field, it renders one cell per column with the AutoForm component
 * registered for that column's type (a custom `fieldType` gives a read-only or
 * computed column).
 *
 * Limitations: columns should be scalar fields (text, number, date, select,
 * boolean). Because the generated row field is not rendered, per-field wrapper
 * overrides of the columns are not shown. A `.superRefine()` on the item schema
 * shows its message when the issue's path is a column. Invalid cells are outlined
 * in red with their message shown inline.
 */
export function ArrayTableWrapper({ label, error, children, onAddItem, inputProps, parsedField }: ArrayWrapperProps) {
  const { key, ref, "aria-invalid": ariaInvalid } = inputProps;
  const options = (parsedField.fieldConfig?.customData ?? {}) as TableOptions;
  // AutoForm passes no path to array wrappers. Its React Hook Form ArrayField
  // sets the add button's `key` to `${path}-input`, so the path comes from it.
  const path = String(key).replace(/-input$/, "").split(".");
  const rows = React.Children.toArray(children).filter(React.isValidElement<ArrayElementWrapperProps>);
  const allColumns = parsedField.schema?.[0]?.schema ?? [];
  const columns = allColumns.filter((c) => !(c.fieldConfig?.customData as { hidden?: boolean } | undefined)?.hidden);
  const removable = !options.fixedRows;
  const canAdd = !options.fixedRows && (options.maxRows === undefined || rows.length < options.maxRows);
  // With remove buttons, the last grid column holds them.
  const { tableRef, onKeyDown, onKeyDownCapture, grid } = useGridKeyboard(
    rows.length,
    columns.length + (removable ? 1 : 0),
    removable ? columns.length : null,
  );
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const { getValues, setValue } = useFormContext();

  // AutoForm appends only the schema defaults. React Hook Form shows a column
  // left `undefined` with the `defaultValues` entry that once sat at this
  // index, so fill those columns: the given value, else `false` for booleans,
  // otherwise `""`, which AutoForm treats as empty.
  const addRow = (values: Record<string, unknown> = {}) => {
    const rowPath = [...path, String(rows.length)];
    onAddItem();
    for (const column of allColumns) {
      const name = [...rowPath, column.key].join(".");
      if (column.key in values) setValue(name, values[column.key]);
      else if (getValues(name) === undefined) setValue(name, column.type === "boolean" ? false : "");
    }
    grid.focusCell({ row: rows.length, column: 0 });
  };

  // Keep focus in the table: on the next row's remove button, or on
  // "Add row" once the table is empty.
  const removeRow = (row: ArrayElementWrapperProps, rowIndex: number) => {
    row.onRemove();
    if (rows.length === 1) {
      grid.setActive(null);
      addButtonRef.current?.focus();
    } else {
      const next = Math.min(rowIndex, rows.length - 2);
      grid.focusCell({ row: next, column: columns.length });
    }
  };

  const AddControls = options.AddControls;

  return (
    <div className="not-prose space-y-3">
      <div className="space-y-1">
        {/* AutoForm focuses this heading when the array itself is invalid. */}
        <h3 ref={ref} tabIndex={-1} aria-invalid={ariaInvalid} className="text-sm font-medium outline-none">
          {label}
        </h3>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className={cn("overflow-x-auto rounded-lg border", error ? "border-destructive" : undefined, "has-[td[aria-invalid=true]]:border-destructive")}>
        <table
          ref={tableRef}
          role="grid"
          aria-label={labelText(parsedField)}
          className={cn("w-full text-sm", GRID_STYLES)}
          onKeyDownCapture={onKeyDownCapture}
          onKeyDown={onKeyDown}
        >
          <thead className="bg-muted/40">
            <tr className="border-b">
              {columns.map((column) => (
                <th key={column.key} scope="col" className="whitespace-nowrap px-2.5 py-2 text-left font-medium">
                  {getLabel(column)}
                </th>
              ))}
              {removable && (
                <th scope="col" className="w-10">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.key} className="[&:last-child>td]:border-b-0">
                {columns.map((column, columnIndex) => (
                  <ArrayTableCell
                    key={column.key}
                    grid={grid}
                    cell={{ row: rowIndex, column: columnIndex }}
                    column={column}
                    path={[...path, String(row.props.index), column.key]}
                    last={!removable && columnIndex === columns.length - 1}
                  />
                ))}
                {removable && (
                  <td role="gridcell" className="border-b p-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-grid-cell={`${rowIndex}:${columns.length}`}
                      tabIndex={isSameCell(grid.active, { row: rowIndex, column: columns.length }) ? 0 : -1}
                      className="h-9 w-full rounded-none text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      aria-label={`Remove row ${rowIndex + 1}`}
                      onFocus={() => grid.setActive({ row: rowIndex, column: columns.length })}
                      onClick={() => removeRow(row.props, rowIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (removable ? 1 : 0)} className="px-3 py-6 text-center text-muted-foreground">
                  {options.emptyText ?? "No rows yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canAdd &&
        (AddControls ? (
          <AddControls add={addRow} />
        ) : (
          <Button ref={addButtonRef} type="button" variant="outline" size="sm" onClick={() => addRow()}>
            <Plus className="mr-1 h-4 w-4" />
            Add row
          </Button>
        ))}
    </div>
  );
}

// ── Cell ─────────────────────────────────────────────────────────────────────

type GridState = ReturnType<typeof useGridKeyboard>["grid"];

/** One grid cell around the column's AutoForm component. */
function ArrayTableCell({ grid, cell, column, path, last }: { grid: GridState; cell: Cell; column: ParsedField; path: string[]; last: boolean }) {
  // Read the error for the cell's current path: a row keeps its component
  // when an earlier row is removed, so its index (and path) can change.
  const id = path.join(".");
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: id, exact: true });
  const error = getFieldState(id, formState).error?.message;
  const { formComponents, uiComponents } = useAutoForm();
  const errorId = React.useId();
  const label = labelText(column);
  const active = isSameCell(grid.active, cell);
  const editing = isSameCell(grid.editing, cell);
  // Before any cell is active, the first cell is the grid's Tab stop.
  const isTabStop = grid.active ? active && !editing : cell.row === 0 && cell.column === 0;
  const FieldComponent: React.ComponentType<AutoFormFieldProps> | undefined = formComponents[column.type] ?? formComponents.fallback;

  return (
    <td
      role="gridcell"
      data-grid-cell={`${cell.row}:${cell.column}`}
      tabIndex={isTabStop ? 0 : -1}
      aria-label={label}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? errorId : undefined}
      className={cn(
        "border-b p-0 align-middle outline-none",
        !last && "border-r",
        error ? "bg-destructive/10 ring-2 ring-inset ring-destructive" : active && "ring-2 ring-inset ring-ring",
      )}
      onFocus={() => {
        if (!editing) grid.setActive(cell);
      }}
      onBlur={(event) => {
        // Leave edit mode once focus leaves the cell, unless it moved into the
        // control's own popup (e.g. an open select).
        const { currentTarget, relatedTarget } = event;
        const popupOpen = currentTarget.querySelector("[aria-expanded='true']");
        if (editing && !popupOpen && !currentTarget.contains(relatedTarget)) grid.setEditing(null);
      }}
      onPointerDown={(event) => {
        if (editing) return;
        event.preventDefault();
        grid.startEditing(cell);
      }}
    >
      <div data-grid-editor inert={!editing}>
        {FieldComponent ? (
          <FieldComponent
            path={path}
            id={id}
            error={error}
            parsedField={column}
            label={getLabel(column)}
            inputProps={{
              ...column.fieldConfig?.inputProps,
              "aria-label": label,
              "aria-invalid": Boolean(error) || undefined,
            }}
          />
        ) : (
          <uiComponents.ErrorMessage error={`No component found for type "${column.type}"`} />
        )}
      </div>
      {error && (
        <p id={errorId} className="px-2.5 pb-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </td>
  );
}
