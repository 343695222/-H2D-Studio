/**
 * Figma Clipboard Utilities
 * 
 * Handles copying capture tree data to clipboard in a format that Figma can recognize.
 * This replicates the encoding logic from src/lib/encoding.ts for the web frontend.
 */

import type { CaptureTree } from '../types/capture.ts';

/**
 * Convert a Uint8Array to a data-URL string via FileReader.
 */
async function uint8ArrayToDataUrl(data: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result as string),
      onerror: () => reject(reader.error),
    });
    reader.readAsDataURL(
      new File([data as BlobPart], '', { type: 'application/octet-stream' })
    );
  });
}

/**
 * Wrap a JSON string for clipboard transport by base64-encoding it and
 * embedding it inside HTML comment markers that the paste handler can recognise.
 * 
 * This matches the format used in src/lib/encoding.ts wrapForClipboard()
 */
async function wrapForClipboard(jsonString: string): Promise<Blob> {
  const dataUrl = await uint8ArrayToDataUrl(
    new TextEncoder().encode(jsonString)
  );
  const base64Payload = dataUrl.slice(dataUrl.indexOf(',') + 1);

  const openTag = '<!--(figh2d)';
  const closeTag = '(/figh2d)-->';
  const html =
    '<span data-h2d="' + openTag + base64Payload + closeTag + '"></span>';

  return new Blob([html], { type: 'text/html' });
}

/**
 * Copy capture tree to clipboard for pasting into Figma.
 * 
 * This function:
 * 1. Serializes the capture tree to JSON
 * 2. Wraps it in the h2d clipboard format
 * 3. Writes both HTML and plain text to the clipboard
 */
export async function copyToFigma(captureTree: CaptureTree): Promise<void> {
  if (!captureTree) {
    throw new Error('No capture tree to copy');
  }

  // 1. Serialize to JSON string
  const jsonString = JSON.stringify(captureTree);

  // 2. Wrap for clipboard (creates HTML blob with h2d format)
  const htmlBlob = await wrapForClipboard(jsonString);

  // 3. Create plain text blob
  const textBlob = new Blob([jsonString], { type: 'text/plain' });

  // 4. Write to clipboard
  const clipboardItem = new ClipboardItem({
    'text/html': htmlBlob,
    'text/plain': textBlob,
  });

  await navigator.clipboard.write([clipboardItem]);
}

/**
 * Check if clipboard API is available
 */
export function isClipboardAvailable(): boolean {
  return typeof navigator !== 'undefined' && 
         !!navigator.clipboard && 
         typeof navigator.clipboard.write === 'function';
}

/**
 * Copy raw JSON to clipboard (fallback)
 */
export async function copyJSONToClipboard(data: unknown): Promise<void> {
  const jsonString = JSON.stringify(data, null, 2);
  await navigator.clipboard.writeText(jsonString);
}
