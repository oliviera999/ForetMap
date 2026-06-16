import { buildDicebearAvatarUrl, buildUploadedAvatarUrl } from '../../shared/profile/avatarUrl.js';
import { withAppBase } from '../../services/api.js';

export function getGlAvatarUrl(profile, auth = null) {
  const uploadedRel = buildUploadedAvatarUrl(profile?.avatar_path);
  const uploadedUrl = uploadedRel ? withAppBase(uploadedRel) : null;
  if (uploadedUrl) return uploadedUrl;
  const seed =
    profile?.pseudo ||
    profile?.display_name ||
    profile?.email ||
    auth?.displayName ||
    auth?.userId ||
    'gl';
  return buildDicebearAvatarUrl(seed);
}
