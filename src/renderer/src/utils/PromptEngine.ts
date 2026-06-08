export const SYSTEM_PROMPT_FIRST = `SYSTEM PROMPT (I WILL CONFIGURE IT MY SELF)`
export const SYSTEM_PROMPT_SUBSEQUENT = `SYSTEM PROMPT 2`
export const FILES_PLACEHOLDER = `[FILES-SHOULD-ADDED-HERE] (IGNORE THIS FOR NOW)`

export function buildPrompt(userMessage: string, index: number): string {
  if (index === 0) {
    return `${SYSTEM_PROMPT_FIRST}\n${index}\n${FILES_PLACEHOLDER}\n\n${userMessage}`
  }
  return `${FILES_PLACEHOLDER}\n${index}\n${userMessage}\n\n${SYSTEM_PROMPT_SUBSEQUENT}`
}
