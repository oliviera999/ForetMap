'use strict';

const { getSettingValue } = require('../settings');

const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

function parseReactionEmojiList(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [...DEFAULT_REACTIONS];
  const tokens = raw
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => item.length <= 16);
  const unique = [...new Set(tokens)].slice(0, 24);
  return unique.length > 0 ? unique : [...DEFAULT_REACTIONS];
}

async function getAllowedReactionSet() {
  const configured = await getSettingValue('ui.reactions.allowed_emojis', DEFAULT_REACTIONS.join(' '));
  return new Set(parseReactionEmojiList(configured));
}

function normalizeEmoji(value, allowedReactions) {
  const emoji = String(value || '').trim();
  return allowedReactions.has(emoji) ? emoji : '';
}

module.exports = {
  DEFAULT_REACTIONS,
  parseReactionEmojiList,
  getAllowedReactionSet,
  normalizeEmoji,
};
