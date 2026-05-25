import { applyMarkdownHtmlImage } from '../../utils/markdown.js';

export function insertHtmlImageAtSelection(value, selectionStart, selectionEnd, url, alt = 'Image', frame = null) {
  return applyMarkdownHtmlImage(value, selectionStart, selectionEnd, url, alt, frame);
}
