// db.js - Gestion de la base de données locale IndexedDB

const DB_NAME = "WarEra_DB";
const DB_VERSION = 1;

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Table des transactions (clé unique = id de la transaction)
            if (!db.objectStoreNames.contains("transactions")) {
                const store = db.createObjectStore("transactions", { keyPath: "_id" });
                // Index pour pouvoir trier ou filtrer par date rapidement
                store.createIndex("createdAt", "createdAt", { unique: false });
                store.createIndex("transactionType", "transactionType", { unique: false });
            }
            // Table pour les réglages (ex: date de dernière synchro)
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "key" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("Erreur d'ouverture IndexedDB");
    });
}

// Ajouter plusieurs transactions d'un coup
export async function saveTransactions(transactions) {
    const db = await openDB();
    const tx = db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    
    // Normaliser les champs numériques pour éviter des concaténations de chaînes
    transactions.forEach(orig => {
        const t = Object.assign({}, orig);
        if (t.money !== undefined) t.money = Number(t.money) || 0;
        if (t.quantity !== undefined) t.quantity = Number(t.quantity) || 0;
        store.put(t); // put ajoute ou met à jour si l'ID existe
    });
    
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
}

// Récupérer la transaction la plus récente en base pour savoir où arrêter la synchro
export async function getLastTransactionDate() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("transactions", "readonly");
        const store = tx.objectStore("transactions");
        const index = store.index("createdAt");
        // On prend le dernier élément de l'index (le plus récent)
        const request = index.openCursor(null, "prev");
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            resolve(cursor ? cursor.value.createdAt : null);
        };
    });
}

// Récupérer le nombre total de transactions en base
export async function getStatsDB() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("transactions", "readonly");
        const store = tx.objectStore("transactions");
        const countRequest = store.count();
        countRequest.onsuccess = () => resolve(countRequest.result);
    });
}
