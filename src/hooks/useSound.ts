
import { useCallback, useMemo } from 'react';

// A mapping of sound names to their audio file URLs
const soundFiles = {
  click: 'https://cdn.freesound.org/previews/15/157539_1890737-lq.mp3',
  message: 'https://cdn.freesound.org/previews/27/27314_236897-lq.mp3',
  join: 'https://cdn.freesound.org/previews/403/403017_5121236-lq.mp3',
  leave: 'https://cdn.freesound.org/previews/219/219330_4124368-lq.mp3',
  success: 'https://cdn.freesound.org/previews/345/345298_5693119-lq.mp3',
  error: 'https://cdn.freesound.org/previews/142/142608_1843196-lq.mp3',
  cardFlip: 'https://cdn.freesound.org/previews/240/240776_1021953-lq.mp3',
};

type SoundType = keyof typeof soundFiles;

export function useSound() {
  // Memoize the Audio objects to avoid creating new instances on every render
  const audioPlayers = useMemo(() => {
    const players: Partial<Record<SoundType, HTMLAudioElement>> = {};
    if (typeof window !== 'undefined') {
      for (const key in soundFiles) {
        players[key as SoundType] = new Audio(soundFiles[key as SoundType]);
      }
    }
    return players;
  }, []);

  const playSound = useCallback((type: SoundType) => {
    const player = audioPlayers[type];
    if (player) {
      player.currentTime = 0; // Rewind to the start
      player.play().catch(error => {
        // Autoplay is often restricted by browsers, so we catch potential errors.
        console.error(`Could not play sound: ${type}`, error);
      });
    }
  }, [audioPlayers]);

  return {
    playClick: () => playSound('click'),
    playMessage: () => playSound('message'),
    playJoin: () => playSound('join'),
    playLeave: () => playSound('leave'),
    playSuccess: () => playSound('success'),
    playError: () => playSound('error'),
    playCardFlip: () => playSound('cardFlip'),
  };
}
