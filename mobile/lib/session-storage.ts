type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Keychain can survive reinstall on iOS. This non-secret marker belongs to this installation.
const marker = "ichido-secure-store";

export function migrateSessionStorage(secure: Storage, previous: Storage): Storage {
  return {
    async getItem(key) {
      const saved = await secure.getItem(key);
      const old = await previous.getItem(key);
      if (old === marker) return saved;
      if (old === null) {
        if (saved !== null) await secure.removeItem(key);
        return null;
      }
      if (saved === null) await secure.setItem(key, old);
      await previous.setItem(key, marker);
      return saved ?? old;
    },
    async setItem(key, value) {
      await secure.setItem(key, value);
      await previous.setItem(key, marker);
    },
    async removeItem(key) {
      await previous.removeItem(key);
      await secure.removeItem(key);
    },
  };
}
