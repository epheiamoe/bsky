export type AppView =
  | { type: 'feed' }
  | { type: 'detail'; uri: string }
  | { type: 'thread'; uri: string }
  | { type: 'compose'; replyTo?: string; quoteUri?: string }
  | { type: 'profile'; actor: string }
  | { type: 'notifications' }
  | { type: 'search'; query?: string }
  | { type: 'aiChat'; contextUri?: string }
  | { type: 'bookmarks' };

export interface NavigationState {
  currentView: AppView;
  canGoBack: boolean;
  stack: AppView[];
  goTo: (view: AppView) => void;
  goBack: () => void;
  goHome: () => void;
}

export function createNavigation() {
  let stack: AppView[] = [{ type: 'feed' }];
  let listeners: Array<() => void> = [];

  function getState(): NavigationState {
    return {
      currentView: stack[stack.length - 1]!,
      canGoBack: stack.length > 1,
      stack,
      goTo,
      goBack,
      goHome,
    };
  }

  function subscribe(fn: () => void) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  }

  function notify() {
    listeners.forEach(fn => fn());
  }

  function goTo(view: AppView) {
    stack = [...stack, view];
    notify();
  }

  function goBack() {
    if (stack.length > 1) {
      stack = stack.slice(0, -1);
      notify();
    }
  }

  function goHome() {
    stack = [{ type: 'feed' }];
    notify();
  }

  return { getState, subscribe, goTo, goBack, goHome };
}

export type NavigationController = ReturnType<typeof createNavigation>;
