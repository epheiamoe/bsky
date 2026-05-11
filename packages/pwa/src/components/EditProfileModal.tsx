import React, { useState, useRef } from 'react';
import type { BskyClient, ProfileView } from '@bsky/core';
import { useI18n } from '@bsky/app';
import { Icon } from './Icon.js';
import { Modal } from './Modal.js';

interface EditProfileModalProps {
  client: BskyClient;
  profile: ProfileView;
  onClose: () => void;
  onSaved: () => void;
}

export function EditProfileModal({ client, profile, onClose, onSaved }: EditProfileModalProps) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [description, setDescription] = useState(profile.description ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>(profile.avatar ?? '');
  const [bannerPreview, setBannerPreview] = useState<string>(profile.banner ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (setFile: (f: File) => void, setPreview: (url: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setFile(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const params: Parameters<typeof client.putProfile>[0] = {
        displayName: displayName.trim(),
        description: description.trim(),
      };

      if (avatarFile) {
        const buf = new Uint8Array(await avatarFile.arrayBuffer());
        const blob = await client.uploadBlob(buf, avatarFile.type);
        params.avatar = { $type: 'blob', ref: { $link: blob.blob.ref.$link }, mimeType: blob.blob.mimeType, size: blob.blob.size };
      }
      if (bannerFile) {
        const buf = new Uint8Array(await bannerFile.arrayBuffer());
        const blob = await client.uploadBlob(buf, bannerFile.type);
        params.banner = { $type: 'blob', ref: { $link: blob.blob.ref.$link }, mimeType: blob.blob.mimeType, size: blob.blob.size };
      }

      await client.putProfile(params);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} variant="bottom-sheet">
      <div className="bg-white dark:bg-[#0A0A0A] rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><Icon name="arrow-big-left" size={20} /></button>
          <span className="font-semibold text-text-primary">{t('profile.editProfile')}</span>
          <button onClick={handleSave} disabled={saving} className="text-primary font-semibold text-sm disabled:opacity-50">
            {saving ? t('common.loading') : t('dm.send')}
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && <div className="p-2 bg-red-100 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>}

          <div className="relative">
            <div className="h-32 bg-surface rounded-lg overflow-hidden">
              {bannerPreview ? (
                <img src={bannerPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center text-text-secondary text-sm">{t('profile.banner')}</div>
              )}
            </div>
            <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleFileChange(setBannerFile, setBannerPreview)} className="hidden" />
            <button onClick={() => bannerInputRef.current?.click()} className="absolute bottom-2 right-2 px-3 py-1 bg-black/50 text-white text-xs rounded-full hover:bg-black/70 transition-colors">
              {t('profile.change')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold">{profile.displayName?.[0] ?? profile.handle[0]}</span>
              )}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleFileChange(setAvatarFile, setAvatarPreview)} className="hidden" />
            <button onClick={() => avatarInputRef.current?.click()} className="text-primary text-sm hover:underline">
              {t('profile.change')}
            </button>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-1 block">{t('profile.displayName')}</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-[#1A1A1A] text-text-primary focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder={profile.handle}
              maxLength={64}
            />
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-1 block">{t('profile.description')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-[#1A1A1A] text-text-primary focus:outline-none focus:ring-2 focus:ring-primary text-sm resize-none"
              placeholder={t('dm.placeholder')}
              maxLength={2560}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
