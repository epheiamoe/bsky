import type { ReactNode } from 'react';
import type { BskyClient } from '@bsky/core';

export interface WidgetContext {
  /** Current draft text (compose view only) */
  composeDraft?: string;
  /** Called to replace draft text */
  onComposeDraftChange?: (text: string) => void;
  /** Current view type */
  viewType?: string;
  /** Bluesky client for data fetching */
  client?: BskyClient;
  /** Thread URI for context (thread view) */
  threadUri?: string;
  [key: string]: unknown;
}

export interface WidgetDefinition {
  /** Unique identifier */
  id: string;
  /** i18n key for display name */
  titleKey: string;
  /** Icon name (for PWA Icon component) */
  icon: string;
  /** Which views this widget shows in. Empty = all views */
  views: string[];
  /** Whether this widget is on by default when first loaded */
  defaultOpen: boolean;
}

interface WidgetEntry extends WidgetDefinition {
  render: (props: WidgetProps) => ReactNode;
}

export interface WidgetProps {
  onClose: () => void;
  context?: WidgetContext;
}

const _registry: Map<string, WidgetEntry> = new Map();

export function registerWidget(def: WidgetDefinition, render: (props: WidgetProps) => ReactNode): void {
  _registry.set(def.id, { ...def, render });
}

export function getWidget(id: string): WidgetEntry | undefined {
  return _registry.get(id);
}

export function getWidgets(): WidgetEntry[] {
  return [..._registry.values()];
}

export function getWidgetsForView(viewType: string): WidgetEntry[] {
  return getWidgets().filter(w => w.views.length === 0 || w.views.includes(viewType));
}
