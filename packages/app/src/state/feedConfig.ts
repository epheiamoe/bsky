import { RECOMMENDED_FEEDS, getFeedLabel, BUILTIN_FEEDS } from '@bsky/core';
import type { FeedInfo } from '@bsky/core';

export interface FeedConfigData {
  feeds: FeedInfo[];
  defaultFeedUri: string | null; // null = home timeline
}

const STORAGE_KEY = 'bsky_feed_config';

const DEFAULT_CONFIG: FeedConfigData = {
  feeds: [...RECOMMENDED_FEEDS],
  defaultFeedUri: null,
};

export function getFeedConfig(): FeedConfigData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveFeedConfig(config: FeedConfigData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function addFeed(uri: string, label?: string): FeedConfigData {
  const config = getFeedConfig();
  if (config.feeds.some(f => f.uri === uri)) return config;
  config.feeds.push({ uri, label: label ?? getFeedLabel(uri) });
  saveFeedConfig(config);
  return config;
}

export function removeFeed(uri: string): FeedConfigData {
  if (uri === BUILTIN_FEEDS.following) return getFeedConfig(); // Never delete Following
  const config = getFeedConfig();
  config.feeds = config.feeds.filter(f => f.uri !== uri);
  if (config.defaultFeedUri === uri) config.defaultFeedUri = null;
  saveFeedConfig(config);
  return config;
}

export function setDefaultFeed(feedUri: string | null): FeedConfigData {
  const config = getFeedConfig();
  config.defaultFeedUri = feedUri;
  saveFeedConfig(config);
  return config;
}
