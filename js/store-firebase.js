// Firestore を使う保存（firebase-config.js に設定を貼ると使われます）。
// データの形:
//   users/{名前}                 プレイヤー
//   users/{名前}/catches/{id}    捕まえた記録
//   spots/{id}                   スポット

import { newUserData } from './store-common.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export async function createFirebaseStore(config) {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const F = await import(`${SDK}/firebase-firestore.js`);
  const app = initializeApp(config);
  const db = F.getFirestore(app);

  const userRef = (n) => F.doc(db, 'users', n);
  const catchesCol = (n) => F.collection(db, 'users', n, 'catches');
  const spotsCol = () => F.collection(db, 'spots');

  // 書き込みを400件ずつに分けて実行（Firestore の一括書き込みは500件まで）
  async function runBatched(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = F.writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  }

  async function deleteCatches(name) {
    const snap = await F.getDocs(catchesCol(name));
    await runBatched(snap.docs.map((d) => (b) => b.delete(d.ref)));
  }

  return {
    kind: 'firebase',

    async getUser(name) {
      const s = await F.getDoc(userRef(name));
      return s.exists() ? s.data() : null;
    },
    async createUser(name) {
      const u = newUserData(name);
      await F.setDoc(userRef(name), u);
      return u;
    },
    async saveUser(name, patch) {
      // updateDoc は渡した項目をまるごと置き換える（dex などの中身も置き換わる）
      await F.updateDoc(userRef(name), patch);
    },
    async listUsers() {
      const s = await F.getDocs(F.collection(db, 'users'));
      return s.docs.map((d) => d.data());
    },
    async deleteUser(name) {
      await deleteCatches(name);
      await F.deleteDoc(userRef(name));
    },
    async resetUser(name) {
      const old = await this.getUser(name);
      if (!old) return;
      await deleteCatches(name);
      await F.setDoc(userRef(name), { ...newUserData(name), createdAt: old.createdAt });
    },
    async renameUser(oldName, newName) {
      if (await this.getUser(newName)) throw new Error('その名前はもう使われています');
      const u = await this.getUser(oldName);
      if (!u) throw new Error('ユーザーが見つかりません');
      const snap = await F.getDocs(catchesCol(oldName));
      const ops = [(b) => b.set(userRef(newName), { ...u, name: newName })];
      snap.docs.forEach((d) => {
        ops.push((b) => b.set(F.doc(db, 'users', newName, 'catches', d.id), d.data()));
        ops.push((b) => b.delete(d.ref));
      });
      ops.push((b) => b.delete(userRef(oldName)));
      await runBatched(ops);
    },

    async addCatch(name, c) {
      const r = await F.addDoc(catchesCol(name), c);
      return r.id;
    },
    async listCatches(name) {
      const s = await F.getDocs(F.query(catchesCol(name), F.orderBy('caughtAt', 'desc')));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async listSpots() {
      const s = await F.getDocs(spotsCol());
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async addSpot(s) {
      const r = await F.addDoc(spotsCol(), { ...s, createdAt: Date.now() });
      return r.id;
    },
    async updateSpot(id, patch) {
      await F.updateDoc(F.doc(db, 'spots', id), patch);
    },
    async deleteSpot(id) {
      await F.deleteDoc(F.doc(db, 'spots', id));
    },
  };
}
