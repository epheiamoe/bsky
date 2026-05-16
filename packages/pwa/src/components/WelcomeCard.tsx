import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '@bsky/app';
import type { AppConfig } from '../hooks/useAppConfig.js';
import { updateAppConfig, saveAppConfig } from '../hooks/useAppConfig.js';
import { Icon } from './Icon.js';

const STEP_LABELS = ['welcome.step1', 'welcome.stepPronouns', 'welcome.personalTitle', 'welcome.step4'];

const slideVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

const READ_TOOLS = [
  'resolve_handle', 'get_record', 'list_records', 'search_posts',
  'get_timeline', 'get_author_feed', 'get_popular_feed_generators',
  'get_feed_generator', 'get_feed', 'get_post_thread', 'get_post_context',
  'get_post_interactions', 'get_quotes', 'search_actors', 'get_profile',
  'get_connections', 'get_suggested_follows', 'list_notifications',
  'extract_images_from_post', 'download_image', 'view_image',
  'extract_external_link', 'fetch_web_markdown', 'search_web_ddg',
  'search_wikipedia', 'get_lists', 'get_list_feed',
];

const WRITE_TOOLS = [
  'create_post', 'like', 'repost', 'follow', 'create_list', 'edit_list_members',
];

function ToggleSwitch({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <motion.button
      layout
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer ${
        checked ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
      }`}
    >
      <div className="text-left flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-secondary truncate">{desc}</p>
      </div>
      <motion.div
        layout
        className={`relative w-11 h-6 rounded-full shrink-0 ml-3 transition-colors ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <motion.div
          layout
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </motion.div>
    </motion.button>
  );
}

interface WelcomeCardProps {
  onGoToSettings: () => void;
  onSkip: () => void;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
}

export function WelcomeCard({ onGoToSettings, onSkip, config, onConfigChange }: WelcomeCardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [showAllTools, setShowAllTools] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const providerCards = useMemo(() => [
    {
      name: 'DeepSeek',
      desc: t('welcome.deepseekDesc'),
      steps: [t('welcome.deepseekStep1'), t('welcome.deepseekStep2'), t('welcome.deepseekStep3')],
      baseUrl: 'https://api.deepseek.com',
      link: 'https://platform.deepseek.com/api_keys',
      linkLabel: 'platform.deepseek.com',
    },
    {
      name: 'OpenAI',
      desc: t('welcome.openaiDesc'),
      steps: [t('welcome.openaiStep1'), t('welcome.openaiStep2'), t('welcome.openaiStep3')],
      baseUrl: 'https://api.openai.com',
      link: 'https://platform.openai.com/api-keys',
      linkLabel: 'platform.openai.com',
    },
    {
      name: 'xAI Grok',
      desc: t('welcome.xaiDesc'),
      steps: [t('welcome.xaiStep1'), t('welcome.xaiStep2'), t('welcome.xaiStep3')],
      baseUrl: 'https://api.x.ai',
      link: 'https://console.x.ai',
      linkLabel: 'console.x.ai',
    },
    {
      name: 'Mistral',
      desc: t('welcome.mistralDesc'),
      steps: [t('welcome.mistralStep1'), t('welcome.mistralStep2'), t('welcome.mistralStep3')],
      baseUrl: 'https://api.mistral.ai',
      link: 'https://console.mistral.ai/api-keys',
      linkLabel: 'console.mistral.ai',
    },
    {
      name: 'OpenRouter',
      desc: t('welcome.openrouterDesc'),
      steps: [t('welcome.openrouterStep1'), t('welcome.openrouterStep2'), t('welcome.openrouterStep3')],
      baseUrl: 'https://openrouter.ai',
      link: 'https://openrouter.ai/keys',
      linkLabel: 'openrouter.ai',
    },
  ], [t]);

  const [pronounsRad, setPronounsRad] = useState<'skip' | 'neutral' | 'custom'>(
    !config.userPronouns ? 'skip' : config.userPronouns === 'neutral' ? 'neutral' : 'custom'
  );
  const [pronounsCustom, setPronounsCustom] = useState(
    config.userPronouns && config.userPronouns !== 'neutral' ? config.userPronouns : ''
  );

  const [personalDark, setPersonalDark] = useState(config.darkMode);
  const [personalCvd, setPersonalCvd] = useState(config.cvdMode);
  const [personalVision, setPersonalVision] = useState(config.visionEnabled);

  const handlePronounsSave = () => {
    const final = pronounsRad === 'skip' ? '' : pronounsRad === 'neutral' ? 'neutral' : pronounsCustom;
    const updated = { ...config, userPronouns: final };
    updateAppConfig(updated);
    onConfigChange(updated);
  };

  const handlePersonalSave = () => {
    const updated = { ...config, darkMode: personalDark, cvdMode: personalCvd, visionEnabled: personalVision };
    updateAppConfig(updated);
    onConfigChange(updated);
    document.documentElement.classList.toggle('dark', personalDark);
    document.documentElement.classList.toggle('cvd', personalCvd);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', personalDark ? '#000000' : '#FFFFFF');
  };

  const handleFinish = () => {
    handlePronounsSave();
    handlePersonalSave();
    onGoToSettings();
  };

  const handleSkipAll = () => {
    handlePronounsSave();
    handlePersonalSave();
    onSkip();
  };

  const stepLabels = STEP_LABELS.map(s => t(s));
  const stepDotsCount = STEP_LABELS.length;

  return (
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-border max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl">
        {/* Progress dots — only for first 4 steps, not done */}
        {step < 4 && (
          <div className="flex-shrink-0 px-6 pt-6 pb-4">
            <div className="flex items-center justify-center gap-1">
              {Array.from({ length: stepDotsCount }).map((_, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <motion.div
                      className="h-px flex-1 max-w-8"
                      animate={{ backgroundColor: i <= step ? '#3b82f6' : '#e5e7eb' }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                  <motion.button
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                      i === step
                        ? 'bg-primary text-white'
                        : i < step
                          ? 'bg-primary/20 text-primary'
                          : 'bg-surface text-text-secondary/40 border border-border'
                    }`}
                    aria-label={stepLabels[i]}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {i < step ? <Icon name="badge-check" size={12} /> : i + 1}
                  </motion.button>
                </React.Fragment>
              ))}
            </div>
            <div className="flex justify-between mt-1.5 px-1">
              {Array.from({ length: stepDotsCount }).map((_, i) => (
                <span
                  key={i}
                  className={`text-[10px] transition-colors ${
                    i <= step ? 'text-text-primary' : 'text-text-secondary/40'
                  }`}
                >
                  {stepLabels[i]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {/* Step 0: Welcome + Auth */}
              {step === 0 && (
                <div className="space-y-4 pb-4">
                  <h2 className="text-xl font-bold text-text-primary">{t('welcome.title')}</h2>
                  <p className="text-text-secondary text-sm">{t('welcome.subtitle')}</p>

                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-xs text-text-secondary">{t('welcome.privacyNote')}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">{t('welcome.readyNow')}</p>
                    <p className="text-text-secondary text-xs">{t('welcome.readyNowDesc')}</p>
                  </div>

                  {/* Authorization */}
                  <div className="p-4 rounded-xl border border-border space-y-3">
                    <p className="text-xs text-text-secondary leading-relaxed">{t('welcome.authIntro')}</p>
                    <div className="grid gap-2 text-xs">
                      <div className="flex gap-3 items-start">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-[10px] font-bold">R</span>
                        <div>
                          <p className="font-medium text-text-primary">{t('welcome.authReadTitle')}</p>
                          <p className="text-text-secondary">{t('welcome.authReadDesc')}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 items-start">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px] font-bold">W</span>
                        <div>
                          <p className="font-medium text-text-primary">{t('welcome.authWriteTitle')}</p>
                          <p className="text-text-secondary">{t('welcome.authWriteDesc')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Show all tools toggle */}
                    <motion.button
                      onClick={() => setShowAllTools(!showAllTools)}
                      className="text-xs text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                    >
                      {showAllTools ? t('welcome.hideTools') : t('welcome.showAllTools', { n: READ_TOOLS.length + WRITE_TOOLS.length })}
                      <motion.div animate={{ rotate: showAllTools ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <Icon name="chevron-down" size={12} />
                      </motion.div>
                    </motion.button>

                    <AnimatePresence>
                      {showAllTools && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2 pt-1 max-h-48 overflow-y-auto">
                            <div>
                              <p className="text-[11px] font-semibold text-blue-500 mb-0.5 flex items-center gap-1">
                                <Icon name="file-text" size={11} />
                                Read ({READ_TOOLS.length})
                              </p>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                {READ_TOOLS.map(name => (
                                  <div key={name} className="text-[11px] text-text-secondary font-mono truncate">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/10 inline-block mr-1.5 shrink-0" />
                                    {name}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold text-amber-500 mb-0.5 flex items-center gap-1">
                                <Icon name="pen" size={11} />
                                Write ({WRITE_TOOLS.length}) <span className="text-text-secondary/50 font-normal">— confirm required</span>
                              </p>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                {WRITE_TOOLS.map(name => (
                                  <div key={name} className="text-[11px] text-text-secondary font-mono truncate">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500/10 inline-block mr-1.5 shrink-0" />
                                    {name}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Step 1: Pronouns */}
              {step === 1 && (
                <div className="space-y-4 pb-4">
                  <h2 className="text-xl font-bold text-text-primary">{t('welcome.pronounsTitle')}</h2>
                  <p className="text-text-secondary text-sm">{t('welcome.pronounsDesc')}</p>

                  {(['skip', 'neutral', 'custom'] as const).map(val => {
                    const labels: Record<string, { title: string; desc: string }> = {
                      skip: { title: t('user.pronounsSkip'), desc: 'AI 提示词中不注入代词信息' },
                      neutral: { title: t('user.pronounsNeutral'), desc: 'AI 提示词注入「请使用中性代词称呼用户」' },
                      custom: { title: t('user.pronounsCustom'), desc: 'AI 提示词注入「用户的指定代词是 X」' },
                    };
                    return (
                      <motion.button
                        key={val}
                        layout
                        onClick={() => setPronounsRad(val)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                          pronounsRad === val ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                          pronounsRad === val ? 'border-primary' : 'border-border'
                        }`}>
                          {pronounsRad === val && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-2 h-2 rounded-full bg-primary"
                            />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-text-primary">{labels[val].title}</p>
                          <p className="text-xs text-text-secondary">{labels[val].desc}</p>
                        </div>
                      </motion.button>
                    );
                  })}

                  {pronounsRad === 'custom' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <input
                        type="text" value={pronounsCustom}
                        onChange={e => { setPronounsCustom(e.target.value); setPronounsRad('custom'); }}
                        placeholder="they/them, she/her, he/him, ze/zir..."
                        className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </motion.div>
                  )}
                </div>
              )}

              {/* Step 2: Personalization */}
              {step === 2 && (
                <div className="space-y-4 pb-4">
                  <h2 className="text-xl font-bold text-text-primary">{t('welcome.personalTitle')}</h2>
                  <p className="text-text-secondary text-sm">{t('welcome.personalDesc')}</p>

                  <div className="space-y-2">
                    <ToggleSwitch
                      checked={personalDark}
                      onChange={v => {
                        setPersonalDark(v);
                        document.documentElement.classList.toggle('dark', v);
                        const meta = document.querySelector('meta[name="theme-color"]');
                        if (meta) meta.setAttribute('content', v ? '#000000' : '#FFFFFF');
                      }}
                      label={t('welcome.darkMode')}
                      desc={t('welcome.darkModeDesc')}
                    />
                    <ToggleSwitch
                      checked={personalCvd}
                      onChange={v => {
                        setPersonalCvd(v);
                        document.documentElement.classList.toggle('cvd', v);
                      }}
                      label={t('welcome.cvdMode')}
                      desc={t('welcome.cvdModeDesc')}
                    />
                    <ToggleSwitch
                      checked={personalVision}
                      onChange={setPersonalVision}
                      label={t('welcome.aiAlt')}
                      desc={t('welcome.aiAltDesc')}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: AI Setup */}
              {step === 3 && (
                <div className="space-y-4 pb-4">
                  <h2 className="text-xl font-bold text-text-primary">{t('welcome.setupTitle')}</h2>
                  <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('welcome.aiProviders')}</p>

                  {providerCards.map(p => (
                    <motion.div
                      key={p.name}
                      layout
                      className="rounded-xl border border-border overflow-hidden"
                    >
                      <motion.button
                        onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-primary/5 transition-colors"
                        aria-expanded={expanded === p.name}
                      >
                        <div>
                          <span className="text-text-primary font-medium text-sm">{p.name}</span>
                          <span className="text-text-secondary text-xs block">{p.desc}</span>
                        </div>
                        <motion.div
                          animate={{ rotate: expanded === p.name ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Icon name="chevron-down" size={16} className="text-text-secondary/50" />
                        </motion.div>
                      </motion.button>

                      <AnimatePresence>
                        {expanded === p.name && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 space-y-3">
                              <ol className="text-text-secondary text-xs space-y-1.5 list-decimal list-inside">
                                {p.steps.map((s, i) => <li key={i}>{s}</li>)}
                              </ol>
                              <p className="text-text-secondary text-xs">
                                Base URL: <code className="text-primary text-[11px] bg-primary/5 px-1 py-0.5 rounded">{p.baseUrl}</code>
                              </p>
                              <a
                                href={p.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                                {p.linkLabel}
                              </a>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}

                  <div className="rounded-xl border border-border p-4">
                    <p className="text-text-primary font-medium text-sm mb-1">{t('welcome.customTitle')}</p>
                    <p className="text-text-secondary text-xs">{t('welcome.customDesc')}</p>
                  </div>
                </div>
              )}

              {/* Step 4: Done */}
              {step === 4 && (
                <div className="space-y-4 pb-4">
                  <div className="text-center pt-1 pb-2">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    >
                      <Icon name="badge-check" size={48} className="text-green-500 mx-auto" />
                    </motion.div>
                    <h2 className="text-xl font-bold text-text-primary mt-2">{t('welcome.finishTitle')}</h2>
                    <p className="text-text-secondary text-sm">{t('welcome.finishDesc')}</p>
                  </div>

                  {/* BYOK card */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2"
                  >
                    <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <Icon name="badge-info" size={14} className="text-primary" />
                      {t('welcome.byokTitle')}
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed">{t('welcome.byokDesc')}</p>
                  </motion.div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 p-6 pt-4 flex items-center gap-3 border-t border-border">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="py-2.5 px-4 rounded-lg border border-border text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
            >
              {t('common.back')}
            </button>
          ) : (
            <button
              onClick={handleSkipAll}
              className="py-2.5 px-4 rounded-lg border border-border text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
            >
              {t('welcome.skip')}
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button
              onClick={() => {
                if (step === 1) handlePronounsSave();
                if (step === 2) handlePersonalSave();
                setStep(s => s + 1);
              }}
              className="py-2.5 px-6 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {step === 0 ? t('welcome.authBtn') : t('welcome.continue')}
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="py-2.5 px-6 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              {t('welcome.finishBtn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
