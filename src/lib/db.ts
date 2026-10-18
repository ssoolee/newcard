import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { CardFields, SavedCard } from "./types";

/**
 * On-device card storage.
 *
 * This is the whole persistence story for business-card data. There is no
 * server-side copy and no sync, because the cards describe other people who
 * never agreed to have their details sit in someone else's database. The
 * trade-off is real and intended: switching phones loses the list, and the UI
 * says so plainly instead of hiding it.
 */

const DB_NAME = "newcard";
const DB_VERSION = 1;
const STORE = "cards";

interface NewcardDB extends DBSchema {
  cards: {
    key: string;
    value: SavedCard;
    indexes: { "by-createdAt": number };
  };
}

let dbPromise: Promise<IDBPDatabase<NewcardDB>> | null = null;

function getDb(): Promise<IDBPDatabase<NewcardDB>> {
  dbPromise ??= openDB<NewcardDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const store = database.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("by-createdAt", "createdAt");
    },
  });
  return dbPromise;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveCard(fields: CardFields, note = ""): Promise<SavedCard> {
  const card: SavedCard = { ...fields, id: newId(), createdAt: Date.now(), note };
  const db = await getDb();
  await db.put(STORE, card);
  return card;
}

export async function updateCard(card: SavedCard): Promise<void> {
  const db = await getDb();
  await db.put(STORE, card);
}

/** Newest first — the card you just scanned is the one you want. */
export async function listCards(): Promise<SavedCard[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, "by-createdAt");
  return all.reverse();
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

/** Wipes everything. The user must always have a way to erase other people's data. */
export async function clearAllCards(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}

/** Simple local substring match across the fields people actually search by. */
export function searchCards(cards: SavedCard[], query: string): SavedCard[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return cards;
  return cards.filter((card) =>
    [card.name, card.nameEn, card.company, card.department, card.title, card.email, card.note]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
