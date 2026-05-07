import { getWidgetsForView, getWidget } from './widgetRegistry.js';
import type { WidgetDefinition } from './widgetRegistry.js';

const _enabled: Set<string> = new Set();

export function initEnabledWidgets(ids: string[]): void {
  _enabled.clear();
  for (const id of ids) _enabled.add(id);
}

export function getEnabledWidgetIds(): string[] {
  return [..._enabled];
}

export function isWidgetEnabled(id: string): boolean {
  return _enabled.has(id);
}

export function enableWidget(id: string): void {
  if (getWidget(id)) _enabled.add(id);
}

export function disableWidget(id: string): void {
  _enabled.delete(id);
}

// ── AI Chat widget session bridge ──
let _aiChatSessionId = '';

export function initAIChatSession(): string {
  if (!_aiChatSessionId) _aiChatSessionId = crypto.randomUUID();
  return _aiChatSessionId;
}
export function getAIChatSessionId(): string { return _aiChatSessionId; }
export function setAIChatSessionId(id: string) { _aiChatSessionId = id; }
export function resetAIChatSession(): string { _aiChatSessionId = crypto.randomUUID(); return _aiChatSessionId; }

// ── Widget toggle persistence callback ──
let _onWidgetToggle: ((id: string) => void) | null = null;

export function setWidgetToggleCallback(fn: ((id: string) => void) | null): void { _onWidgetToggle = fn; }

export function toggleWidget(id: string): boolean {
  if (isWidgetEnabled(id)) {
    disableWidget(id);
    _onWidgetToggle?.(id);
    return false;
  } else {
    enableWidget(id);
    _onWidgetToggle?.(id);
    return true;
  }
}

export function getEnabledWidgetsForView(viewType: string): (WidgetDefinition & { enabled: boolean })[] {
  const all = getWidgetsForView(viewType);
  return all.map(w => ({ ...w, enabled: _enabled.has(w.id) }));
}

// ── Compose draft bridge (so widgets in right sidebar can read/replace draft) ──
let _composeDraft = '';
let _composeDraftSetter: ((text: string) => void) | null = null;

export function setComposeDraftForWidgets(text: string): void { _composeDraft = text; }
export function getComposeDraftForWidgets(): string { return _composeDraft; }
export function registerComposeDraftSetter(fn: ((text: string) => void) | null): void { _composeDraftSetter = fn; }
export function replaceComposeDraft(text: string): void { _composeDraftSetter?.(text); }

// ── Focused profile bridge (so ProfilePreviewWidget in right sidebar can show the current post author) ──
let _focusedProfileActor: string | null = null;

export function setFocusedProfileActor(actor: string | null): void { _focusedProfileActor = actor; }
export function getFocusedProfileActor(): string | null { return _focusedProfileActor; }
