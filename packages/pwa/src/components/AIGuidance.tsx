import React from 'react';

export function AIGuidance() {
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(dev)';

  return (
    <div className="text-center text-xs text-text-secondary/50 py-4 px-4 leading-relaxed">
      <span className="font-semibold">bsky</span> v{appVersion} —{' '}
      AI agent? See <a href="/llm.txt" className="underline">llm.txt</a> for page index,{' '}
      <a href="/README.md" className="underline">README</a> for project overview,{' '}
      <a href="/CHANGELOG.md" className="underline">CHANGELOG</a> for version history, or visit{' '}
      <a href="https://github.com/epheiamoe/bsky" className="underline" target="_blank" rel="noopener noreferrer">GitHub</a>.
      {' '}This app can delegate read/write operations to AI agents — see system prompt (#initialize) for scope. All destructive actions require human confirmation.
    </div>
  );
}
