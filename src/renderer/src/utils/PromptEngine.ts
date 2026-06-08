export const SYSTEM_PROMPT_FIRST = `SYSTEM PROMPT (I WILL CONFIGURE IT MY SELF)`
export const SYSTEM_PROMPT_SUBSEQUENT = `SYSTEM PROMPT 2`

function formatFiles(files: string[]): string {
  if (files.length === 0) return '[NO FILES SELECTED]'
  return `Files:\n${files.map((f) => `- ${f}`).join('\n')}`
}

export function buildPrompt(userMessage: string, index: number, files: string[] = []): string {
  const filesSection = formatFiles(files)
  if (index === 0) {
    return `${SYSTEM_PROMPT_FIRST}\n${index}\n${filesSection}\n\n${userMessage}`
  }
  return `${filesSection}\n${index}\n${userMessage}\n\n${SYSTEM_PROMPT_SUBSEQUENT}`
}
