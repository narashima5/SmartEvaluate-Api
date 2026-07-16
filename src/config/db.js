const admin = require("firebase-admin");
const { Filter, FieldPath } = require("firebase-admin/firestore");
const bcrypt = require("bcrypt");

let firestoreDb;
const registry = {};

// Helper to capitalize first letter (for registry lookups)
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// Initialize Firebase Admin
const connectDB = async () => {
  if (!admin.apps.length) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountPath) {
      try {
        const serviceAccount = require(require("path").resolve(serviceAccountPath));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log("Firebase Admin initialized with Service Account JSON.");
      } catch (err) {
        console.error("Failed to load Firebase service account JSON. Initializing with defaults. Error:", err.message);
        admin.initializeApp();
      }
    } else {
      admin.initializeApp();
      console.log("Firebase Admin initialized with default credentials.");
    }
  }
  firestoreDb = admin.firestore();
  return {
    connection: {
      host: "Firebase Firestore Database",
    },
  };
};

// Parser to convert MongoDB query objects to Firestore Filters
function parseQueryToFilter(query) {
  if (!query || typeof query !== "object" || Object.keys(query).length === 0) {
    return null;
  }

  const filters = [];

  for (const [key, value] of Object.entries(query)) {
    if (key === "$or") {
      const subFilters = value.map((sub) => parseQueryToFilter(sub)).filter(Boolean);
      if (subFilters.length > 0) {
        filters.push(Filter.or(...subFilters));
      }
    } else if (key === "$and") {
      const subFilters = value.map((sub) => parseQueryToFilter(sub)).filter(Boolean);
      if (subFilters.length > 0) {
        filters.push(Filter.and(...subFilters));
      }
    } else {
      const isIdField = key === "_id" || key === "id";
      const fieldPath = isIdField ? FieldPath.documentId() : key;

      if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        // Mongoose query operators
        for (const [op, opVal] of Object.entries(value)) {
          // If referencing a Document object, extract its string _id
          const cleanVal = opVal && typeof opVal === "object" && opVal._id ? String(opVal._id) : opVal;

          if (op === "$ne") {
            filters.push(Filter.where(fieldPath, "!=", cleanVal));
          } else if (op === "$in") {
            const mappedVal = Array.isArray(cleanVal) ? cleanVal.map((v) => (v && v._id ? String(v._id) : String(v))) : [String(cleanVal)];
            filters.push(Filter.where(fieldPath, "in", mappedVal));
          } else if (op === "$nin") {
            const mappedVal = Array.isArray(cleanVal) ? cleanVal.map((v) => (v && v._id ? String(v._id) : String(v))) : [String(cleanVal)];
            filters.push(Filter.where(fieldPath, "not-in", mappedVal));
          } else if (op === "$gt") {
            filters.push(Filter.where(fieldPath, ">", cleanVal));
          } else if (op === "$gte") {
            filters.push(Filter.where(fieldPath, ">=", cleanVal));
          } else if (op === "$lt") {
            filters.push(Filter.where(fieldPath, "<", cleanVal));
          } else if (op === "$lte") {
            filters.push(Filter.where(fieldPath, "<=", cleanVal));
          }
        }
      } else {
        // Simple equality check
        const cleanVal = value && typeof value === "object" && value._id ? String(value._id) : value;
        const mappedVal = isIdField ? String(cleanVal) : cleanVal;
        filters.push(Filter.where(fieldPath, "==", mappedVal));
      }
    }
  }

  if (filters.length === 0) return null;
  if (filters.length === 1) return filters[0];
  return Filter.and(...filters);
}

// Helper to resolve populated references
async function populateDoc(doc, paths) {
  if (!doc || !doc.model || !doc.model.schema) return;
  const references = doc.model.schema.references;

  for (const path of paths) {
    const targetModelName = references[path];
    if (!targetModelName) continue;

    const targetModel = registry[targetModelName];
    if (!targetModel) continue;

    const val = doc[path];
    if (val) {
      if (Array.isArray(val)) {
        const populatedList = [];
        for (const item of val) {
          if (typeof item === "string") {
            const populated = await targetModel.findById(item);
            if (populated) populatedList.push(populated);
          } else {
            populatedList.push(item);
          }
        }
        doc[path] = populatedList;
      } else if (typeof val === "string") {
        const populated = await targetModel.findById(val);
        if (populated) {
          doc[path] = populated;
        }
      }
    }
  }
}

// Firestore Document wrapper to mimic Mongoose document instances
class FirestoreDocument {
  constructor(model, id, data) {
    this.model = model;
    this._id = id;
    this.id = id;

    if (data) {
      for (const [key, val] of Object.entries(data)) {
        // Convert Firestore Timestamps to JS Dates
        if (val && typeof val === "object" && typeof val.toDate === "function") {
          this[key] = val.toDate();
        } else {
          this[key] = val;
        }
      }
    }
  }

  async populate(paths) {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    await populateDoc(this, pathsArray);
    return this;
  }

  async save() {
    await this.model.runPreHooks("validate", this);
    await this.model.runPreHooks("save", this);

    const dataToSave = { ...this };
    delete dataToSave.model;
    delete dataToSave._id;
    delete dataToSave.id;
    delete dataToSave.createdAt;
    delete dataToSave.updatedAt;

    // Unpopulate any populated objects and remove methods before storing in database
    for (const [key, val] of Object.entries(dataToSave)) {
      if (typeof val === "function") {
        delete dataToSave[key];
      } else if (val && typeof val === "object" && val._id) {
        dataToSave[key] = String(val._id);
      } else if (Array.isArray(val)) {
        dataToSave[key] = val.map((item) => (item && typeof item === "object" && item._id ? String(item._id) : item));
      }
    }

    const docRef = firestoreDb.collection(this.model.collectionName).doc(this._id);
    await docRef.set(
      {
        ...dataToSave,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    this.updatedAt = new Date();
    return this;
  }

  toObject() {
    const obj = { ...this };
    delete obj.model;
    return obj;
  }

  toJSON() {
    return this.toObject();
  }

  toString() {
    return String(this._id);
  }
}

// Chainable query object to mimic Mongoose Query builder
class FirestoreQuery {
  constructor(model, query, single = false) {
    this.model = model;
    this.query = query;
    this.single = single;
    this.populatePaths = [];
    this.sortFields = null;
    this.limitVal = undefined;
    this.selectFields = null;
  }

  populate(paths) {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    this.populatePaths.push(...pathsArray);
    return this;
  }

  sort(fields) {
    this.sortFields = fields;
    return this;
  }

  limit(n) {
    this.limitVal = n;
    return this;
  }

  select(fields) {
    this.selectFields = fields;
    return this;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  async exec() {
    const collectionRef = firestoreDb.collection(this.model.collectionName);
    let ref = collectionRef;

    const filter = parseQueryToFilter(this.query);
    if (filter) {
      ref = ref.where(filter);
    }

    // Apply sorting
    if (this.sortFields) {
      if (typeof this.sortFields === "object") {
        for (const [field, order] of Object.entries(this.sortFields)) {
          const direction = order === -1 ? "desc" : "asc";
          ref = ref.orderBy(field, direction);
        }
      } else if (typeof this.sortFields === "string") {
        // String sort like "name" or "-createdAt"
        const fields = this.sortFields.split(" ");
        for (const f of fields) {
          const isDesc = f.startsWith("-");
          const field = isDesc ? f.slice(1) : f;
          ref = ref.orderBy(field, isDesc ? "desc" : "asc");
        }
      }
    }

    // Apply limit
    if (this.limitVal !== undefined) {
      ref = ref.limit(this.limitVal);
    }

    const snapshot = await ref.get();

    if (this.single) {
      if (snapshot.empty) return null;
      const docSnapshot = snapshot.docs[0];
      const doc = this.model.instantiateDoc(docSnapshot.id, docSnapshot.data());
      if (this.populatePaths.length > 0) {
        await doc.populate(this.populatePaths);
      }
      return doc;
    } else {
      const docs = [];
      for (const docSnapshot of snapshot.docs) {
        docs.push(this.model.instantiateDoc(docSnapshot.id, docSnapshot.data()));
      }
      if (this.populatePaths.length > 0) {
        for (const doc of docs) {
          await doc.populate(this.populatePaths);
        }
      }
      return docs;
    }
  }
}

// Mongoose-like Model class representing a Firestore collection
class FirestoreModel {
  constructor(name, schema) {
    this.modelName = name;
    // Map to plural lowercase collection names
    this.collectionName = name.toLowerCase() + "s";
    this.schema = schema;

    // Register model
    registry[name] = this;
  }

  instantiateDoc(id, data) {
    const doc = new FirestoreDocument(this, id, data);
    if (this.schema && this.schema.methods) {
      for (const [methodName, methodFn] of Object.entries(this.schema.methods)) {
        doc[methodName] = methodFn.bind(doc);
      }
    }
    return doc;
  }

  async runPreHooks(hookName, doc) {
    if (this.schema && this.schema.hooks && this.schema.hooks.pre && this.schema.hooks.pre[hookName]) {
      for (const hookFn of this.schema.hooks.pre[hookName]) {
        await hookFn.call(doc);
      }
    }
  }

  find(query = {}) {
    return new FirestoreQuery(this, query, false);
  }

  findOne(query = {}) {
    return new FirestoreQuery(this, query, true);
  }

  findById(id) {
    return new FirestoreQuery(this, { _id: id }, true);
  }

  async create(data) {
    const isArray = Array.isArray(data);
    const items = isArray ? data : [data];
    const docs = [];

    for (const item of items) {
      // Generate ID or use provided one
      const id = item._id || item.id || firestoreDb.collection(this.collectionName).doc().id;
      const cleanItem = { ...item };
      delete cleanItem._id;
      delete cleanItem.id;

      const doc = this.instantiateDoc(String(id), {
        ...cleanItem,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await doc.save();
      docs.push(doc);
    }

    return isArray ? docs : docs[0];
  }

  async deleteMany(query = {}) {
    const collectionRef = firestoreDb.collection(this.collectionName);
    let ref = collectionRef;
    const filter = parseQueryToFilter(query);
    if (filter) {
      ref = ref.where(filter);
    }

    const snapshot = await ref.get();
    const batch = firestoreDb.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    return { deletedCount: snapshot.size };
  }

  async updateMany(query, update) {
    const collectionRef = firestoreDb.collection(this.collectionName);
    let ref = collectionRef;
    const filter = parseQueryToFilter(query);
    if (filter) {
      ref = ref.where(filter);
    }

    const snapshot = await ref.get();
    const updateData = update.$set || update;

    const batch = firestoreDb.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, updateData);
    });
    await batch.commit();
    return { matchedCount: snapshot.size, modifiedCount: snapshot.size };
  }

  async countDocuments(query = {}) {
    const collectionRef = firestoreDb.collection(this.collectionName);
    let ref = collectionRef;
    const filter = parseQueryToFilter(query);
    if (filter) {
      ref = ref.where(filter);
    }

    const snapshot = await ref.count().get();
    return snapshot.data().count;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    const docRef = firestoreDb.collection(this.collectionName).doc(String(id));
    const docSnapshot = await docRef.get();
    if (!docSnapshot.exists) return null;

    const updateData = update.$set || update;
    await docRef.update(updateData);

    const updatedSnapshot = await docRef.get();
    return this.instantiateDoc(id, updatedSnapshot.data());
  }

  async findOneAndUpdate(query, update, options = {}) {
    const doc = await this.findOne(query);
    if (!doc) {
      if (options.upsert) {
        const updateData = update.$set || update;
        const newData = { ...query, ...updateData };
        return this.create(newData);
      }
      return null;
    }
    const updateData = update.$set || update;
    return this.findByIdAndUpdate(doc._id, updateData, options);
  }

  async findByIdAndDelete(id) {
    const docRef = firestoreDb.collection(this.collectionName).doc(String(id));
    const docSnapshot = await docRef.get();
    if (!docSnapshot.exists) return null;

    const doc = this.instantiateDoc(id, docSnapshot.data());
    await docRef.delete();
    return doc;
  }
}

// Mongoose interface emulator
const mongooseEmulator = connectDB;

mongooseEmulator.connect = connectDB;

mongooseEmulator.Schema = class Schema {
  constructor(definition, options) {
    this.definition = definition;
    this.hooks = { pre: { validate: [], save: [] } };
    this.methods = {};

    // Scan definition for references
    this.references = {};
    if (definition) {
      for (const [key, val] of Object.entries(definition)) {
        if (val && typeof val === "object") {
          if (val.ref) {
            this.references[key] = val.ref;
          } else if (Array.isArray(val) && val[0] && val[0].ref) {
            this.references[key] = val[0].ref;
          }
        }
      }
    }
  }

  pre(hookName, fn) {
    if (this.hooks.pre[hookName]) {
      this.hooks.pre[hookName].push(fn);
    }
  }

  index(fields, options) {
    // Indexing is handled automatically or not needed in Firestore emulator
  }
};

mongooseEmulator.Schema.Types = {
  ObjectId: String,
  Mixed: Object,
};

mongooseEmulator.model = function (name, schema) {
  if (schema) {
    return new FirestoreModel(name, schema);
  }
  return registry[name];
};

mongooseEmulator.Types = {
  ObjectId: (val) => (val ? String(val) : null),
};

module.exports = mongooseEmulator;
