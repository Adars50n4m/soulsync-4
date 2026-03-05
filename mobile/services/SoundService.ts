import { Audio } from 'expo-av';

class SoundService {
  private notificationSound: Audio.Sound | null = null;
  private ringtoneSound: Audio.Sound | null = null;
  private dialingSound: Audio.Sound | null = null;
  private ringingSound: Audio.Sound | null = null;
  private callEndSound: Audio.Sound | null = null;

  private isPlayingRingtone = false;
  private isPlayingDialing = false;
  private isPlayingRinging = false;

  private lastNotificationTime = 0;

  async playNotification() {
    const now = Date.now();
    if (now - this.lastNotificationTime < 1000) return;
    this.lastNotificationTime = now;
    
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/notification.wav'),
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );
      this.notificationSound = sound;
      console.log('[SoundService] Playing notification sound...');
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log('[SoundService] Error playing notification sound:', error);
    }
  }

  async playRingtone() {
    if (this.isPlayingRingtone) return;
    try {
      this.stopAll();
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/ringtone.mp3'),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      this.ringtoneSound = sound;
      this.isPlayingRingtone = true;
      console.log('[SoundService] Playing ringtone...');
    } catch (error) {
      console.log('[SoundService] Error playing ringtone (file might be missing):', error);
    }
  }

  async playDialing() {
    if (this.isPlayingDialing) return;
    try {
      this.stopAll();
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/dialing.mp3'),
        { shouldPlay: true, isLooping: true, volume: 0.6 }
      );
      this.dialingSound = sound;
      this.isPlayingDialing = true;
      console.log('[SoundService] Playing dialing tone...');
    } catch (error) {
      console.log('[SoundService] Error playing dialing tone:', error);
    }
  }

  async playRinging() {
    if (this.isPlayingRinging) return;
    try {
      this.stopAll();
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/ringing.mp3'),
        { shouldPlay: true, isLooping: true, volume: 0.6 }
      );
      this.ringingSound = sound;
      this.isPlayingRinging = true;
      console.log('[SoundService] Playing ringing tone...');
    } catch (error) {
      console.log('[SoundService] Error playing ringing tone:', error);
    }
  }

  async playCallEnd() {
    try {
      this.stopAll();
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/call_end.mp3'),
        { shouldPlay: true, isLooping: false, volume: 0.8 }
      );
      this.callEndSound = sound;
      console.log('[SoundService] Playing call end sound...');
      
      // Cleanup after play
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log('[SoundService] Error playing call end sound:', error);
    }
  }

  async stopAll() {
    try {
      if (this.ringtoneSound) {
        await this.ringtoneSound.stopAsync();
        await this.ringtoneSound.unloadAsync();
        this.ringtoneSound = null;
      }
      if (this.dialingSound) {
        await this.dialingSound.stopAsync();
        await this.dialingSound.unloadAsync();
        this.dialingSound = null;
      }
      if (this.ringingSound) {
        await this.ringingSound.stopAsync();
        await this.ringingSound.unloadAsync();
        this.ringingSound = null;
      }
      this.isPlayingRingtone = false;
      this.isPlayingDialing = false;
      this.isPlayingRinging = false;
      console.log('[SoundService] All sounds stopped');
    } catch (error) {
      console.log('[SoundService] Error stopping sounds:', error);
    }
  }
}

export const soundService = new SoundService();
