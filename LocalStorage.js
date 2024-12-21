class LocalStorage {
    constructor(prefix = 'dbdiagram_') {
        this.prefix = prefix;
    }

    setItem(key, value) {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
    }

    getItem(key) {
        const value = localStorage.getItem(this.prefix + key);
        try {
            return value ? JSON.parse(value) : null;
        } catch (e) {
            console.error('Error parsing stored value:', e);
            return null;
        }
    }

    removeItem(key) {
        localStorage.removeItem(this.prefix + key);
    }

    clear() {
        Object.keys(localStorage)
            .filter(key => key.startsWith(this.prefix))
            .forEach(key => localStorage.removeItem(key));
    }
}
