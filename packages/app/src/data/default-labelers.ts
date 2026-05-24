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
  /** How to handle service failures (v0.14.1) */
  failureBehavior: 'silent' | 'banner' | 'block';
}

export const BUILTIN_LABELERS: BuiltinLabelerConfig[] = [
  {
    did: 'did:plc:ar7c4by46qjdydhdevvrndac',
    handle: 'moderation.bsky.app',
    name: 'Bluesky Moderation Service',
    description: 'Official content moderation service handling spam, NSFW, hate speech, and other basic moderation labels.',
    failureBehavior: 'banner',
  },
  {
    did: 'did:plc:e4elbtctnfqocyfcml6h2lf7',
    handle: 'skywatch.blue',
    name: 'Skywatch Blue',
    description: 'Independent moderation service filtering fringe/extremist content, engagement farming, and disinformation.',
    failureBehavior: 'banner',
  },
  {
    did: 'did:plc:yojwcfgpkxq35sv5wioglqad',
    handle: 'perisai.bsky.social',
    name: 'Perisai',
    description: 'Protects users from unwanted content and accounts. Highly subscribed, especially in non-English communities.',
    failureBehavior: 'banner',
  },
  {
    did: 'did:plc:d2mkddsbmnrgr3domzg5qexf',
    handle: 'moderation.blacksky.app',
    name: 'Blacksky Moderation',
    description: 'Community-driven cross-group safety net emphasizing decentralized protection.',
    failureBehavior: 'banner',
  },
  {
    did: 'did:plc:4ugewi6aca52a62u62jccbl7',
    handle: 'asukafield.xyz',
    name: "Asuka's Anti-Transphobia Field",
    description: 'Focuses on anti-transphobia and hate speech labels to protect LGBTQ+ users.',
    failureBehavior: 'block',
  },
  {
    did: 'did:plc:newitj5jo3uel7o4mnf3vj2o',
    handle: 'xblock.aendra.dev',
    name: 'XBlock Screenshot Labeller',
    description: 'Marks screenshots from Twitter/X and similar platforms to reduce dogpile discussions and external platform interference.',
    failureBehavior: 'silent',
  },
  {
    did: 'did:plc:hysbs7znfgxyb4tsvetzo4sk',
    handle: 'bskyttrpg.bsky.social',
    name: 'TTRPG Class Identifier',
    description: 'Automatically assigns TTRPG class labels. One of the most popular community labelers.',
    failureBehavior: 'silent',
  },
  {
    did: 'did:plc:2qawvcwumvgxmed6iy6pmt6l',
    handle: 'sonasky.app',
    name: 'SonaSky',
    description: 'Fursona label service for the furry community. Add with ❤️, remove with 💔.',
    failureBehavior: 'silent',
  },
  {
    did: 'did:plc:l624mewisyr6hymexmrjkprc',
    handle: 'creatorlabeler.bsky.social',
    name: 'Content Creator Labeler',
    description: 'Labels content creator types (artist, designer, etc.) to help distinguish real creators from AI/bots.',
    failureBehavior: 'silent',
  },
  {
    did: 'did:plc:gqaoe3na6isc3zyvp7iuqpu7',
    handle: 'arttheft.bsky.social',
    name: 'Art Theft Labeler',
    description: 'Anti-art theft/plagiarism labeling. Report to mark stolen artwork.',
    failureBehavior: 'banner',
  },
];
