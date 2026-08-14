/**
 * Universal external URL opener compatible with Obsidian Desktop and Mobile (iOS / Android).
 */
export function openExternalUrl(url: string): void {
  if (!url) return;

  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'external-link';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
    }, 200);
  } catch (err) {
    try {
      window.open(url, '_blank');
    } catch (e) {
      console.warn('Failed to open external url:', url, e);
    }
  }
}
