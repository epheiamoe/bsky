import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useStdout } from 'ink';
import { BskyClient, createTools, AIAssistant } from '@bsky/core';
import type { PostView, AIConfig, ToolDescriptor } from '@bsky/core';
import { Sidebar } from './Sidebar.jsx';
import { PostList } from './PostList.jsx';
import { AIPanel } from './AIPanel.jsx';
import { ComposePanel } from './Dialogs.jsx';

interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  aiConfig: AIConfig;
}

export interface AppProps {
  config: AppConfig;
  isRawModeSupported?: boolean;
}

type FocusTarget = 'main' | 'ai' | 'compose';

export function App({ config, isRawModeSupported = true }: AppProps) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(() => stdout?.columns ?? 80);
  const [rows, setRows] = useState(() => stdout?.rows ?? 24);

  const [client, setClient] = useState<BskyClient | null>(null);
  const [assistant, setAssistant] = useState<AIAssistant | null>(null);
  const [tools, setTools] = useState<ToolDescriptor[]>([]);

  const [activeTab, setActiveTab] = useState('timeline');
  const [posts, setPosts] = useState<PostView[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [focusedPanel, setFocusedPanel] = useState<FocusTarget>('main');
  const [notifCount, setNotifCount] = useState(0);

  // Terminal resize handler
  useEffect(() => {
    const onResize = () => {
      setCols(stdout?.columns ?? 80);
      setRows(stdout?.rows ?? 24);
    };
    stdout?.on('resize', onResize);
    return () => { stdout?.off('resize', onResize); };
  }, [stdout]);

  // Initialize
  useEffect(() => {
    const init = async () => {
      const c = new BskyClient();
      await c.login(config.blueskyHandle, config.blueskyPassword);
      const t = createTools(c);
      const a = new AIAssistant(config.aiConfig);
      a.setTools(t);

      setClient(c);
      setTools(t);
      setAssistant(a);
      loadTimeline(c);

      // Load notification count
      try {
        const notifs = await c.listNotifications(5);
        setNotifCount(notifs.notifications.filter(n => !n.isRead).length);
      } catch {}
    };
    init().catch(console.error);
  }, []);

  const loadTimeline = async (c: BskyClient) => {
    setLoading(true);
    try {
      const res = await c.getTimeline(20);
      setPosts(res.feed.map((f) => f.post));
      setCursor(res.cursor);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard input — only when raw mode is supported
  useEffect(() => {
    if (!isRawModeSupported) return;

    let escSeq = '';
    const onData = (data: Buffer) => {
      const str = data.toString();
      for (let i = 0; i < str.length; i++) {
        const ch = str[i]!;

        // ── Escape sequence parsing ──
        if (escSeq) {
          escSeq += ch;
          if (escSeq.startsWith('\x1b[') && escSeq.length >= 3) {
            const final = ch;
            if (final === 'A') { // ↑
              if (focusedPanel === 'main') setSelectedIndex((x: number) => Math.max(0, x - 1));
              escSeq = ''; continue;
            }
            if (final === 'B') { // ↓
              if (focusedPanel === 'main') setSelectedIndex((x: number) => Math.min(posts.length - 1, x + 1));
              escSeq = ''; continue;
            }
            if (final >= '0' && final <= '9' || final === ';') continue; // CSI params
            escSeq = ''; // unrecognized
          }
          if (escSeq.length > 6) escSeq = '';
          continue;
        }

        if (ch === '\x1b') { escSeq = '\x1b'; continue; }
        if (ch === '\x07') { // Ctrl+G — force open AI
          setShowAIPanel(true);
          setFocusedPanel('ai');
          continue;
        }
        if (ch === '\t') { // Tab — toggle focus
          if (showAIPanel) {
            setFocusedPanel(f => f === 'ai' ? 'main' : 'ai');
          }
          continue;
        }

        const key = ch.toLowerCase();

        // ── Non-focus keys (always work) ──
        switch (ch) {
          case '\x1b': // Esc
            if (focusedPanel === 'ai') setFocusedPanel('main');
            else if (showCompose) setShowCompose(false);
            else if (showAIPanel) { setShowAIPanel(false); setFocusedPanel('main'); }
            break;
          case '\r': case '\n':
            if (focusedPanel === 'main' && posts[selectedIndex]) {
              setShowAIPanel(true);
              setFocusedPanel('ai');
            }
            break;
        }

        if (ch === '\x1b' || ch === '\r' || ch === '\n') continue;

        // ── Main panel keys (only when main has focus) ──
        if (focusedPanel === 'main' || !showAIPanel) {
          switch (key) {
            case 'j': setSelectedIndex((x: number) => Math.min(posts.length - 1, x + 1)); break;
            case 'k': setSelectedIndex((x: number) => Math.max(0, x - 1)); break;
            case 't': setActiveTab('timeline'); break;
            case 'n': setActiveTab('notifications'); break;
            case 'p': setActiveTab('profile'); break;
            case 's': setActiveTab('search'); break;
            case 'a': setShowAIPanel(v => !v); setFocusedPanel(v => v ? 'main' : 'ai'); break;
            case 'c': setShowCompose(true); setFocusedPanel('compose'); break;
          }
        }
      }
    };

    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [posts.length, showAIPanel, focusedPanel, showCompose, isRawModeSupported]);

  // Compute layout widths dynamically
  const sidebarW = Math.max(18, Math.floor(cols * 0.16));
  const aiPanelW = showAIPanel ? Math.max(32, Math.floor(cols * 0.30)) : 0;
  const mainW = cols - sidebarW - aiPanelW - 6; // 6 = borders/padding

  const handleCompose = async (text: string) => {
    if (!client) return;
    setLoading(true);
    try {
      await client.createRecord(client.getDID(), 'app.bsky.feed.post', {
        text, createdAt: new Date().toISOString(),
      });
      setShowCompose(false);
      setFocusedPanel('main');
      await loadTimeline(client);
    } catch (err) {
      console.error('Post failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const onlineStatus = client?.isAuthenticated() ? '🟢' : '🔴';
  const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* ═══ Header ═══ */}
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" bold>
          {' 🦋 Bluesky TUI '}
        </Text>
        <Text backgroundColor="#1a56db" color="white">
          {' '}@{config.blueskyHandle}
          {' '}
        </Text>
        <Text backgroundColor="#1a56db" color="cyanBright">
          {onlineStatus}
        </Text>
        <Box flexGrow={1}>
          <Text backgroundColor="#1a56db">{' '}</Text>
        </Box>
        <Text backgroundColor="#1a56db" color="white">
          {showAIPanel ? (focusedPanel === 'ai' ? ' AI [聚焦中]' : ' AI') : ''}
        </Text>
        <Box flexGrow={1}>
          <Text backgroundColor="#1a56db">{' '}</Text>
        </Box>
        <Text backgroundColor="#1a56db" color="gray" dimColor>
          {timeStr}{' '}
        </Text>
      </Box>

      {/* ═══ Body ═══ */}
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar
          activeTab={activeTab}
          width={sidebarW}
          notifCount={notifCount}
        />

        <Box flexDirection="column" width={mainW} borderStyle="single" borderColor="gray" paddingX={1}>
          <Box height={1}>
            <Text bold>
              {activeTab === 'timeline' ? '📋 时间线' :
               activeTab === 'notifications' ? '🔔 通知' :
               activeTab === 'profile' ? '👤 个人资料' :
               activeTab === 'search' ? '🔍 搜索' : '📋'}
            </Text>
            {focusedPanel === 'main' && showAIPanel && (
              <Text color="cyan"> [主面板聚焦 · Tab 切换到 AI]</Text>
            )}
            {!showAIPanel && (
              <Text color="cyan"> [聚焦]</Text>
            )}
          </Box>
          <PostList
            posts={posts}
            loading={loading}
            cursor={cursor}
            selectedIndex={selectedIndex}
            focusedPanel={focusedPanel}
            showAIPanel={showAIPanel}
            width={mainW - 2}
            height={rows - 7}
          />
        </Box>

        {showAIPanel && (
          <AIPanel
            visible={showAIPanel && isRawModeSupported}
            assistant={assistant}
            postContext={posts[selectedIndex]?.uri}
            onClose={() => { setShowAIPanel(false); setFocusedPanel('main'); }}
            focused={focusedPanel === 'ai'}
            width={aiPanelW}
          />
        )}
      </Box>

      {/* ═══ Footer ═══ */}
      <Box width={cols} height={1}>
        <Text backgroundColor="#1a56db" color="white" dimColor>
          {' t:时间线 n:通知 p:资料 s:搜索 a:AI c:发帖 Tab:切换焦点 Esc:返回 ↑↓/jk:导航 Enter:选中AI '}
        </Text>
        <Box flexGrow={1}><Text backgroundColor="#1a56db">{' '}</Text></Box>
        <Text backgroundColor="#1a56db" color="white" dimColor>
          {`${selectedIndex + 1}/${posts.length}`}
          {cursor ? ' +' : ''}
          {' '}
        </Text>
      </Box>

      {!isRawModeSupported && (
        <Box width={cols} height={1}>
          <Text backgroundColor="#92400e" color="yellow">⚠ 当前终端不支持 raw mode，键盘导航与 AI 对话不可用。请在 Windows Terminal / iTerm2 / Kitty 中运行。</Text>
        </Box>
      )}

      {showCompose && isRawModeSupported && (
        <ComposePanel
          visible={showCompose}
          onPost={handleCompose}
          onClose={() => { setShowCompose(false); setFocusedPanel('main'); }}
          focused={focusedPanel === 'compose'}
        />
      )}
    </Box>
  );
}
