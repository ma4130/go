// ローカル保存（Firebase 未設定のとき用）。データはこのブラウザの中だけに保存されます。

import { newUserData } from './store-common.js';

const KEY = 'arukemon_local_db';

function load() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (db) return db;
  } catch { /* 壊れていたら作り直す */ }
  return { users: {}, catches: {}, spots: {} };
}

function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 容量オーバーなど */ }
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const clone = (o) => JSON.parse(JSON.stringify(o));

export function createLocalStore() {
  return {
    kind: 'local',

    async getUser(name) {
      const u = load().users[name];
      return u ? clone(u) : null;
    },
    async createUser(name) {
      const db = load();
      const u = newUserData(name);
      db.users[name] = u;
      db.catches[name] = [];
      save(db);
      return clone(u);
    },
    async saveUser(name, patch) {
      const db = load();
      if (!db.users[name]) throw new Error('ユーザーが見つかりません');
      Object.assign(db.users[name], clone(patch));
      save(db);
    },
    async listUsers() {
      return Object.values(load().users).map(clone);
    },
    async deleteUser(name) {
      const db = load();
      delete db.users[name];
      delete db.catches[name];
      save(db);
    },
    async resetUser(name) {
      const db = load();
      const old = db.users[name];
      if (!old) return;
      db.users[name] = { ...newUserData(name), createdAt: old.createdAt };
      db.catches[name] = [];
      save(db);
    },
    async renameUser(oldName, newName) {
      const db = load();
      if (db.users[newName]) throw new Error('その名前はもう使われています');
      const u = db.users[oldName];
      if (!u) throw new Error('ユーザーが見つかりません');
      db.users[newName] = { ...u, name: newName };
      db.catches[newName] = db.catches[oldName] || [];
      delete db.users[oldName];
      delete db.catches[oldName];
      save(db);
    },

    async addCatch(name, c) {
      const db = load();
      const id = rid();
      (db.catches[name] ||= []).push({ id, ...c });
      save(db);
      return id;
    },
    async listCatches(name) {
      return clone(load().catches[name] || []).sort((a, b) => b.caughtAt - a.caughtAt);
    },

    async listSpots() {
      return Object.entries(load().spots).map(([id, s]) => ({ id, ...s }));
    },
    async addSpot(s) {
      const db = load();
      const id = rid();
      db.spots[id] = { ...s, createdAt: Date.now() };
      save(db);
      return id;
    },
    async updateSpot(id, patch) {
      const db = load();
      if (db.spots[id]) Object.assign(db.spots[id], patch);
      save(db);
    },
    async deleteSpot(id) {
      const db = load();
      delete db.spots[id];
      save(db);
    },
  };
}
