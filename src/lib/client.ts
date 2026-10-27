import type { AppState, Command, Reply } from '../types';

export const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

export async function command(message: Command): Promise<AppState> {
  if (!isExtension) throw new Error('Load the built extension in Chrome to connect Gmail.');
  const reply = await chrome.runtime.sendMessage<Command, Reply>(message);
  if (!reply) throw new Error('The extension did not respond. Reload it from chrome://extensions and try again.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.state;
}

export function subscribe(listener: (state: AppState) => void): () => void {
  if (!isExtension) return () => {};
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const value = changes.unclutter?.newValue as { state?: AppState } | undefined;
    if (area === 'local' && value?.state) listener(value.state);
  };
  chrome.storage.onChanged.addListener(onChange);
  return () => chrome.storage.onChanged.removeListener(onChange);
}
