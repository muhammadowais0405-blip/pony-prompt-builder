import Tesseract from 'tesseract.js';

let worker = null;

/**
 * Clean and parse text into an array of tags.
 */
export function parsePromptText(text) {
  if (!text) return [];

  const cleaned = text
    .replace(/[\r\n]+/g, ', ')    // Newlines to commas
    .replace(/[|•]/g, ', ')       // Vertical bars/bullets to commas
    .replace(/\s+/g, ' ');        // Collapse whitespace

  return cleaned
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => {
      if (!tag) return false;
      if (tag.length < 2) return false;
      if (tag.length > 100) return false;

      // Filter out likely OCR hallucinations (gibberish)
      // If a tag has too many non-word characters compared to letters, it's probably noise.
      const letters = tag.match(/[a-zA-Z]/g) || [];
      const nonLetters = tag.match(/[^a-zA-Z0-9\s_()]/g) || [];
      
      // If there are more weird symbols than actual letters, drop it.
      if (nonLetters.length > letters.length && letters.length < 5) return false;
      if (letters.length === 0) return false;

      return true;
    });
}

/**
 * Lazily initialize the Tesseract worker only when needed.
 */
async function getWorker() {
  if (worker) return worker;
  console.log('[ocr] Initializing Tesseract worker...');
  worker = await Tesseract.createWorker('eng');
  return worker;
}

/**
 * Process an image File or Blob and return extracted tags.
 */
export async function extractTagsFromImage(file) {
  try {
    const activeWorker = await getWorker();
    const { data: { text } } = await activeWorker.recognize(file);
    return parsePromptText(text);
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to read text from image.');
  }
}

/**
 * Cleanup function to terminate the worker if needed (optional).
 */
export async function terminateOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
