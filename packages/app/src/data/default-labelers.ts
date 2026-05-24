/**
 * Built-in labeler configurations (data, not business logic).
 * 
 * These are reputable moderation services that users can subscribe to.
 * Only labelers with known DIDs are auto-subscribed on first load.
 * Others appear in the "Recommended" section for manual addition.
 * 
 * [Debt: i18n] Descriptions should be localized in the UI layer.
 */

export interface BuiltinLabelerConfig {
  /** AT Protocol DID. If known, the labeler is auto-subscribed. */
  did?: string;
  /** Bluesky handle for display and DID resolution */
  handle: string;
  /** Display name */
  name: string;
  /** Short description shown under the handle */
  description: string;
}

export const BUILTIN_LABELERS: BuiltinLabelerConfig[] = [
  {
    did: 'did:plc:ar7c4by46qjdydhdevvrndac',
    handle: 'moderation.bsky.app',
    name: 'Bluesky Moderation Service',
    description: 'Official content moderation service handling spam, NSFW, hate speech, and other basic moderation labels.',
  },
  {
    handle: 'skywatch.blue',
    name: 'Skywatch Blue',
    description: 'Independent moderation service filtering low-quality content, engagement farming, and hate speech. Recommended as a supplement to official moderation.',
  },
  {
    handle: 'xblock.aendra.dev',
    name: 'XBlock',
    description: 'Focuses on screenshot-related content with adjustable filtering to reduce dogpile discussions. Supported by Bluesky microgrant.',
  },
  {
    handle: 'aegis.blue',
    name: 'Aegis',
    description: 'Volunteer-run moderation service protecting LGBTQ+ and marginalized communities. "We Keep Us Safe".',
  },
];
