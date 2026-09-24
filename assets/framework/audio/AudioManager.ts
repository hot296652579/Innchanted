import { _decorator, AudioSource, AudioClip, Node } from 'cc';
import BaseSingleton from '../base/BaseSingleton';
import { ResourceManager } from '../resource/ResourceManager';

export class AudioManager extends BaseSingleton {
    private _audioNode: Node | null = null;
    private _musicSource: AudioSource | null = null;
    private _soundPool: AudioSource[] = [];

    private _musicVolume = 1;
    private _soundVolume = 1;

    public async init(): Promise<void> {
        this._audioNode = new Node("AudioRoot");
        this._musicSource = this._audioNode.addComponent(AudioSource);
        this._musicSource.volume = this._musicVolume;
    }

    public destroy(): void {
        this._audioNode?.destroy();
        this._audioNode = null;
        this._musicSource = null;
        this._soundPool = [];
    }

    // 播放背景音乐
    public async playMusic(path: string, loop = true): Promise<void> {
        const clip = await ResourceManager.getInstance().loadAudioClip(path, "audio");
        if (!clip || !this._musicSource) return;
        this._musicSource.clip = clip;
        this._musicSource.loop = loop;
        this._musicSource.play();
    }

    // 播放音效
    public async playSound(path: string): Promise<void> {
        const clip = await ResourceManager.getInstance().loadAudioClip(path, "audio");
        if (!clip || !this._audioNode) return;

        let source = this._soundPool.find(s => !s.playing);
        if (!source) {
            source = this._audioNode.addComponent(AudioSource);
            source.volume = this._soundVolume;
            this._soundPool.push(source);
        }
        source.playOneShot(clip);
    }

    public setMusicVolume(v: number): void {
        this._musicVolume = v;
        if (this._musicSource) this._musicSource.volume = v;
    }

    public setSoundVolume(v: number): void {
        this._soundVolume = v;
        this._soundPool.forEach(s => s.volume = v);
    }

    public stopMusic(): void {
        this._musicSource?.stop();
    }
}