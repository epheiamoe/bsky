import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { ComposeMedia, ComposePostItem, AppDraft } from '@bsky/app';
import { useI18n } from '@bsky/app';

interface ComposeViewProps {
  posts: ComposePostItem[];
  activePostIdx: number;
  setPostText: (id: string, text: string) => void;
  replyTo?: string;
  quoteUri?: string;
  submitting: boolean;
  error: string | null;
  composeMedia: ComposeMedia[];
  uploadError: string | null;
  composeInfo: string | null;
  mode: 'text' | 'media' | 'drafts' | 'savePrompt' | 'polishReq' | 'polishResult' | 'altReq';
  imagePathInput: string | null;
  setImagePathInput: (v: string | null) => void;
  drafts: AppDraft[];
  draftListIdx: number;
  cols: number;
  polishResult?: string;
  polishError?: string | null;
  polishPhase?: string;
  polishRequirement?: string;
  setPolishRequirement?: (v: string) => void;
  altReqText?: string;
  setAltReqText?: (v: string) => void;
}

export function ComposeView({
  posts, activePostIdx, setPostText,
  replyTo, quoteUri, submitting, error,
  composeMedia, uploadError, composeInfo,
  mode, imagePathInput, setImagePathInput,
  drafts, draftListIdx, cols,
  polishResult, polishError, polishPhase,
  polishRequirement, setPolishRequirement,
  altReqText, setAltReqText,
}: ComposeViewProps) {
  const { t } = useI18n();
  const isReply = !!replyTo;
  const activePost = posts[activePostIdx] ?? posts[0];

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box height={1}>
        <Text bold color="yellow">
          {isReply ? '✏️ ' + t('compose.titleReply') : posts.length > 1 ? '✏️ ' + t('compose.threadTitle') : '✏️ ' + t('compose.title')}
        </Text>
        <Text dimColor>
          {mode === 'savePrompt' ? ' ' + t('compose.draftSavePrompt') :
           mode === 'drafts' ? ' ' + t('compose.draftListHeader') :
           mode === 'media' ? ' ' + t('keys.composeMedia') :
           ' ' + (posts.length > 1 ? 'Tab:切换 Ctrl+N:添加 Ctrl+X:删除 ' : '') + t('keys.compose')}
        </Text>
      </Box>

      {/* Reply indicator */}
      {replyTo && (
        <Box>
          <Text dimColor>{t('compose.replyTo')} </Text>
          <Text color="blue">{replyTo}</Text>
        </Box>
      )}

      {/* Quote indicator */}
      {quoteUri && (
        <Box borderStyle="single" borderColor="magenta" paddingX={1} marginBottom={0}>
          <Text color="magenta">{'📌 '}{t('compose.quoteTo')} </Text>
          <Text color="white">{quoteUri}</Text>
        </Box>
      )}

      {/* Post navigation */}
      {!isReply && posts.length > 1 && (
        <Box height={1} marginBottom={0}>
          {posts.map((p, i) => (
            <Box key={p.id}>
              <Text
                backgroundColor={i === activePostIdx ? '#1e40af' : undefined}
                color={i === activePostIdx ? 'cyanBright' : 'dim'}
              >
                [{i + 1}]{p.text.trim() ? '*' : ''}
              </Text>
              {i < posts.length - 1 && <Text> </Text>}
            </Box>
          ))}
        </Box>
      )}

      {/* Save prompt */}
      {mode === 'savePrompt' && (
        <Box borderStyle="single" borderColor="yellow" padding={1} marginTop={0}>
          <Text color="yellow">{t('compose.draftSaveHint')}</Text>
          <Text>{' [Y] '}{t('compose.saveDraft')}{' [N] '}{t('action.cancel')}{' [Esc] 继续'}</Text>
        </Box>
      )}

      {/* Draft list */}
      {mode === 'drafts' && (
        <Box flexDirection="column" marginTop={0}>
          {drafts.length === 0 ? (
            <Text dimColor>{t('compose.noDrafts')}</Text>
          ) : (
            drafts.map((d, i) => {
              const isSel = i === draftListIdx;
              const preview = ((d.posts[0]?.text ?? '') + '').slice(0, 40).replace(/\n/g, ' ');
              return (
                <Box key={d.id} height={1}>
                  <Text backgroundColor={isSel ? '#1e40af' : undefined} color={isSel ? 'cyanBright' : undefined}>
                    {isSel ? '▶ ' : '  '}{preview}{(d.posts[0]?.text?.length ?? 0) > 40 ? '…' : ''}
                  </Text>
                  {d.replyTo && <Text dimColor>{' 🔁'}</Text>}
                  {d.quoteUri && <Text color="magenta">{' 📌'}</Text>}
                  {d.posts.length > 1 && <Text dimColor>{` [${d.posts.length}]`}</Text>}
                  {d.syncStatus === 'local' && <Text color="yellow">{' ⚠'}</Text>}
                </Box>
              );
            })
          )}
        </Box>
      )}

      {/* Text / media / polish input */}
      {mode === 'media' ? (
        <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}>
          <TextInput
            value={imagePathInput ?? ''}
            onChange={setImagePathInput}
            placeholder={t('compose.mediaPathPlaceholder')}
          />
        </Box>
      ) : mode === 'polishReq' ? (
        <Box borderStyle="single" borderColor="magenta" padding={1} marginTop={0}>
          <TextInput
            value={polishRequirement ?? ''}
            onChange={setPolishRequirement ?? (() => {})}
            placeholder={t('action.polishPlaceholder')}
          />
        </Box>
      ) : mode === 'polishResult' ? (
        <Box flexDirection="column" borderStyle="single" borderColor={polishError ? 'red' : 'green'} padding={1} marginTop={0}>
          {polishPhase === 'loading' ? (
            <Text color="cyan">{t('action.polishing')}</Text>
          ) : polishError ? (
            <Text color="red">{polishError}</Text>
          ) : (
            <Box flexDirection="column">
              <Text>{polishResult}</Text>
              <Box height={1}>
                <Text dimColor>{'[R] '}{t('action.replace')}{' · [C] '}{t('action.copy')}{' · [Esc] '}{t('action.cancel')}</Text>
              </Box>
            </Box>
          )}
        </Box>
      ) : mode === 'altReq' ? (
        <Box borderStyle="single" borderColor="green" padding={1} marginTop={0}>
          <TextInput
            value={altReqText ?? ''}
            onChange={setAltReqText ?? (() => {})}
            placeholder={t('compose.altPlaceholder')}
          />
        </Box>
      ) : mode === 'drafts' || mode === 'savePrompt' ? (
        <Box height={1} />
      ) : (
        <Box borderStyle="single" borderColor="gray" padding={1} marginTop={0}>
          <TextInput
            value={activePost?.text ?? ''}
            onChange={(v) => setPostText(activePost?.id ?? '', v)}
            placeholder={t('compose.placeholder')}
          />
        </Box>
      )}

      {/* Status line */}
      <Box height={1}>
        {mode === 'media' ? (
          <Text dimColor>{'📎 '}{t('compose.mediaInputMode')}</Text>
        ) : mode === 'polishReq' ? (
          <Text dimColor>{t('action.polish')}{': Enter '}{t('action.confirm')}{' · Esc '}{t('action.cancel')}</Text>
        ) : mode === 'altReq' ? (
          <Text dimColor>{t('compose.altLabel')}{': Enter '}{t('action.confirm')}{' · Esc '}{t('action.cancel')}</Text>
        ) : mode === 'polishResult' ? null : mode === 'text' ? (
          <>
            <Text color={(activePost?.text?.length ?? 0) > 280 ? 'yellow' : undefined}>
              {(activePost?.text?.length ?? 0)}/300
              {posts.length > 1 && ` [${activePostIdx + 1}/${posts.length}]`}
            </Text>
            {composeMedia.length > 0 && <Text color="green">{' 📎 ' + composeMedia.length}</Text>}
          </>
        ) : null}
        {submitting && <Text color="cyan">{' '}{t('action.sending')}</Text>}
        {uploadError && <Text color="red">{' '}{uploadError}</Text>}
        {error && <Text color="red">{' '}{error}</Text>}
      </Box>

      {/* Media ALT display */}
      {composeMedia.length > 0 && mode !== 'media' && mode !== 'altReq' && (
        <Box flexDirection="column" marginTop={0}>
          {composeMedia.map((m, i) => (
            <Box key={i} height={1}>
              <Text dimColor>{'  📎 '}{m.type}{i + 1}</Text>
              {m.alt.trim() && <Text dimColor>{' ALT: '}{m.alt}</Text>}
            </Box>
          ))}
        </Box>
      )}

      {composeInfo && (
        <Box height={1}><Text color="yellow">{'💡 '}{composeInfo}</Text></Box>
      )}
    </Box>
  );
}
