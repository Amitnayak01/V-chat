let ringtone;

export const initRingtone = () => {
  ringtone = new Audio("/ringtone.mp3");
  ringtone.loop = true;
};

export const playRingtone = () => {
  if (ringtone) {
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
  }
};

export const stopRingtone = () => {
  if (ringtone) {
    ringtone.pause();
    ringtone.currentTime = 0;
  }
};
