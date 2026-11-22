import type { LevelContext } from '../Level';

/** Local procedural ambience: crackling fire and stylized monkey distress calls. */
export class ForestRescueSound {
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private timer = 0;
  private readonly calls = new Set<OscillatorNode>();
  constructor(private readonly ctx: LevelContext) {
    const hidden = (): void => { if(document.hidden&&this.master)this.master.gain.value=0; };
    document.addEventListener('visibilitychange',hidden);
    ctx.onDispose(() => {document.removeEventListener('visibilitychange',hidden);this.dispose();});
  }
  update(dt: number, panicking: boolean): void {
    const audio = this.ctx.synth.audioContext;
    if (!audio) return;
    if (!this.master) {
      this.master = audio.createGain();this.master.connect(audio.destination);
      const buffer = audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate);
      const data = buffer.getChannelData(0);let low = 0;
      for(let i=0;i<data.length;i++) {const noise=Math.random()*2-1;low=low*.96+noise*.04;data[i]=low*2+(Math.random()>.999?noise*.8:0);}
      const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;
      const gain=audio.createGain();gain.gain.value=.28;source.connect(gain);gain.connect(this.master);source.start();this.source=source;
    }
    const settings=this.ctx.save.data.settings;
    this.master.gain.setTargetAtTime(this.ctx.audio.silent||document.hidden?0:settings.sfxVol*(this.ctx.dialog.blocking?.2:.65),audio.currentTime,.1);
    this.timer-=dt;
    if(!panicking||this.timer>0||this.ctx.audio.silent||document.hidden||this.ctx.dialog.blocking)return;
    this.timer=3.5+Math.random()*2.5;
    for(let i=0;i<3;i++) {
      const oscillator=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.19;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(600+i*90,t);oscillator.frequency.exponentialRampToValueAtTime(1050+i*70,t+.07);oscillator.frequency.exponentialRampToValueAtTime(420,t+.17);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.09,t+.025);gain.gain.exponentialRampToValueAtTime(.001,t+.18);
      oscillator.connect(gain);gain.connect(this.master);oscillator.start(t);oscillator.stop(t+.2);this.calls.add(oscillator);
      oscillator.onended=()=>{this.calls.delete(oscillator);oscillator.disconnect();gain.disconnect();};
    }
  }
  private dispose(): void {
    this.source?.stop();this.source?.disconnect();for(const call of this.calls)call.stop();this.calls.clear();this.master?.disconnect();
  }
}
