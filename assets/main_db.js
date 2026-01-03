// main_db.js - Le moteur de synchronisation et d'accès aux données
import { trpcQuery } from './js/api.js';
import { saveTransactions, getLastTransactionDate, getStatsDB, openDB } from './js/db.js';

// Configuration des types à synchroniser
const TRACKED_TYPES = ["wage", "itemMarket", "trading", "donation", "applicationFee"];

/**
 * RÉCUPÈRE LES TRANSACTIONS DEPUIS LA DB POUR UNE PÉRIODE DONNÉE
 */
export async function getTransactionsForPeriod(startDate, endDate) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("transactions", "readonly");
        const store = tx.objectStore("transactions");
        const index = store.index("createdAt");

        // --- CORRECTION ICI ---
        // Utiliser explicitement UTC pour les bornes (00:00:00Z - 23:59:59.999Z)
        const start = new Date(startDate + 'T00:00:00Z');
        const end = new Date(endDate + 'T23:59:59.999Z');

        const range = IDBKeyRange.bound(start.toISOString(), end.toISOString());
        // ----------------------

        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("Erreur lors de la récupération des transactions");
    });
}

/**
 * LOGIQUE DE TRAITEMENT DES DONNÉES D'ANALYSE
 * Transforme les transactions brutes en statistiques exploitables
 */
export function processAnalysisData(transactions, myUserId) {
    const analysis = {
        global: {
            totalBuy: 0,
            totalSell: 0,
            netProfit: 0,
            count: transactions.length
        },
        byItem: {}, // Pour le trading (Lead, Limestone, etc.)
        byType: {}  // Pour les autres (Wage, Donation, etc.)
    };

    transactions.forEach(t => {
        const isBuyer = t.buyerId === myUserId;
        const isSeller = t.sellerId === myUserId;
        const money = t.money || 0;
        const qty = t.quantity || 0;

        // Mise à jour du bilan global
        if (isBuyer) analysis.global.totalBuy += money;
        if (isSeller) analysis.global.totalSell += money;

        // Déterminer la clé de groupement
        // Si trading -> par itemCode, sinon -> par transactionType
        const isTrading = t.transactionType === 'trading';
        const key = isTrading ? t.itemCode : t.transactionType;
        const targetMap = isTrading ? analysis.byItem : analysis.byType;

        if (!targetMap[key]) {
            targetMap[key] = {
                name: key,
                count: 0,
                buyQty: 0,
                buyTotal: 0,
                sellQty: 0,
                sellTotal: 0
            };
        }

        const entry = targetMap[key];
        entry.count++;

        if (isBuyer) {
            entry.buyQty += qty;
            entry.buyTotal += money;
        } else if (isSeller) {
            entry.sellQty += qty;
            entry.sellTotal += money;
        }
    });

    analysis.global.netProfit = analysis.global.totalSell - analysis.global.totalBuy;
    return analysis;
}

/**
 * Lance la synchronisation des transactions pour l'utilisateur
 */
export async function runFullSync(userId, onProgressUpdate) {
    let cursor = null;
    let totalSyncedThisSession = 0;
    let isSyncComplete = false;

    // Récupérer la date de la dernière transaction en base pour l'arrêt intelligent
    const lastDateInDB = await getLastTransactionDate();
    const lastTimestamp = lastDateInDB ? new Date(lastDateInDB).getTime() : 0;

    console.log(`[Sync] Démarrage. Point d'arrêt local : ${lastDateInDB || "Base vide"}`);

    try {
        while (!isSyncComplete) {
            // Appel API
            const response = await trpcQuery('transaction.getPaginatedTransactions', {
                userId: userId,
                transactionType: TRACKED_TYPES,
                limit: 100,
                cursor: cursor
            });

            const items = response?.items || [];
            const nextCursor = response?.nextCursor;

            if (items.length === 0) {
                isSyncComplete = true;
                break;
            }

            const batchToSave = [];

            for (const tx of items) {
                const txTime = new Date(tx.createdAt).getTime();

                // Arrêt si on atteint des données déjà connues
                if (txTime <= lastTimestamp) {
                    isSyncComplete = true;
                    break; 
                }
                batchToSave.push(tx);
            }

            if (batchToSave.length > 0) {
                await saveTransactions(batchToSave);
                totalSyncedThisSession += batchToSave.length;
                
                // Notifie l'interface pour la barre de progression
                if (onProgressUpdate) onProgressUpdate(totalSyncedThisSession);
            }

            // Gestion de la pagination
            if (nextCursor && !isSyncComplete) {
                cursor = nextCursor;
            } else {
                isSyncComplete = true;
            }
        }

        const finalTotal = await getStatsDB();
        console.log(`[Sync] Terminée. ${totalSyncedThisSession} nouvelles transactions ajoutées.`);
        return { newCount: totalSyncedThisSession, totalInDB: finalTotal };

    } catch (error) {
        console.error("[Sync] Erreur critique lors de la synchronisation:", error);
        throw error;
    }
}

/**
 * Récupère les informations de base de la DB pour l'affichage initial
 */
export async function getDatabaseOverview() {
    const total = await getStatsDB();
    const lastDate = await getLastTransactionDate();
    return {
        totalTransactions: total,
        lastUpdate: lastDate ? new Date(lastDate).toISOString().replace('T',' ').split('.')[0] + ' UTC' : "Jamais"
    }; 
}

/**
 * Récupère la date de la transaction la plus ancienne en base
 */
export async function getOldestTransactionDate() {
    const db = await openDB(); // Importé depuis db.js
    return new Promise((resolve) => {
        const tx = db.transaction("transactions", "readonly");
        const store = tx.objectStore("transactions");
        const index = store.index("createdAt");
        // On prend le premier élément (le plus ancien)
        const request = index.openCursor(null, "next"); 
        request.onsuccess = (e) => {
            const cursor = e.target.result;
            resolve(cursor ? cursor.value.createdAt : null);
        };
    });
}