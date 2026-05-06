import { Collection, Db, Document, GridFSBucket, MongoClient } from "mongodb";
import { env } from "./env.js";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectPromise: Promise<Db> | null = null;

export const connectToDatabase = async () => {
  if (db) return db;

  if (!env.MONGO_URL || !env.DB_NAME) {
    throw new Error("Missing required Mongo configuration (MONGO_URL, DB_NAME).");
  }

  if (!connectPromise) {
    client = new MongoClient(env.MONGO_URL);
    connectPromise = client
      .connect()
      .then(async (connected: MongoClient) => {
        db = connected.db(env.DB_NAME);
        await db.collection("users").createIndex({ emailLower: 1 }, { unique: true });
        await db.collection("users").createIndex({ "billing.stripe_customer_id": 1 });
        await db.collection("listings").createIndex({ status: 1, isPublished: 1 });
        await db.collection("listings").createIndex({ source: 1, updatedAt: -1 });
        await db
          .collection("listings")
          .createIndex(
            { source: 1, sourceExternalId: 1 },
            {
              unique: true,
              name: "source_1_sourceExternalId_1",
              partialFilterExpression: { sourceExternalId: { $exists: true } },
            }
          );
        await db.collection("password_reset_tokens").createIndex({ token: 1 }, { unique: true });
        await db
          .collection("password_reset_tokens")
          .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
        await db.collection("offers").createIndex({ listingId: 1 });
        await db.collection("offers").createIndex({ buyerId: 1 });
        await db.collection("offers").createIndex({ sellerId: 1 });
        await db.collection("offers").createIndex({ status: 1 });
        return db;
      })
      .catch((error: unknown) => {
        connectPromise = null;
        throw error;
      });
  }

  return connectPromise;
};


export const closeDatabaseConnection = async () => {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
  connectPromise = null;
};

export const getDb = () => {
  if (!db) {
    throw new Error("Database not initialized. Call connectToDatabase() on startup.");
  }
  return db;
};

export const getCollection = <T extends Document = Document>(name: string): Collection<T> =>
  getDb().collection<T>(name);

let uploadsBucket: GridFSBucket | null = null;

export const getUploadsBucket = () => {
  if (!uploadsBucket) {
    uploadsBucket = new GridFSBucket(getDb(), { bucketName: "uploads" });
  }

  return uploadsBucket;
};
