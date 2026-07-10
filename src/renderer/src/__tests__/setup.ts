import '@testing-library/jest-dom/vitest'

const originalWarn = console.warn
console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('React does not recognize the') &&
    args[0].includes('on a DOM element')
  ) {
    return
  }
  originalWarn.call(console, ...args)
}
