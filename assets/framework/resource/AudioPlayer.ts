import { AudioClip, AudioSource } from "cc";
import BaseSingleton from "../base/BaseSingleton";
import { ResourceManager } from "./ResourceManager";
import { storage } from "./Storage";

const KEY_MUSIC_ON = "setting.musicOn";
const KEY_SOUND_ON = "setting.soundOn";

/**
 * 音频播放（单例）。AudioSource 不挂场景节点，切场景也不会被一起销毁。
 */
export default class AudioPlayer extends BaseSingleton {

    private _musicSource: AudioSource | null = null;
    private _effectSource: AudioSource | null = null;
    private _effectLoading = new Map<string, Promise<AudioClip | null>>();

    private _masterVolume = 1;
    public get masterVolume(): number { return this._masterVolume; }

    private _musicVolume = 1;
    public get musicVolume(): number { return this._musicVolume; }

    private _effectVolume = 1;
    public get effectVolume(): number { return this._effectVolume; }

    private _vibrationVolume = 1;
    public get vibrationVolume(): number { return this._vibrationVolume; }

    private _musicOn = true;
    public get musicOn(): boolean { return this._musicOn; }

    private _effectOn = true;
    public get effectOn(): boolean { return this._effectOn; }

    private _tempEffectVolume: number;

    public async init(): Promise<void> {
        this._musicOn = storage.getItem(KEY_MUSIC_ON, true) !== false;
        this._effectOn = storage.getItem(KEY_SOUND_ON, true) !== false;
    }

    public destroy(): void {
        this.stopMusic();
        this._musicSource = null;
        this._effectSource = null;
        this._effectLoading.clear();
    }

    /**
     * 设置主音量
     * @param value 音量值（0.0 ~ 1.0）
     */
    public setMasterVolume(value: number): void {
        if (value < 0.0) value = 0.0;
        else if (value > 1.0) value = 1.0;
        this._masterVolume = value;
        this.applyMusicVolume();
    }

    /**
     * 设置音乐音量
     * @param value 音量值（0.0 ~ 1.0）
     */
    public setMusicVolume(value: number): void {
        if (value < 0.0) value = 0.0;
        else if (value > 1.0) value = 1.0;
        this._musicVolume = value;
        this.applyMusicVolume();
    }

    /**
     * 设置特效音量
     * @param value 音量值（0.0 ~ 1.0）
     */
    public setEffectVolume(value: number): void {
        if (value < 0.0) value = 0.0;
        else if (value > 1.0) value = 1.0;
        this._effectVolume = value;
    }

    public setMusicOn(on: boolean): void {
        this._musicOn = on;
        storage.setItem(KEY_MUSIC_ON, on);
        this.applyMusicVolume();
        if (!this._musicSource) {
            return;
        }
        if (on) {
            this._musicSource.play();
        } else {
            this._musicSource.pause();
        }
    }

    public setEffectOn(on: boolean): void {
        this._effectOn = on;
        storage.setItem(KEY_SOUND_ON, on);
    }

    /**
     * 震动
     * @param value 震动值（0.0 ~ 1.0）
     */
    public setVibrationVolume(value: number): void {
        if (value < 0.0) value = 0.0;
        else if (value > 1.0) value = 1.0;
        this._vibrationVolume = value;
    }

    /**
     * 播放音乐
     * @param path 音频路径
     * @param bundleName bundle 名称
     */
    public async playMusic(bundleName: string, path: string): Promise<void> {
        try {
            const clip = await ResourceManager.getInstance().load<AudioClip>(path, AudioClip, bundleName);
            if (!clip) {
                console.warn("播放音乐失败: clip 为空", bundleName, path);
                return;
            }
            const source = this.ensureMusicSource();
            source.stop();
            source.clip = clip;
            source.loop = true;
            this.applyMusicVolume();
            if (this._musicOn) {
                source.play();
            }
        } catch (err) {
            console.warn("播放音乐失败:", err);
        }
    }

    /**
     * 播放音效
     * @param path 音频路径
     * @param bundleName bundle 名称
     */
    public async playEffect(bundleName: string, path: string): Promise<void> {
        console.log("播放音效:", bundleName, path);
        if (!this._effectOn) {
            return;
        }
        try {
            const clip = await this.loadEffectClip(bundleName, path);
            if (!clip) {
                console.warn("播放音效失败: clip 为空", bundleName, path);
                return;
            }
            this.ensureEffectSource().playOneShot(clip, this._masterVolume * this._effectVolume);
        } catch (err) {
            console.warn("播放音效失败:", err);
        }
    }

    /** 停止音乐 */
    public stopMusic(): void {
        this._musicSource?.stop();
    }

    /** 暂停音乐 */
    public pauseMusic(): void {
        this._musicSource?.pause();
    }

    /** 恢复音乐 */
    public recoverMusic(): void {
        if (!this._musicOn) {
            return;
        }
        this._musicSource?.play();
    }

    /** 静音 */
    public mute(): void {
        this._tempEffectVolume = this._effectVolume;
        this.setMasterVolume(0);
    }

    /** 取消静音 */
    public cancelMute(): void {
        this._effectVolume = this._tempEffectVolume ?? this._effectVolume;
        this.setMasterVolume(1);
    }

    private ensureMusicSource(): AudioSource {
        if (!this._musicSource) {
            this._musicSource = new AudioSource();
        }
        return this._musicSource;
    }

    private ensureEffectSource(): AudioSource {
        if (!this._effectSource) {
            this._effectSource = new AudioSource();
        }
        return this._effectSource;
    }

    private loadEffectClip(bundleName: string, path: string): Promise<AudioClip | null> {
        const key = `${bundleName}/${path}`;
        let loading = this._effectLoading.get(key);
        if (!loading) {
            loading = ResourceManager.getInstance().load<AudioClip>(path, AudioClip, bundleName);
            this._effectLoading.set(key, loading);
        }
        return loading;
    }

    private applyMusicVolume(): void {
        if (this._musicSource) {
            this._musicSource.volume = this._musicOn ? this._masterVolume * this._musicVolume : 0;
        }
    }
}
