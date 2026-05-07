export interface ToolResultDisplay {
  summary: string;
  body: string;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '...';
}

function jsonTry<T>(text: string, fn: (obj: Record<string, unknown>) => T | null): T | null {
  try { return fn(JSON.parse(text) as Record<string, unknown>); } catch { return null; }
}

function toolLabel(name: string): string {
  return name.replace(/_/g, ' ');
}

export function formatToolResult(toolName: string, content: string): ToolResultDisplay {
  // Already pre-summarized by tryJsonSummary — show directly
  if (content && !content.startsWith('{') && !content.startsWith('[')) {
    const preview = content.split('\n')[0] || content;
    return { summary: truncate(preview, 80), body: content };
  }

  // ── Write tools (Category A) ──
  if (toolName === 'create_post') {
    const r = jsonTry(content, obj => ({
      text: truncate(String(obj.text ?? ''), 200),
      uri: String(obj.uri ?? ''),
    }));
    if (r) return { summary: truncate(r.text, 80), body: `${r.text}\n${r.uri}` };
    return { summary: 'Posted', body: truncate(content, 500) };
  }

  if (toolName === 'like') {
    const r = jsonTry(content, obj => ({
      liked: String(obj.liked ?? ''),
      cid: String(obj.cid ?? ''),
    }));
    const rkey = r?.liked ? r.liked.split('/').pop() : '';
    return { summary: rkey ? `Liked: ...${rkey?.slice(-8)}` : 'Liked', body: r ? `Liked: ${r.liked}` : truncate(content, 300) };
  }

  if (toolName === 'repost') {
    const r = jsonTry(content, obj => ({
      reposted: String(obj.reposted ?? ''),
      cid: String(obj.cid ?? ''),
    }));
    const rkey = r?.reposted ? r.reposted.split('/').pop() : '';
    return { summary: rkey ? `Reposted: ...${rkey?.slice(-8)}` : 'Reposted', body: r ? `Reposted: ${r.reposted}` : truncate(content, 300) };
  }

  if (toolName === 'follow') {
    const r = jsonTry(content, obj => String(obj.followed ?? ''));
    const short = r ? r.split(':').pop()?.slice(0, 10) : '';
    return { summary: short ? `Followed: ...${short}` : 'Followed', body: r ? `Followed: ${r}` : truncate(content, 300) };
  }

  // ── Resolve/dereference tools (Category A) ──
  if (toolName === 'resolve_handle') {
    const r = jsonTry(content, obj => ({
      handle: String(obj.handle ?? ''),
      did: String(obj.did ?? ''),
    }));
    if (r) return { summary: r.handle, body: `at://${r.did}` };
    return { summary: 'Resolved', body: truncate(content, 200) };
  }

  if (toolName === 'get_profile') {
    const r = jsonTry(content, obj => ({
      handle: String(obj.handle ?? ''),
      displayName: String(obj.displayName ?? ''),
      description: String(obj.description ?? ''),
      followersCount: Number(obj.followersCount ?? 0),
      followsCount: Number(obj.followsCount ?? 0),
      postsCount: Number(obj.postsCount ?? 0),
    }));
    if (r) {
      const name = r.displayName || r.handle;
      return {
        summary: name,
        body: [
          name,
          `${r.followersCount} followers / ${r.followsCount} following / ${r.postsCount} posts`,
          r.description ? truncate(r.description, 300) : '',
        ].filter(Boolean).join('\n'),
      };
    }
    return { summary: 'Profile', body: truncate(content, 500) };
  }

  if (toolName === 'get_record') {
    const r = jsonTry(content, obj => ({
      uri: String(obj.uri ?? ''),
      cid: String(obj.cid ?? ''),
    }));
    if (r) return { summary: r.uri?.split('/').slice(-2).join('/') ?? 'Record', body: `${r.uri}\n${r.cid}` };
    return { summary: 'Record', body: truncate(content, 500) };
  }

  if (toolName === 'get_feed_generator') {
    const r = jsonTry(content, obj => {
      const view = obj.view as Record<string, unknown> | undefined ?? obj;
      const creator = view.creator as Record<string, unknown> | undefined;
      return {
        name: String(view.displayName ?? ''),
        by: String(creator?.handle ?? ''),
        desc: String(view.description ?? ''),
      };
    });
    if (r) return { summary: r.name || r.by || 'Feed generator', body: [r.name, r.by ? `by @${r.by}` : '', r.desc ? truncate(r.desc, 300) : ''].filter(Boolean).join('\n') };
    return { summary: 'Feed generator', body: truncate(content, 500) };
  }

  if (toolName === 'get_suggested_follows') {
    const r = jsonTry(content, obj => {
      const suggestions = obj.suggestions as Array<Record<string, unknown>> ?? [];
      return suggestions.map(s => `@${s.handle}${s.displayName ? ` (${s.displayName})` : ''}`).join(', ');
    });
    if (r) return { summary: r.slice(0, 60), body: r };
    return { summary: 'Suggested follows', body: truncate(content, 300) };
  }

  // ── Search/list tools (Category B) ──
  if (toolName === 'search_posts') {
    const r = jsonTry(content, obj => {
      const posts = obj.posts as Array<Record<string, unknown>> ?? [];
      const total = Number(obj.hitsTotal ?? obj.total ?? posts.length);
      const first3 = posts.slice(0, 3).map(p => `@${p.author}: ${truncate(String(p.text ?? ''), 120)}`);
      return { total, list: first3.join('\n\n') };
    });
    if (r) return { summary: `Search: ${r.total} results`, body: r.list || '(empty)' };
    return { summary: 'Search results', body: truncate(content, 500) };
  }

  if (toolName === 'search_actors') {
    const r = jsonTry(content, obj => {
      const actors = obj.actors as Array<Record<string, unknown>> ?? [];
      return {
        total: Number(obj.total ?? actors.length),
        list: actors.slice(0, 5).map(a => `@${a.handle}${a.displayName ? ` (${a.displayName})` : ''}`).join('\n\n'),
      };
    });
    if (r) return { summary: `${r.total} users found`, body: r.list || '(empty)' };
    return { summary: 'Users found', body: truncate(content, 300) };
  }

  if (toolName === 'get_likes') {
    const r = jsonTry(content, obj => {
      const likes = obj.likes as Array<Record<string, unknown>> ?? [];
      const total = Number(obj.total ?? likes.length);
      const handles = likes.slice(0, 10).map(l => `@${l.handle}`).join(', ');
      return { total, handles };
    });
    if (r) return { summary: `${r.total} likes`, body: r.handles || `(${r.total} total)` };
    return { summary: 'Likes', body: truncate(content, 300) };
  }

  if (toolName === 'get_reposted_by') {
    const r = jsonTry(content, obj => {
      const list = obj.repostedBy as string[] ?? [];
      return { total: list.length, list: list.slice(0, 10).map(h => `@${h}`).join(', ') };
    });
    if (r) return { summary: `${r.total} reposts`, body: r.list || `(${r.total} total)` };
    return { summary: 'Reposts', body: truncate(content, 300) };
  }

  if (toolName === 'get_quotes') {
    const r = jsonTry(content, obj => {
      const quotes = obj.quotes as Array<Record<string, unknown>> ?? [];
      const total = Number(obj.total ?? quotes.length);
      const first3 = quotes.slice(0, 3).map(q => `@${q.author}: ${truncate(String(q.text ?? ''), 120)}`);
      return { total, list: first3.join('\n\n') };
    });
    if (r) return { summary: `${r.total} quotes`, body: r.list || `(${r.total} total)` };
    return { summary: 'Quotes', body: truncate(content, 300) };
  }

  if (toolName === 'list_notifications') {
    const r = jsonTry(content, obj => {
      const notifs = obj.notifications as Array<Record<string, unknown>> ?? [];
      const total = notifs.length;
      const first5 = notifs.slice(0, 5).map(n => {
        const icon = n.reason === 'like' ? 'Liked' : n.reason === 'repost' ? 'Reposted' : n.reason === 'follow' ? 'Followed' : n.reason === 'reply' ? 'Replied' : 'Notified';
        return `${icon}: @${(n.author as Record<string, unknown> | undefined)?.handle ?? '?'}`;
      });
      return { total, list: first5.join('\n\n') };
    });
    if (r) return { summary: `${r.total} notifications`, body: r.list || `(${r.total} total)` };
    return { summary: 'Notifications', body: truncate(content, 300) };
  }

  // ── Feed/timeline tools (Category C) ──
  if (toolName === 'get_timeline') {
    const r = jsonTry(content, obj => {
      const feed = obj.feed as Array<Record<string, unknown>> ?? [];
      const posts = feed.map(f => {
        const p = f.post as Record<string, unknown> | undefined;
        const author = p?.author as Record<string, unknown> | undefined;
        return { handle: String(author?.handle ?? ''), text: truncate(String(p?.text ?? ''), 120) };
      });
      return {
        total: posts.length,
        first3: posts.slice(0, 3).map(p => `@${p.handle}: ${p.text}`).join('\n\n'),
      };
    });
    if (r) return { summary: `Timeline: ${r.total} posts`, body: r.first3 || '(empty)' };
    return { summary: 'Timeline', body: truncate(content, 500) };
  }

  if (toolName === 'get_author_feed') {
    const r = jsonTry(content, obj => {
      const feed = obj.feed as Array<Record<string, unknown>> ?? [];
      const posts = feed.map(f => {
        const p = f.post as Record<string, unknown> | undefined;
        return truncate(String(p?.text ?? ''), 120);
      });
      return { total: posts.length, first3: posts.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('\n\n') };
    });
    if (r) return { summary: `Posts: ${r.total} items`, body: r.first3 || '(empty)' };
    return { summary: 'Author feed', body: truncate(content, 500) };
  }

  if (toolName === 'get_feed') {
    const r = jsonTry(content, obj => {
      const feed = obj.feed as Array<Record<string, unknown>> ?? [];
      const posts = feed.map(f => {
        const p = f.post as Record<string, unknown> | undefined;
        const author = p?.author as Record<string, unknown> | undefined;
        return { handle: String(author?.handle ?? ''), text: truncate(String(p?.text ?? ''), 120) };
      });
      return {
        total: posts.length,
        first3: posts.slice(0, 3).map(p => `@${p.handle}: ${p.text}`).join('\n\n'),
      };
    });
    if (r) return { summary: `Feed: ${r.total} posts`, body: r.first3 || '(empty)' };
    return { summary: 'Feed', body: truncate(content, 500) };
  }

  if (toolName === 'get_popular_feed_generators') {
    const r = jsonTry(content, obj => {
      const feeds = obj.feeds as Array<Record<string, unknown>> ?? [];
      const names = feeds.map(f => f.displayName).filter(Boolean).slice(0, 10);
      return { total: feeds.length, list: names.join('\n\n') };
    });
    if (r) return { summary: `${r.total} popular feeds`, body: r.list || '(empty)' };
    return { summary: 'Popular feeds', body: truncate(content, 300) };
  }

  // ── Thread tools ──
  if (toolName === 'get_post_thread_flat' || toolName === 'get_post_subtree') {
    const body = truncate(content, 2000);
    const lineCount = content.split('\n').length;
    return { summary: `Thread: ${lineCount} lines`, body: lineCount > 1 ? body : content };
  }

  if (toolName === 'get_post_context') {
    const r = jsonTry(content, obj => ({
      text: truncate(String(obj.text ?? ''), 300),
      media: Array.isArray(obj.media) ? (obj.media as string[]).join('\n') : '',
      thread: String(obj.thread ?? '').slice(0, 500),
    }));
    if (r) {
      const preview = (r.text || '').split('\n')[0] || 'Post context';
      const parts = [r.text];
      if (r.media) parts.push(`\n${r.media}`);
      if (r.thread) parts.push(`\n${r.thread}`);
      return { summary: preview, body: parts.join('\n') };
    }
    return { summary: 'Post context', body: truncate(content, 500) };
  }

  if (toolName === 'get_post_thread') {
    const lineCount = content.split('\n').length;
    return { summary: `Thread: ${lineCount} lines`, body: truncate(content, 2000) };
  }

  // ── Follows/followers (Category C) ──
  if (toolName === 'get_follows') {
    const r = jsonTry(content, obj => {
      const list = obj.follows as Array<Record<string, unknown>> ?? [];
      const total = Number(obj.total ?? list.length);
      const first5 = list.slice(0, 5).map(f => `@${f.handle}${f.displayName ? ` (${f.displayName})` : ''}`);
      return { total, list: first5.join('\n\n') };
    });
    if (r) return { summary: `Follows ${r.total} people`, body: r.list || `(${r.total} total)` };
    return { summary: 'Follows', body: truncate(content, 300) };
  }

  if (toolName === 'get_followers') {
    const r = jsonTry(content, obj => {
      const list = obj.followers as Array<Record<string, unknown>> ?? [];
      const total = Number(obj.total ?? list.length);
      const first5 = list.slice(0, 5).map(f => `@${f.handle}${f.displayName ? ` (${f.displayName})` : ''}`);
      return { total, list: first5.join('\n\n') };
    });
    if (r) return { summary: `${r.total} followers`, body: r.list || `(${r.total} total)` };
    return { summary: 'Followers', body: truncate(content, 300) };
  }

  // ── List records (Category C) ──
  if (toolName === 'list_records') {
    const r = jsonTry(content, obj => {
      const records = obj.records as Array<Record<string, unknown>> ?? [];
      return { total: records.length, first3: records.slice(0, 3).map(r2 => String(r2.uri ?? '')).join('\n\n') };
    });
    if (r) return { summary: `${r.total} records`, body: r.first3 || `(${r.total} total)` };
    return { summary: 'Records', body: truncate(content, 300) };
  }

  // ── Image tools (Category A) ──
  if (toolName === 'view_image') {
    const r = jsonTry(content, obj => ({
      alt: String(obj.alt ?? ''),
      mime: String(obj.mimeType ?? ''),
      size: Number(obj.size ?? 0),
      note: String(obj.note ?? ''),
    }));
    if (r) return { summary: truncate(r.alt, 50) ? `${truncate(r.alt, 50)} (${r.mime})` : `Image (${r.mime})`, body: `${r.alt || '(no alt)'}\n${r.mime} / ${(r.size / 1024).toFixed(1)}KB${r.note ? `\n${r.note}` : ''}` };
    return { summary: 'Image', body: truncate(content, 300) };
  }

  if (toolName === 'download_image') {
    const r = jsonTry(content, obj => ({
      saved: obj.saved,
      path: String(obj.saved ?? ''),
      mime: String(obj.mimeType ?? ''),
      size: Number(obj.size ?? 0),
      filename: String(obj.filename ?? ''),
      note: String(obj.note ?? ''),
    }));
    if (r) {
      if (r.saved === false && r.note) {
        return { summary: `${r.filename} (${(r.size / 1024).toFixed(1)}KB)`, body: `${r.filename}\n${r.note}` };
      }
      return { summary: `Saved: ${r.filename || r.path.split('\\').pop() || ''}`, body: `${r.mime} / ${(r.size / 1024).toFixed(1)}KB\n${r.path}` };
    }
    return { summary: 'Image download', body: truncate(content, 200) };
  }

  if (toolName === 'extract_images_from_post') {
    const r = jsonTry(content, obj => {
      const images = obj.images as Array<Record<string, unknown>> ?? [];
      return { count: Number(obj.count ?? images.length), list: images.map((img, i) => `${i + 1}. ${img.alt || '(no alt)'} (${img.mimeType ?? '?'})`).join('\n') };
    });
    if (r) return { summary: `${r.count} images`, body: r.list || `(${r.count} total)` };
    return { summary: 'Images', body: truncate(content, 200) };
  }

  // ── External link tool (Category A) ──
  if (toolName === 'extract_external_link') {
    const r = jsonTry(content, obj => ({
      title: String(obj.title ?? ''),
      uri: String(obj.uri ?? ''),
      description: String(obj.description ?? ''),
      link: obj.link,
    }));
    if (r) {
      if (r.link === null) return { summary: 'No external link', body: r.title ? `No link found in "${r.title}"` : 'No external link found' };
      return { summary: truncate(r.title || r.uri, 60), body: `${r.title}\n${r.uri}${r.description ? `\n${truncate(r.description, 300)}` : ''}` };
    }
    return { summary: 'Link', body: truncate(content, 200) };
  }

  // ── Web fetch tool (Category C) ──
  if (toolName === 'fetch_web_markdown') {
    const r = jsonTry(content, obj => ({
      title: String(obj.title ?? ''),
      url: String(obj.url ?? ''),
      content: String(obj.content ?? ''),
      error: obj.error ? String(obj.error) : null,
    }));
    if (r) {
      if (r.error) return { summary: `Fetch error: ${truncate(r.error, 60)}`, body: r.error };
      const contentPreview = truncate(r.content.replace(/\n+/g, '\n'), 300);
      const wordCount = r.content.length;
      return { summary: truncate(r.title, 60), body: `${r.title}\n${r.url}\n\n${contentPreview}\n... (${wordCount} chars total)` };
    }
    return { summary: 'Web page', body: truncate(content, 400) };
  }

  // ── Fallback ──
  return { summary: toolLabel(toolName), body: truncate(content, 500) };
}
