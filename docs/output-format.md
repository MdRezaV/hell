~~# AI Output Format Specification

All file operations use `@@`-prefixed line headers. The parser scans for lines matching:

```
/^@@(FILE|REPLACE|DELETE|MOVE|INCLUDE|COMMIT|GREP|FIND|SEARCH|WITH|END)\b(.*)$/m
```

---

## Operations

### @@FILE — Create or overwrite a file

Multi-line. Requires `@@END`.

```
@@FILE src/main.ts
<full file content, any characters, any number of lines>
@@END
```

- Path is everything after `@@FILE ` to end of line. No quoting.
- Body is the complete file content verbatim.
- Content may contain backticks, brackets, quotes, `@@` in indented positions — anything except a line that is exactly `@@END` at column 0.

---

### @@REPLACE — Partial edit (search and replace)

Multi-line. Requires `@@END`. Contains `@@SEARCH` / `@@WITH` pairs.

```
@@REPLACE src/utils.ts
@@SEARCH
const x = 1
const y = 2
@@WITH
const x = 10
const y = 20
const z = 30
@@END
```

- Path is everything after `@@REPLACE ` to end of line.
- Body contains one or more `@@SEARCH` / `@@WITH` pairs, applied top-to-bottom.
- `@@SEARCH` body: exact lines to locate in the file (preserve indentation exactly).
- `@@WITH` body: replacement lines. May be empty (deletion).
- Multiple pairs in one block:

```
@@REPLACE src/utils.ts
@@SEARCH
old block 1
@@WITH
new block 1
@@SEARCH
old block 2
@@WITH
new block 2
@@END
```

---

### @@DELETE — Delete a file

Single-line. No `@@END`.

```
@@DELETE src/legacy.ts
```

---

### @@MOVE — Rename or move a file

Single-line. No `@@END`. Separator is ` -> ` (space, arrow, space).

```
@@MOVE src/old dir/file.ts -> src/new dir/file.ts
```

- Left of ` -> `: source path.
- Right of ` -> `: destination path.
- Paths may contain spaces, quotes, any characters except newline and the literal ` -> `.

---

### @@INCLUDE — Request a file from the user

Single-line. No `@@END`.

```
@@INCLUDE src/controllers/UserController.ts
```

- After emitting one or more `@@INCLUDE` lines, STOP generating. Do not write code, do not speculate.

---

### @@COMMIT — Commit message

Single-line. No `@@END`. Message is the remainder of the line.

```
@@COMMIT add parser, fix edge case, remove legacy
```

- Mandatory if any `@@FILE`, `@@REPLACE`, `@@DELETE`, or `@@MOVE` appears in the response.
- Forbidden if none appear.
- Must be the last operation in the response.
- Imperative mood, lowercase first word, max 72 characters, no trailing period.

---

### @@TASK — Define an implementation task

Multi-line. Requires `@@END`. Used in planning mode to break work into sequential, actionable units.

```
@@TASK 1
Files: src/main.ts, src/utils.ts, src/types.ts
Description: Create the parser module with a line-scanning loop that detects @@-prefixed headers and dispatches to per-operation handlers. Handle missing @@END gracefully by falling back to the next top-level header.
@@END
```

- Line 1 after `@@TASK <number>`: `Files: ` followed by a comma-separated list of file paths the implementer must read or modify.
- Line 2: `Description: ` followed by a complete, self-contained instruction.
- Tasks are numbered sequentially. Execution order follows numbering.
- Each task must be understandable without reading other task descriptions.
- `Files:` must include every file needed for context (types, interfaces, configs, tests), not just files being modified.
- Files created by earlier tasks may appear in `Files:` (they will exist at execution time).
- Files created by later tasks must NOT appear in `Files:`.
- New files not yet existing and not created by earlier tasks: mention only in `Description:` (e.g., "Create `src/foo.ts` with …"). Do not list in `Files:`.

Multiple tasks:

```
@@TASK 1
Files: src/types.ts
Description: Define the ParsedOperation interface and OperationType enum in src/types.ts.
@@END

@@TASK 2
Files: src/types.ts, src/parser.ts
Description: Implement the line scanner in src/parser.ts that produces ParsedOperation[] from raw text. Use the OperationType enum from src/types.ts for dispatch.
@@END
```

---

### @@GREP — Search file contents (future)

Multi-line. Requires `@@END`.

```
@@GREP src/renderer/src
useApplyRegistration
@@END
```

- Path (line 1): directory or file to search within.
- Body: the text pattern or regex to search for in file contents.
- Returns matching lines with file paths and line numbers.

---

### @@FIND — Search file names (future)

Multi-line. Requires `@@END`.

```
@@FIND src/renderer/src
*.test.ts
@@END
```

- Path (line 1): directory to search within.
- Body: glob pattern or substring to match against file/directory names.
- Returns matching file paths.

---

## Parsing Rules

1. Scan the response line-by-line for `@@KEYWORD` at column 0.
2. **Single-line ops** (`@@DELETE`, `@@MOVE`, `@@INCLUDE`, `@@COMMIT`): parse the remainder of the line. Done.
3. **Multi-line ops** (`@@FILE`, `@@REPLACE`, `@@GREP`, `@@FIND`): consume all subsequent lines as body until a line that is exactly `@@END` at column 0.
4. Inside `@@REPLACE` body, `@@SEARCH` and `@@WITH` are sub-headers that delimit search/replace pairs. They do NOT require their own `@@END`.
5. If `@@END` is missing (malformed output), the body extends to the next top-level `@@` header or EOF.

---

## Path Rules

- Paths are written as-is after the keyword + one space. No quoting, no escaping.
- Paths may contain spaces, quotes, parentheses, unicode — any character except newline.
- Normalize `\` to `/` before comparison.
- For `@@MOVE`, split on the first occurrence of ` -> `.

---

## Constraints

- `@@END` must appear at column 0, alone on its line. No trailing content.
- `@@SEARCH` and `@@WITH` must appear at column 0, alone on their line (no path argument).
- Do not wrap any `@@` line in backticks, bold, or other formatting.
- Do not add language hints or extra tokens after `@@END`.
- One operation per block. Do not nest `@@FILE` inside `@@FILE`.

---

## Summary Table

| Operation | Multi-line | Requires `@@END` | Body |
|-----------|-----------|-------------------|------|
| `@@FILE <path>` | Yes | Yes | Full file content |
| `@@REPLACE <path>` | Yes | Yes | `@@SEARCH`/`@@WITH` pairs |
| `@@DELETE <path>` | No | No | — |
| `@@MOVE <old> -> <new>` | No | No | — |
| `@@INCLUDE <path>` | No | No | — |
| `@@COMMIT <message>` | No | No | — |
| `@@GREP <path>` | Yes | Yes | Search pattern |
| `@@TASK <number>` | Yes | Yes | `Files:` + `Description:` metadata |
| `@@FIND <path>` | Yes | Yes | Filename glob/pattern |

---

## Example Response

I'll create the config, patch the utility, remove the legacy module, and rename the stylesheet.

@@FILE config.json
{
  "theme": "dark",
  "language": "en"
}
@@END

@@REPLACE src/utils.ts
@@SEARCH
import { init } from './core'
@@WITH
import { init } from './core'
import { helper } from './utils'
@@END

@@DELETE src/legacy.js

@@MOVE css/style.css -> css/main.css

@@COMMIT add config, patch imports, remove legacy, rename stylesheet~~
