import { openDB } from 'idb';

const DB_NAME = 'flowtask-sync';
const STORE_NAME = 'mutations';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { autoIncrement: true, keyPath: 'id' });
    },
  });
}

export async function addMutation(mutation) {
  const db = await getDB();
  await db.add(STORE_NAME, mutation);
}

export async function getMutations() {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function deleteMutation(id) {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function processMutations() {
  const mutations = await getMutations();
  for (const mutation of mutations) {
    try {
      await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.body,
      });
      await deleteMutation(mutation.id);
    } catch (error) {
      console.error('Failed to process mutation:', error);
    }
  }
}
