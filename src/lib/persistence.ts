import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "satchel";
const STORE_NAME = "shaders";
const DB_VERSION = 1;

interface ShaderRecord {
  id?: number;
  shaderCode: string;
  processCode: string;
  preview: Blob;
  name: string;
  createdAt: number;
}

export interface ShaderListItem {
  id: number;
  name: string;
  preview: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

export async function saveShader(
  shaderCode: string,
  processCode: string,
  preview: Blob,
  name: string,
): Promise<number> {
  const db = await getDB();
  const id = await db.add(STORE_NAME, {
    shaderCode,
    processCode,
    preview,
    name,
    createdAt: Date.now(),
  } as ShaderRecord);
  return id as number;
}

export async function listShaders(): Promise<ShaderListItem[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const index = tx.store.index("createdAt");
  const items = await index.getAll();
  await tx.done;

  // Reverse to get newest first
  return items.reverse().map((item) => ({
    id: item.id!,
    name: item.name,
    preview: item.preview,
    createdAt: item.createdAt,
  }));
}

export async function loadShader(id: number): Promise<ShaderRecord> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, id);
  if (!record) throw new Error(`Shader ${id} not found`);
  return record;
}

export async function deleteShader(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}
