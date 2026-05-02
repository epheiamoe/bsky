// Module-level view state cache for preserving scroll/focus across TUI view changes
const _state = new Map<string, Record<string, number>>();

export function saveViewState(key: string, state: Record<string, number>): void {
  _state.set(key, state);
}

export function getViewState(key: string): Record<string, number> | undefined {
  return _state.get(key);
}
