import { useState, useEffect, useCallback } from 'react';
import { createNavigation } from '../state/navigation.js';
import type { AppView, NavigationController } from '../state/navigation.js';

export function useNavigation() {
  const [nav] = useState(() => createNavigation());
  const [state, setState] = useState(() => nav.getState());

  const tick = useCallback(() => setState(nav.getState()), [nav]);

  useEffect(() => nav.subscribe(tick), [nav, tick]);

  return {
    currentView: state.currentView,
    canGoBack: state.canGoBack,
    goTo: (v: AppView) => nav.goTo(v),
    goBack: () => nav.goBack(),
    goHome: () => nav.goHome(),
  };
}
