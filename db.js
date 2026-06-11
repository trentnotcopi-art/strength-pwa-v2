const DB_NAME = "StrengthProgram2026";
const DB_VERSION = 2;
const useLocalStore = location.protocol === "file:" || !window.indexedDB;
const IDB_TIMEOUT_MS = 1200;

function readLocalStore(name) {
  return JSON.parse(localStorage.getItem(`${DB_NAME}:${name}`) || "[]");
}

function writeLocalStore(name, value) {
  localStorage.setItem(`${DB_NAME}:${name}`, JSON.stringify(value));
}

function nextLocalId(name) {
  const key = `${DB_NAME}:${name}:id`;
  const id = Number(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, String(id));
  return id;
}

function setLocalIdCounter(name, value) {
  localStorage.setItem(`${DB_NAME}:${name}:id`, String(value));
}

function openNativeDb() {
  return withTimeout(new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("sessions")) {
        const store = database.createObjectStore("sessions", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("date", "date");
        store.createIndex("dayType", "dayType");
        store.createIndex("completed", "completed");
      }
      if (!database.objectStoreNames.contains("setLogs")) {
        const store = database.createObjectStore("setLogs", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("sessionId", "sessionId");
        store.createIndex("exerciseId", "exerciseId");
        store.createIndex("timestamp", "timestamp");
      }
      if (!database.objectStoreNames.contains("workingBases")) {
        const store = database.createObjectStore("workingBases", {
          keyPath: "exerciseId",
        });
        store.createIndex("status", "status");
        store.createIndex("lastUpdated", "lastUpdated");
      }
      if (!database.objectStoreNames.contains("bodyMeasurements")) {
        const store = database.createObjectStore("bodyMeasurements", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("date", "date");
      }
      if (!database.objectStoreNames.contains("plannerState")) {
        database.createObjectStore("plannerState", {
          keyPath: "key",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }), IDB_TIMEOUT_MS, new Error("IndexedDB не ответил, включён резервный режим"));
}

function withTimeout(promise, ms, timeoutError) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(timeoutError), ms);
    }),
  ]);
}

async function tryNativeStore(storeName, mode, callback, fallback) {
  try {
    return await nativeStore(storeName, mode, callback);
  } catch (error) {
    console.warn(error);
    return fallback();
  }
}

async function nativeStore(storeName, mode, callback) {
  const database = await openNativeDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => database.close();
    tx.onerror = () => reject(tx.error);
  });
}

// Заменяет всё содержимое стора одной транзакцией (для импорта бэкапа).
async function nativeReplaceAll(storeName, items) {
  const database = await openNativeDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    items.forEach((item) => store.put(item));
    tx.oncomplete = () => {
      database.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function createSession(dayType, wellbeing) {
  const session = {
    date: new Date().toISOString(),
    dayType,
    wellbeing,
    completed: false,
    notes: "",
  };
  if (useLocalStore) {
    const sessions = readLocalStore("sessions");
    const localSession = { ...session, id: nextLocalId("sessions") };
    sessions.push(localSession);
    writeLocalStore("sessions", sessions);
    return localSession;
  }
  const id = await tryNativeStore(
    "sessions",
    "readwrite",
    (store) => store.add(session),
    () => {
      const sessions = readLocalStore("sessions");
      const localSession = { ...session, id: nextLocalId("sessions") };
      sessions.push(localSession);
      writeLocalStore("sessions", sessions);
      return localSession.id;
    },
  );
  return { ...session, id };
}

async function completeSession(sessionId) {
  if (useLocalStore) {
    const sessions = readLocalStore("sessions").map((session) =>
      session.id === Number(sessionId) ? { ...session, completed: true } : session,
    );
    writeLocalStore("sessions", sessions);
    return;
  }
  const session = await tryNativeStore(
    "sessions",
    "readonly",
    (store) => store.get(Number(sessionId)),
    () => readLocalStore("sessions").find((item) => item.id === Number(sessionId)),
  );
  if (session) {
    await tryNativeStore(
      "sessions",
      "readwrite",
      (store) => store.put({ ...session, completed: true }),
      () => {
        const sessions = readLocalStore("sessions").map((item) =>
          item.id === Number(sessionId) ? { ...item, completed: true } : item,
        );
        writeLocalStore("sessions", sessions);
      },
    );
  }
}

async function addSetLog(setLog) {
  const payload = {
    ...setLog,
    sessionId: Number(setLog.sessionId),
    timestamp: new Date().toISOString(),
  };
  if (useLocalStore) {
    const sets = readLocalStore("setLogs");
    const localPayload = { ...payload, id: nextLocalId("setLogs") };
    sets.push(localPayload);
    writeLocalStore("setLogs", sets);
    return localPayload;
  }
  const id = await tryNativeStore(
    "setLogs",
    "readwrite",
    (store) => store.add(payload),
    () => {
      const sets = readLocalStore("setLogs");
      const localPayload = { ...payload, id: nextLocalId("setLogs") };
      sets.push(localPayload);
      writeLocalStore("setLogs", sets);
      return localPayload.id;
    },
  );
  return { ...payload, id };
}

async function getSessionSets(sessionId) {
  if (useLocalStore) {
    return readLocalStore("setLogs").filter((set) => set.sessionId === Number(sessionId));
  }
  const sets = await tryNativeStore("setLogs", "readonly", (store) => store.getAll(), () =>
    readLocalStore("setLogs"),
  );
  return sets.filter((set) => set.sessionId === Number(sessionId));
}

async function getAllSessions() {
  if (useLocalStore) {
    return readLocalStore("sessions").sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  const sessions = await tryNativeStore("sessions", "readonly", (store) => store.getAll(), () =>
    readLocalStore("sessions"),
  );
  return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getAllSets() {
  if (useLocalStore) {
    return readLocalStore("setLogs").sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  const sets = await tryNativeStore("setLogs", "readonly", (store) => store.getAll(), () =>
    readLocalStore("setLogs"),
  );
  return sets.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

async function getWorkingBases() {
  if (useLocalStore) return readLocalStore("workingBases");
  return tryNativeStore("workingBases", "readonly", (store) => store.getAll(), () =>
    readLocalStore("workingBases"),
  );
}

async function getWorkingBase(exerciseId) {
  if (useLocalStore) {
    return readLocalStore("workingBases").find((base) => base.exerciseId === exerciseId);
  }
  return tryNativeStore(
    "workingBases",
    "readonly",
    (store) => store.get(exerciseId),
    () => readLocalStore("workingBases").find((base) => base.exerciseId === exerciseId),
  );
}

async function upsertWorkingBase(base) {
  if (useLocalStore) {
    const bases = readLocalStore("workingBases");
    const index = bases.findIndex((item) => item.exerciseId === base.exerciseId);
    if (index >= 0) bases[index] = base;
    else bases.push(base);
    writeLocalStore("workingBases", bases);
    return;
  }
  await tryNativeStore(
    "workingBases",
    "readwrite",
    (store) => store.put(base),
    () => {
      const bases = readLocalStore("workingBases");
      const index = bases.findIndex((item) => item.exerciseId === base.exerciseId);
      if (index >= 0) bases[index] = base;
      else bases.push(base);
      writeLocalStore("workingBases", bases);
    },
  );
}

async function getSession(sessionId) {
  if (useLocalStore) {
    return readLocalStore("sessions").find((session) => session.id === Number(sessionId));
  }
  return tryNativeStore(
    "sessions",
    "readonly",
    (store) => store.get(Number(sessionId)),
    () => readLocalStore("sessions").find((session) => session.id === Number(sessionId)),
  );
}

async function deleteSession(sessionId) {
  const id = Number(sessionId);
  if (useLocalStore) {
    writeLocalStore("sessions", readLocalStore("sessions").filter((session) => session.id !== id));
    writeLocalStore("setLogs", readLocalStore("setLogs").filter((set) => set.sessionId !== id));
    return;
  }
  await tryNativeStore(
    "sessions",
    "readwrite",
    (store) => store.delete(id),
    () => {
      writeLocalStore("sessions", readLocalStore("sessions").filter((session) => session.id !== id));
    },
  );
  const sets = await tryNativeStore("setLogs", "readonly", (store) => store.getAll(), () =>
    readLocalStore("setLogs"),
  );
  await Promise.all(
    sets
      .filter((set) => set.sessionId === id)
      .map((set) =>
        tryNativeStore(
          "setLogs",
          "readwrite",
          (store) => store.delete(set.id),
          () => {
            writeLocalStore("setLogs", readLocalStore("setLogs").filter((item) => item.id !== set.id));
          },
        ),
      ),
  );
}

async function replaceWorkingBases(bases) {
  if (useLocalStore) {
    writeLocalStore("workingBases", bases);
    return;
  }
  try {
    await nativeReplaceAll("workingBases", bases);
  } catch (error) {
    console.warn(error);
    writeLocalStore("workingBases", bases);
  }
}

async function addBodyMeasurement(measurement) {
  const payload = {
    ...measurement,
    date: measurement.date || new Date().toISOString(),
  };
  if (useLocalStore) {
    const items = readLocalStore("bodyMeasurements");
    const item = { ...payload, id: nextLocalId("bodyMeasurements") };
    items.push(item);
    writeLocalStore("bodyMeasurements", items);
    return item;
  }
  const id = await tryNativeStore(
    "bodyMeasurements",
    "readwrite",
    (store) => store.add(payload),
    () => {
      const items = readLocalStore("bodyMeasurements");
      const item = { ...payload, id: nextLocalId("bodyMeasurements") };
      items.push(item);
      writeLocalStore("bodyMeasurements", items);
      return item.id;
    },
  );
  return { ...payload, id };
}

async function getBodyMeasurements() {
  if (useLocalStore) {
    return readLocalStore("bodyMeasurements").sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  const items = await tryNativeStore("bodyMeasurements", "readonly", (store) => store.getAll(), () =>
    readLocalStore("bodyMeasurements"),
  );
  return items.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function deleteBodyMeasurement(measurementId) {
  const id = Number(measurementId);
  if (useLocalStore) {
    writeLocalStore("bodyMeasurements", readLocalStore("bodyMeasurements").filter((item) => item.id !== id));
    return;
  }
  await tryNativeStore(
    "bodyMeasurements",
    "readwrite",
    (store) => store.delete(id),
    () => writeLocalStore("bodyMeasurements", readLocalStore("bodyMeasurements").filter((item) => item.id !== id)),
  );
}

// Раньше нативная ветка возвращала запись {key, value} целиком, из-за чего
// планировщик в IndexedDB-режиме не сохранял прогресс. Нормализуем к value
// и отбрасываем повреждённые записи старого формата (index у них NaN).
function normalizePlannerValue(raw) {
  let value = raw && typeof raw === "object" && "key" in raw && "value" in raw ? raw.value : raw;
  if (!value || typeof value !== "object") return null;
  if (!value.startedAt || !Number.isFinite(Number(value.index))) return null;
  return value;
}

async function getPlannerState() {
  if (useLocalStore) return normalizePlannerValue(getSetting("plannerState"));
  const record = await tryNativeStore("plannerState", "readonly", (store) => store.get("main"), () =>
    getSetting("plannerState"),
  );
  return normalizePlannerValue(record);
}

async function setPlannerState(value) {
  if (useLocalStore) {
    setSetting("plannerState", value);
    return value;
  }
  await tryNativeStore(
    "plannerState",
    "readwrite",
    (store) => store.put({ key: "main", value }),
    () => setSetting("plannerState", value),
  );
  return value;
}

// ─── Бэкап: экспорт и импорт всех данных ────────────────────────────────────
const BACKUP_APP = "strength-pwa-v2";
const BACKUP_SCHEMA_VERSION = 2;

async function exportAllData() {
  const [sessions, setLogs, workingBases, bodyMeasurements, plannerState] = await Promise.all([
    getAllSessions(),
    getAllSets(),
    getWorkingBases(),
    getBodyMeasurements(),
    getPlannerState(),
  ]);
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      sessions,
      setLogs,
      workingBases,
      bodyMeasurements,
      plannerState,
      settings: {
        legsUnlocked: getSetting("legsUnlocked"),
        profile: getSetting("profile"),
      },
    },
  };
}

// Возвращает { ok, error?, counts? } — не бросает, чтобы UI показал ошибку на русском.
function validateBackup(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Файл не похож на резервную копию (не JSON-объект)." };
  }
  if (payload.app !== BACKUP_APP) {
    return { ok: false, error: "Файл создан не этим приложением." };
  }
  if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: `Несовместимая версия копии: ${payload.schemaVersion}.` };
  }
  const data = payload.data;
  const arrays = ["sessions", "setLogs", "workingBases", "bodyMeasurements"];
  if (!data || typeof data !== "object" || arrays.some((key) => !Array.isArray(data[key]))) {
    return { ok: false, error: "В копии не хватает данных (sessions/setLogs/workingBases/bodyMeasurements)." };
  }
  const badSession = data.sessions.find((s) => !Number.isFinite(Number(s?.id)) || !s?.date);
  if (badSession) return { ok: false, error: "Повреждённая запись тренировки в копии." };
  const badSet = data.setLogs.find(
    (s) => !Number.isFinite(Number(s?.id)) || !Number.isFinite(Number(s?.sessionId)) || !s?.exerciseId,
  );
  if (badSet) return { ok: false, error: "Повреждённая запись подхода в копии." };
  return {
    ok: true,
    counts: {
      sessions: data.sessions.length,
      setLogs: data.setLogs.length,
      workingBases: data.workingBases.length,
      bodyMeasurements: data.bodyMeasurements.length,
    },
  };
}

// Полная замена данных (не merge: слияние с autoIncrement-id перекрёстно
// сшивает подходы с чужими тренировками). Вызывать только после validateBackup.
async function importAllData(payload) {
  const check = validateBackup(payload);
  if (!check.ok) throw new Error(check.error);
  const data = payload.data;

  if (useLocalStore) {
    writeLocalStore("sessions", data.sessions);
    writeLocalStore("setLogs", data.setLogs);
    writeLocalStore("workingBases", data.workingBases);
    writeLocalStore("bodyMeasurements", data.bodyMeasurements);
    setLocalIdCounter("sessions", Math.max(0, ...data.sessions.map((s) => Number(s.id))));
    setLocalIdCounter("setLogs", Math.max(0, ...data.setLogs.map((s) => Number(s.id))));
    setLocalIdCounter("bodyMeasurements", Math.max(0, ...data.bodyMeasurements.map((s) => Number(s.id))));
  } else {
    await nativeReplaceAll("sessions", data.sessions);
    await nativeReplaceAll("setLogs", data.setLogs);
    await nativeReplaceAll("workingBases", data.workingBases);
    await nativeReplaceAll("bodyMeasurements", data.bodyMeasurements);
  }

  const planner = normalizePlannerValue(data.plannerState);
  if (planner) await setPlannerState(planner);

  const settings = data.settings || {};
  if (settings.legsUnlocked !== undefined && settings.legsUnlocked !== null) {
    setSetting("legsUnlocked", Boolean(settings.legsUnlocked));
  }
  if (settings.profile && typeof settings.profile === "object") {
    setSetting("profile", settings.profile);
  }

  return check.counts;
}

window.strengthDb = {
  createSession,
  completeSession,
  addSetLog,
  getSessionSets,
  getAllSessions,
  getAllSets,
  getWorkingBases,
  getWorkingBase,
  upsertWorkingBase,
  getSession,
  deleteSession,
  replaceWorkingBases,
  addBodyMeasurement,
  getBodyMeasurements,
  deleteBodyMeasurement,
  getPlannerState,
  setPlannerState,
  exportAllData,
  validateBackup,
  importAllData,
};

// ─── Настройки (legs unlock и др.) ──────────────────────────────────────────
function getSetting(key) {
  try {
    const raw = localStorage.getItem(`${DB_NAME}:setting:${key}`);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSetting(key, value) {
  localStorage.setItem(`${DB_NAME}:setting:${key}`, JSON.stringify(value));
}

window.strengthDb.getSetting = getSetting;
window.strengthDb.setSetting = setSetting;
