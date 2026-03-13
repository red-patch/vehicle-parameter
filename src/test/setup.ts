import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

const originalGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = ((element: Element, pseudoElt?: string) => {
  if (pseudoElt) {
    return originalGetComputedStyle(element)
  }
  return originalGetComputedStyle(element)
}) as typeof window.getComputedStyle

(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
