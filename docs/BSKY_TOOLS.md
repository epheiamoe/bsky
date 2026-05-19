# bsky_tools — Python Batch AT Protocol Tool Calls

> **Status**: v0.15.0 (Phase 14) | PWA + TUI + MCP

`bsky_tools` is a Python library embedded in the AI Python sandbox that lets you batch-call Bluesky AT Protocol API methods directly from Python code. Instead of making individual tool calls one at a time, you can write Python scripts that efficiently process data in loops.

---

## Why Use bsky_tools?

| Benefit | Description |
|---------|-------------|
| **Efficiency** | One Python execution vs 100+ individual tool calls |
| **Cost** | Fewer LLM tokens (no repeated tool call overhead) |
| **Power** | Full Python logic (loops, conditionals, data processing) |
| **Data Analysis** | Combine with pandas/numpy for advanced analytics |

---

## Quick Start

### Initialization

`bsky_tools` is pre-initialized in the Python sandbox. Simply use it directly:

```python
# bsky_tools is already available — no import needed
posts = bsky_tools.search_posts("AI", limit=50)
for post in posts['posts']:
    if post['likeCount'] > 100:
        print(f"Popular: {post['author']}: {post['text'][:80]}")
```

```python
# Batch follow small accounts
posts = bsky_tools.search_posts("indiedev", limit=100)
for post in posts['posts']:
    profile = bsky_tools.get_profile(post['author'])
    if profile['followersCount'] < 1000:
        bsky_tools.follow(profile['did'])
        print(f"Followed {profile['handle']}")
```

**Note**: If you see `BskyToolsError: BskyTools not initialized`, the bridge may not be ready. In rare cases, you can manually connect it:
```python
# Manual initialization (only if auto-init fails)
if hasattr(globals(), 'bskyToolsBridge'):
    bsky_tools._bridge = bskyToolsBridge
```

---

## Available Methods

### Read Operations

| Method | Description | Key Parameters |
|--------|-------------|----------------|
| `search_posts(q, limit, cursor, sort, fields)` | Search posts by keyword | `q`: query string |
| `get_profile(actor, fields)` | Get user profile | `actor`: handle or DID |
| `get_timeline(limit, cursor, fields)` | Get home timeline | — |
| `get_author_feed(actor, limit, cursor, fields)` | Get user's posts | `actor`: handle or DID |
| `get_post_thread(uri, depth, fields)` | Get post thread | `uri`: AT URI |
| `get_post_context(uri, maxReplies, fields)` | Get post + replies + media | `uri`: AT URI |
| `get_post_interactions(uri, type, limit, cursor, fields)` | Get likes/reposts | `type`: "likes" or "reposts" |
| `get_quotes(uri, limit, cursor, fields)` | Find quoting posts | `uri`: AT URI |
| `search_actors(q, limit, cursor, fields)` | Search users | `q`: query string |
| `get_connections(actor, direction, limit, cursor, fields)` | Get follows/followers | `direction`: "following" or "followers" |
| `get_suggested_follows(actor, fields)` | Get recommendations | `actor`: handle or DID |
| `list_notifications(limit, cursor, fields)` | Get notifications | — |
| `resolve_handle(handle, fields)` | Resolve handle to DID | `handle`: e.g. "alice.bsky.social" |
| `get_record(uri, fields)` | Get raw AT record | `uri`: AT URI |
| `list_records(repo, collection, limit, cursor, fields)` | List repo records | `collection`: NSID |
| `get_popular_feed_generators(limit, fields)` | Get trending feeds | — |
| `get_feed_generator(feed, fields)` | Get feed info | `feed`: AT URI |
| `get_feed(feed, limit, cursor, fields)` | Get feed posts | `feed`: AT URI |
| `get_lists(actor, fields)` | Get user's lists | `actor`: handle or DID |
| `get_list_feed(list_uri, limit, cursor, fields)` | Get list posts | `list_uri`: AT URI |
| `extract_images_from_post(uri, fields)` | Extract image refs | `uri`: AT URI |
| `download_image(did, cid, filename, fields)` | Download image | `did`, `cid` |
| `view_image(did, cid, alt, uploadIndex, fields)` | View image | — |
| `extract_external_link(uri, fields)` | Extract link card | `uri`: AT URI |
| `fetch_web_markdown(url, fields)` | Fetch web page | `url`: full URL |
| `search_web_ddg(query, fields)` | Web search | `query`: search string |
| `search_wikipedia(query, lang, fields)` | Wikipedia search | `lang`: language code |

### Write Operations (Require Confirmation)

| Method | Description |
|--------|-------------|
| `create_post(text, replyTo, quoteUri, images, threadgate, fields)` | Create post |
| `like(uri, fields)` | Like a post |
| `repost(uri, fields)` | Repost a post |
| `follow(subject, fields)` | Follow a user |
| `create_list(name, purpose, description, fields)` | Create a list |
| `edit_list_members(list_uri, subject, action, fields)` | Add/remove list member |

**Important**: Write operations still require user confirmation, even when called from Python.

---

## Fields Parameter

Use `fields` to filter the JSON response and reduce token usage.

### Supported Formats

```python
# List of field names
posts = bsky_tools.search_posts("AI", limit=50, fields=["uri", "author", "likeCount", "text"])

# Comma-separated string (auto-converted)
profile = bsky_tools.get_profile("alice.bsky.social", fields="handle,displayName,followersCount")

# Nested fields supported
thread = bsky_tools.get_post_thread(uri, fields=["post.uri", "post.author.handle", "replies"])
```

### Important Notes

- `fields` filters the **returned data**, not the API request — all data is still fetched, only the output is filtered
- Without `fields`, the full API response is returned (same as individual tool calls)
- Invalid field names are silently ignored
- Works with all methods except `fetch_web_markdown` and `search_web_ddg` (which return raw text)

---

## Examples

### Example 1: Analyze Your Followers

```python
import pandas as pd

# Get followers
connections = bsky_tools.get_connections("me", direction="followers", limit=100)
followers = connections['items']

# Get detailed profiles
profiles = []
for follower in followers:
    profile = bsky_tools.get_profile(follower['handle'])
    profiles.append(profile)

# Analyze with pandas
df = pd.DataFrame(profiles)
print(f"Average followers: {df['followersCount'].mean()}")
print(f"Total followers analyzed: {len(df)}")
```

### Example 2: Batch Like Popular Posts

```python
# Search for posts in a topic
posts = bsky_tools.search_posts("#buildinpublic", limit=50)

# Like posts with high engagement
for post in posts['posts']:
    if post['likeCount'] > 50 and post['repostCount'] > 10:
        bsky_tools.like(post['uri'])
        print(f"Liked: {post['text'][:60]}...")
```

### Example 3: Find Inactive Follows

```python
# Get people you follow
following = bsky_tools.get_connections("me", direction="following", limit=200)

# Check last post date for each
inactive = []
for person in following['items']:
    feed = bsky_tools.get_author_feed(person['handle'], limit=1)
    if feed['feed']:
        last_post = feed['feed'][0]
        # Check if older than 30 days
        from datetime import datetime
        post_date = datetime.fromisoformat(last_post['indexedAt'].replace('Z', '+00:00'))
        days_ago = (datetime.now(post_date.tzinfo) - post_date).days
        if days_ago > 30:
            inactive.append({
                'handle': person['handle'],
                'days_since_post': days_ago
            })

print(f"Found {len(inactive)} inactive accounts")
for acc in inactive[:10]:
    print(f"  {acc['handle']}: {acc['days_since_post']} days")
```

---

## Error Handling

All bsky_tools methods raise `BskyToolsError` on failure. Always wrap calls in try/except:

```python
from bsky_tools import BskyToolsError

try:
    profile = bsky_tools.get_profile("nonexistent.handle")
    print(f"Found: {profile['displayName']}")
except BskyToolsError as e:
    print(f"Error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

Common errors:
- `BskyToolsError: BskyTools not initialized. Auth required.` — Bridge not ready, try manual init
- `BskyToolsError: HTTP 400: ...` — Invalid parameters or API error
- `BskyToolsError: HTTP 404: ...` — Resource not found
- `BskyToolsError: Handle not found` — resolve_handle failed to resolve

**Tip**: Check `hasattr(globals(), 'bskyToolsBridge')` before using if you encounter init errors.

---

## Platform Differences

| Feature | PWA (Browser) | TUI/MCP (Node.js) |
|---------|---------------|-------------------|
| Mechanism | Sync XHR in Web Worker | JSON-RPC over stdin/stdout |
| Read ops | ✅ 27 methods | ✅ All 33 methods |
| Write ops | ❌ Disabled (error) | ✅ With confirmation |
| External libs | pandas, numpy, matplotlib (auto) | Requires manual install |
| Web tools | search_web_ddg, search_wikipedia | search_web_ddg, search_wikipedia |

---

## Security

- **AST Analysis**: Before execution, Python code is analyzed for write operations and dynamic calls (`getattr`)
- **Dynamic Calls Rejected**: `getattr(bsky_tools, ...)` patterns are blocked
- **Pre-execution Confirmation**: Write operations require explicit user confirmation
- **No Secrets Leak**: API credentials are managed by the platform, not exposed to Python

---

## Known Limitations

| # | Limitation | Workaround |
|---|-----------|-----------|
| 1 | `fields` filters **returned data**, not the API request | All data is fetched; filtering happens before returning to Python |
| 2 | `get_post_thread` in PWA lacks `format`/`maxReplies` | Use `depth` parameter only; for flat format, use `get_post_context` |
| 3 | `list_records` may return empty for large repos | Use `cursor` pagination; verify actor's PDS |
| 4 | `get_suggested_follows` may return empty for new accounts | Normal behavior for accounts with few connections |
| 5 | `import bsky_tools` does not work | Use the pre-initialized `bsky_tools` global directly |
| 6 | Write operations on PWA require browser `confirm()` dialog | Use TUI/MCP for programmatic write workflows |

---

## Tips

1. **Use `fields`**: Always filter fields to reduce output size and token usage
2. **Batch wisely**: Group related operations to minimize API calls
3. **Handle pagination**: Use `cursor` parameter for large result sets
4. **Use try/except**: Wrap calls in `try/except BskyToolsError` for robust error handling
5. **Rate limits**: Respect Bluesky rate limits (errors returned as exceptions)

---

*See also: `docs/PYTHON_SANDBOX_STATUS.md` for sandbox architecture details.*
