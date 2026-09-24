export class StorageUtil {
    /** 存数据 */
    public static set<T>(key: string, value: T): void {
        const str = JSON.stringify(value);
        localStorage.setItem(key, str);
    }

    /** 取数据 */
    public static get<T>(key: string, defaultValue: T): T {
        const str = localStorage.getItem(key);
        if (!str) return defaultValue;
        try {
            return JSON.parse(str) as T;
        } catch {
            return defaultValue;
        }
    }

    public static remove(key: string): void {
        localStorage.removeItem(key);
    }

    public static clear(): void {
        localStorage.clear();
    }
}