import { trpcQuery, getAllRegions, getAllCountries, getUserProductionAndName } from './js/api.js'; // Vérifie bien le chemin ./api.js ou ./js/api.js selon ton dossier
import { 
    runFullSync, 
    getDatabaseOverview, 
    getOldestTransactionDate,
    getTransactionsForPeriod, // Nouvelle fonction
    processAnalysisData      // Nouvelle fonction
} from './main_db.js'; 
import { TOP_OPTIONS_COUNT, RECIPES } from './js/config.js';
// ... reste des imports
import { 
    setLoading, 
    setError, 
    displayUser, 
    displayCompanies,
    updateTradingStatus,
    displayTradingResults,
    updateFactoryStatus,
    displayFactoryResults,
    displayGlobalSummary,    // Nouveau
    displayAnalysisResults, // Nouveau
    displayDailyList        // Nouveau
} from './ui2.js';

// --- ELEMENT REFS ---
const fetchUserBtn = document.getElementById('fetchUserBtn');
const myUserIdInput = document.getElementById('myUserId');
const userOutput = document.getElementById('user-output');
const companiesOutput = document.getElementById('companies-output');
const analyzeTradingBtn = document.getElementById('analyzeTradingBtn');
const analyzeFactoryBtn = document.getElementById('analyzeFactoryBtn');
const tradingOutput = document.getElementById('trading-output');
const factoryOutput = document.getElementById('factory-output');

const syncDbBtn = document.getElementById('syncDbBtn');
const dbCountEl = document.getElementById('db-count');
const dbLastSyncEl = document.getElementById('db-last-sync');
const userinDatabase = document.getElementById('db-name');
const syncProgressEl = document.getElementById('sync-progress');

// --- REFS ANALYSE ---
const btnRunAnalysis = document.getElementById('btn-run-analysis');
const startDateInput = document.getElementById('analysis-start-date');
const endDateInput = document.getElementById('analysis-end-date');
const dateQuickBtns = document.querySelectorAll('.date-quick-btn');
const oldestDateInfoEl = document.getElementById('oldest-date-info');
const analysisResultsArea = document.getElementById('analysis-results-area');
const btnModeGlobal = document.getElementById('btn-mode-global');
const btnModeDaily = document.getElementById('btn-mode-daily');

// --- ETAT DE L'APPLICATION ---
let currentAnalysisData = null; // Stocke les résultats bruts de la période
let currentViewMode = 'global'; // 'global' ou 'daily'

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', async () => {
    refreshDbStatus();
    await initDateInputs();
    setupNavigation();
    await setupFirstUse();
});

// Navigation entre les vues
function setupNavigation() {
    // Les IDs dans `index.html` sont `btn-show-home` / `btn-show-analysis` et `view-home` / `view-analysis`
    const btnHome = document.getElementById('btn-show-home');
    const btnAnalysis = document.getElementById('btn-show-analysis');
    const viewHome = document.getElementById('view-home');
    const viewAnalysis = document.getElementById('view-analysis');

    // Sécurité : si un élément manque, on log et on quitte proprement
    if (!btnHome || !btnAnalysis || !viewHome || !viewAnalysis) {
        console.warn('setupNavigation : éléments de navigation manquants', { btnHome, btnAnalysis, viewHome, viewAnalysis });
        return;
    }

    btnHome.addEventListener('click', () => {
        btnHome.classList.add('active');
        btnAnalysis.classList.remove('active');
        viewHome.classList.remove('hidden');
        viewAnalysis.classList.add('hidden');
    });

    btnAnalysis.addEventListener('click', () => {
        btnAnalysis.classList.add('active');
        btnHome.classList.remove('active');
        viewAnalysis.classList.remove('hidden');
        viewHome.classList.add('hidden');
    });
}

// Rafraîchir les infos de la DB locale
async function refreshDbStatus() {
    userinDatabase.textContent = localStorage.getItem('nameOfTargetUser');
    const overview = await getDatabaseOverview();
    dbCountEl.textContent = overview.totalTransactions;
    // `getDatabaseOverview` fournit une date lisible UTC dans `lastUpdateHuman`
    dbLastSyncEl.textContent = overview.lastUpdateHuman || '-';
}

async function initDateInputs() {
    try {
        const oldestDateStr = await getOldestTransactionDate();
        if (oldestDateStr) {
            const oldest = new Date(oldestDateStr);
            oldestDateInfoEl.textContent = `Données depuis le : ${formatDate(oldest)} (UTC)`;
        }
        await setAnalysisPeriod(1);
    } catch (err) {
        console.error("Erreur dates:", err);
    }
}

// --- PREMIÈRE UTILISATION / SETUP INITIAL ---
async function setupFirstUse() {
    try {
        const overview = await getDatabaseOverview();
        const total = overview?.totalTransactions || 0;
        const savedId = localStorage.getItem('targetUserId');

        // Si l'utilisateur a déjà sauvegardé un ID, pré-remplir le champ
        if (savedId) {
            myUserIdInput.value = savedId;
        }

        // Montrer la modal seulement si DB vide ET aucun ID sauvegardé
        if (total === 0 && !savedId) {
            const modal = document.getElementById('first-use-modal');
            const input = document.getElementById('initialUserId');
            const saveBtn = document.getElementById('saveInitialUserIdBtn');

            modal.classList.remove('hidden');

            const errorEl = document.getElementById('first-use-error');
            const onSave = async () => {
                const id = input.value.trim();
                if (!id) { errorEl.style.display = 'block'; errorEl.textContent = 'Veuillez entrer un ID utilisateur.'; return; }

                // Indicateur de validation
                saveBtn.disabled = true;
                input.disabled = true;
                const origText = saveBtn.textContent;
                saveBtn.textContent = 'Vérification...';
                errorEl.style.display = 'none';

                try {
                    // Vérifier l'existence de l'utilisateur via l'API
                    const user = await trpcQuery('user.getUserLite', { userId: id });
                    if (!user || !user.username) {
                        throw new Error('Utilisateur introuvable');
                    }

                    // OK: sauvegarder et continuer
                    localStorage.setItem('targetUserId', id);
                    localStorage.setItem('nameOfTargetUser', user.username);
                    refreshDbStatus();
                    myUserIdInput.value = id;
                    modal.classList.add('hidden');
                    // Lance l'affichage initial des données pour l'ID saisi
                    fetchUserBtn.click();
                } catch (err) {
                    console.warn('Validation ID échouée', err);
                    errorEl.style.display = 'block';
                    errorEl.textContent = 'ID invalide ou introuvable — veuillez vérifier et réessayer.';
                    input.focus();
                } finally {
                    saveBtn.disabled = false;
                    input.disabled = false;
                    saveBtn.textContent = origText;
                }
            };

            saveBtn.addEventListener('click', onSave, { once: false });
            input.addEventListener('keyup', (e) => { if (e.key === 'Enter') onSave(); });
        }
    } catch (e) {
        console.error('setupFirstUse error', e);
    }
}

async function setAnalysisPeriod(days) {
    // Travail toujours en UTC (jours entiers, à minuit UTC)
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // 00:00:00 UTC d'aujourd'hui
    let start;

    if (String(days).toLowerCase() === 'all') {
        const oldestStr = await getOldestTransactionDate();
        if (oldestStr) {
            const oldest = new Date(oldestStr);
            start = new Date(Date.UTC(oldest.getUTCFullYear(), oldest.getUTCMonth(), oldest.getUTCDate()));
        } else {
            // fallback : 30 jours avant aujourd'hui (UTC)
            start = new Date(end);
            start.setUTCDate(end.getUTCDate() - 30);
        }
    } else {
        const n = parseInt(days, 10) || 0;
        start = new Date(end);
        start.setUTCDate(end.getUTCDate() - n);
    }

    if (startDateInput) startDateInput.value = start.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = end.toISOString().split('T')[0];
}  

dateQuickBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        await setAnalysisPeriod(btn.getAttribute('data-days'));
        dateQuickBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});
// --- LOGIQUE D'ANALYSE ---

// Changement de mode (Global / Jour)
btnModeGlobal.addEventListener('click', () => {
    currentViewMode = 'global';
    btnModeGlobal.classList.add('active');
    btnModeDaily.classList.remove('active');
    renderCurrentAnalysis();
});

btnModeDaily.addEventListener('click', () => {
    currentViewMode = 'daily';
    btnModeDaily.classList.add('active');
    btnModeGlobal.classList.remove('active');
    renderCurrentAnalysis();
});

// Lancement de l'analyse
btnRunAnalysis.addEventListener('click', async () => {
    const start = startDateInput.value;
    const end = endDateInput.value;
    const userId = myUserIdInput.value;

    if (!start || !end || !userId) {
        alert("Veuillez vérifier les dates et votre User ID.");
        return;
    }

    setLoading(analysisResultsArea, true, "Calcul en cours...");

    try {
        const transactions = await getTransactionsForPeriod(start, end);
        
        if (transactions.length === 0) {
            analysisResultsArea.innerHTML = '<div class="status-message info">Aucune donnée trouvée en base pour cette période.</div>';
            return;
        }

        // 1. Calcul Global
        const globalProcessed = processAnalysisData(transactions, userId);
        
        // 2. Calcul par jour pour le mode Daily
        const dailyGroups = {};
        transactions.forEach(t => {
            const day = t.createdAt.split('T')[0];
            if (!dailyGroups[day]) dailyGroups[day] = [];
            dailyGroups[day].push(t);
        });

        const dailyProcessed = {};
        for (const day in dailyGroups) {
            dailyProcessed[day] = processAnalysisData(dailyGroups[day], userId);
        }

        // Sauvegarde dans l'état
        currentAnalysisData = {
            global: globalProcessed,
            daily: dailyProcessed
        };

        setLoading(analysisResultsArea, false);
        renderCurrentAnalysis();

    } catch (err) {
        setError(analysisResultsArea, "Erreur lors de l'analyse : " + err.message);
    }
});

// Affiche les données selon le mode sélectionné
function renderCurrentAnalysis() {
    if (!currentAnalysisData) return;

    // Affiche toujours le bilan financier global en haut
    displayGlobalSummary(currentAnalysisData.global.global);

    if (currentViewMode === 'global') {
        displayAnalysisResults(currentAnalysisData.global);
    } else {
        displayDailyList(currentAnalysisData.daily, (selectedDay) => {
            // Callback quand on clique sur un jour
            const dayData = currentAnalysisData.daily[selectedDay];
            displayAnalysisResults(dayData); 
            // On rajoute un petit bouton retour
            const backBtn = document.createElement('button');
            backBtn.className = "action-btn secondary";
            backBtn.style.marginTop = "10px";
            backBtn.textContent = "⬅ Retour à la liste des jours";
            backBtn.onclick = renderCurrentAnalysis;
            analysisResultsArea.prepend(backBtn);
        });
    }
}

// --- GESTION DU CACHE ---
const regionDataCache = new Map();
const countryDataCache = new Map();
const itemPriceCache = new Map();
let cachedRegionScores = [];
let cacheInitPromise = null;
let cacheInitialized = false;

let cacheworkers = {};

function isCacheInitialized() {
    return cacheInitialized;
}


// --- CONFIGURATION UTILISATEUR CIBLE ---
let TARGET_USER_ID = ""; // Ton ID Spécifique (fallback)

// Préférer l'ID sauvegardé dans localStorage si présent (setup initiale)
const storedTarget = localStorage.getItem('targetUserId');
if (storedTarget) {
    myUserIdInput.value = storedTarget;
} else {
    myUserIdInput.value = TARGET_USER_ID;
}

let currentCompanies = []; 
let userPPPerSession = 12; // par defaut

const MIN_DEPOSIT_QUANTITY = 50; // Quantité minimale pour considérer un dépôt

async function init_cache_regions() {
    if (regionDataCache.size > 0) return; // Déjà initialisé
    const allRegions = await getAllRegions();
    allRegions.forEach(region => {
        const depositData = region.deposit || [];
        const item = depositData.type || null;
        const quantity = (depositData.quantity || 0) >= MIN_DEPOSIT_QUANTITY ? depositData.quantity : 0;
        const data = {
            id: region._id,
            name: region.name,
            countryId: region.country,
            deposit: {
                item: item,
                quantity: quantity
            },
            bonus: (quantity > 0) ? 0.3 : 0
        };
        regionDataCache.set(region._id, data);
    });
}

async function init_cache_country() {
    if (countryDataCache.size > 0) return; // Déjà initialisé
    const allCountries = await getAllCountries();
    allCountries.forEach(country => {
        const data = {
            id: country._id,
            name: country.name,
            bonus: (country.strategicResources?.bonuses?.productionPercent || 0) / 100,
            specializedItem: country.specializedItem || null
        };
        countryDataCache.set(country._id, data);
    });
}

async function calcul_region_score(regionId, itemCode) {
    const regionData = regionDataCache.get(regionId);
    const countryData = countryDataCache.get(regionData.countryId);
    let hasBonus = false;

    let totalBonus = 0;
    if (regionData && regionData.deposit.item === itemCode) {
        totalBonus += regionData.bonus;
        hasBonus = true;
    }
    if (countryData && countryData.specializedItem === itemCode) {
        totalBonus += countryData.bonus;
    }

    return {
        score: totalBonus,
        hasBonus: hasBonus,
    };
}

async function regionScoreCache(itemCode) {
    cachedRegionScores = [];
    for (const regionData of regionDataCache.values()) {
        const regionScore = await calcul_region_score(regionData.id, itemCode);
        cachedRegionScores.push({ regionId: regionData.id, score: regionScore.score, hasBonus: regionScore.hasBonus });
    }
    cachedRegionScores.sort((a, b) => b.score - a.score); // Tri décroissant
}

function init_all_cache() {
    if (cacheInitPromise) return cacheInitPromise;
    cacheInitPromise = (async () => {
        try {
            await init_cache_regions();
            await init_cache_country();
            cacheInitialized = true;
            return true;
        } catch (err) {
            cacheInitPromise = null;
            cacheInitialized = false;
            throw err;
        }
    })();
    return cacheInitPromise;
}

async function ensureCacheReady(timeoutMs = 5000) {
    if (isCacheInitialized()) return true;
    const p = init_all_cache();
    if (!timeoutMs || timeoutMs <= 0) return p;
    return Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Cache initialization timeout')), timeoutMs))
    ]);
}

async function get_item_price(itemCode) {
    const cached = itemPriceCache.get(itemCode);
    if (cached) return cached;

    const res = await trpcQuery('tradingOrder.getTopOrders', { itemCode, limit: 2 });
    const sellOrders = res?.sellOrders;
    let price = 0;
    if (Array.isArray(sellOrders) && sellOrders.length > 0) {
        price = sellOrders[0].price;
    }
    itemPriceCache.set(itemCode, price);
    return price;
}

async function totaleMPCost(itemCode) {
    const recipe = RECIPES[itemCode];
    let totalMPCost = 0;

    for (const compItemCode in recipe.components) {
        const qtyNeeded = recipe.components[compItemCode];
        const compPrice = await get_item_price(compItemCode);
        totalMPCost += compPrice * qtyNeeded;
    }
    return totalMPCost;
}

async function calculateNetValuePerPP(itemCode) {
    const recipe = RECIPES[itemCode];
    const itemPrice = await get_item_price(itemCode);
    if (itemPrice === 0) return 0;
    if (Object.keys(recipe.components).length === 0) {
        return itemPrice / recipe.totalPPs;
    }
    const totalMPCost = await totaleMPCost(itemCode);
    
    const netValueAfterMPCost = itemPrice - totalMPCost;
    if (netValueAfterMPCost <= 0) return 0; 
    return netValueAfterMPCost / recipe.totalPPs;
}


async function calculgrossNetValuePerPP(itemCode) {
    const recipe = RECIPES[itemCode];
    const itemPrice = await get_item_price(itemCode);
    if (itemPrice === 0) return 0;
    
    return itemPrice / recipe.totalPPs;
}

async function getMarketMaxWage() {
    try {
        const workOffers = await trpcQuery('workOffer.getWorkOffersPaginated', { limit: 1 });
        const items = workOffers?.items || [];
        return items.length > 0 ? items[0].wage : 0;
    } catch (error) {
        console.warn("Erreur Market Wage", error);
        return 0;
    }
}

async function companiesData(companyIds) {
    const companies = [];
    const marketMaxWage = await getMarketMaxWage();
    for (const id of companyIds) {
        try {
            const companyData = await trpcQuery('company.getById', { companyId: id });
            const itemPrice = await get_item_price(companyData.itemCode);
            const itemPricePerPP = itemPrice / (RECIPES[companyData.itemCode]?.totalPPs || 1);
            const regionScore = await calcul_region_score(companyData.region, companyData.itemCode);
            const regionData = regionDataCache.get(companyData.region);
            const countryData = regionData ? countryDataCache.get(regionData.countryId) : null;
            const countryBonus = countryData?.bonus || 0;
            const marketPP = userPPPerSession || 12;
            const netValuePerPP = await calculateNetValuePerPP(companyData.itemCode);
            const grossNetValuePerPP = await calculgrossNetValuePerPP(companyData.itemCode);
            const marketProfit = (marketPP * (1 + regionScore.score) * netValuePerPP) - (marketPP * marketMaxWage);
            const totalWorkersNetProfit = 0;
            const minBonusRequired = 0;
            const nb_workers = 0;
            const totalMPCost = await totaleMPCost(companyData.itemCode);
            const data = {
                id: companyData._id,
                name: companyData.name,
                regionId: companyData.region,
                regionName: regionData?.name || 'Unknown region',
                regionData: regionData,
                countryData: countryData,
                countryBonus: countryBonus,
                itemCode: companyData.itemCode,
                bonus: regionScore.score,
                hasBonus: regionScore.hasBonus,
                itemPrice: itemPrice,
                itemPricePerPP: itemPricePerPP,
                netValuePerPP: netValuePerPP,
                grossNetValuePerPP: grossNetValuePerPP,
                marketProfit: marketProfit,
                marketMaxWage: marketMaxWage,
                workers: companyData.workers || null,
                workersInfo: [],
                totalWorkersNetProfit: totalWorkersNetProfit,
                nb_workers: nb_workers,
                ppneeded: RECIPES[companyData.itemCode]?.totalPPs || 0,
                minBonusRequired: minBonusRequired,
                costMP: totalMPCost,
                userPPPerSession: userPPPerSession,
            }
            companies.push(data);
        } catch (error) {
            console.warn(`Erreur chargement compagnie ${id}`, error);
        }
    }
    return companies;
}

// --- GESTION DES ÉVÉNEMENTS UTILISATEUR ---
async function handleFetchUser() {
    const userId = myUserIdInput.value.trim();
    if (!userId) { alert("ID manquant !"); return; }

    // Initialiser le cacheregionNameCache.clear();
    itemPriceCache.clear();
    cachedRegionScores = [];
    setLoading(userOutput, true, "Chargement profil...");
    setLoading(companiesOutput, true, "Chargement compagnies...");
    currentCompanies = [];
    userPPPerSession = 12; // reset par defaut

    try {
        const userData = await trpcQuery('user.getUserLite', { userId: userId });
        if (!userData || !userData.username) {
            throw new Error("Utilisateur introuvable");
        }
        await init_all_cache();
        ensureCacheReady();

        userPPPerSession = userData.skills?.production?.value || 12; 
        const userCountryData = countryDataCache.get(userData.country);
        displayUser(userData, userCountryData); 
        
        const companiesIdResult = await trpcQuery('company.getCompanies', { userId: userId });
        const companyIds = companiesIdResult.items || [];

        if (companyIds.length === 0) {
            setLoading(companiesOutput, false);
            companiesOutput.innerHTML = "Aucune compagnie.";
            updateFactoryStatus("Aucune compagnie pour l'analyse.", 'info');
            return;
        }

        setLoading(companiesOutput, true, "Calcul rentabilité...");
        currentCompanies = await companiesData(companyIds); // Charger les données des compagnies

        for (const company of currentCompanies) {
            const workers = company.workers;
            let costworkers = 0;
            let totalppworkers = 0;
            for (const worker of workers) {
                const workerId = worker.user;
                let workerData = null;
                // Ne pas gaspiller les appels API pour les mêmes travailleurs
                const cachedWorkerData = cacheworkers[workerId] || null;
                if (cachedWorkerData) {
                    workerData = cachedWorkerData;
                } else {
                    workerData = await getUserProductionAndName(workerId);
                    cacheworkers[workerId] = workerData; // Mettre en cache
                }

                const ppStocked = workerData.production * (1 + company.bonus);
                totalppworkers += workerData.production;

                let gain = ppStocked * company.netValuePerPP;
                const cost = workerData.production * worker.wage;
                const netProfit = gain - cost;
                gain = ppStocked * company.grossNetValuePerPP;
                const netProfitGross = gain - cost;
                const costperSession = workerData.production * worker.wage;
                costworkers += costperSession;
                company.totalWorkersNetProfit += netProfit;
                company.nb_workers += 1;

                company.workersInfo.push({
                    id: workerId,
                    name: workerData.name,
                    ppPerSession: workerData.production,
                    wage: worker.wage,
                    company: company.itemCode,
                    companyName: company.name,
                    netProfit: netProfit,
                    netProfitGross: netProfitGross,
                    costperSession: costperSession,
                    breakEvenPrice: worker.wage / (1 + company.bonus),
                    ppStocked: ppStocked,
                });
            }
            company.minBonusRequired = (costworkers / (totalppworkers * company.netValuePerPP)) - 1;
            
        }
        setLoading(companiesOutput, false);
        displayCompanies(currentCompanies);
        updateFactoryStatus(`Prêt pour l'analyse de ${currentCompanies.length} usines.`, 'info');
        

    } catch (error) {
        console.error(error);
        alert("ID invalide ou probleme de connexion.");
        setLoading(companiesOutput, false);
        setError(userOutput, `Veuillez ressayer.`);
    }
}
fetchUserBtn.addEventListener('click', handleFetchUser);

// --- ANALYSE USINE ---
async function handleAnalyzeFactory() {
    if (currentCompanies.length === 0) {
            updateFactoryStatus("Chargez d'abord vos compagnies.", 'info');
            return;
        }

    factoryOutput.innerHTML = ''; 
    updateFactoryStatus(`Analyse de ${cachedRegionScores.length} régions...`, 'loading');

    try {
        const concretePrice = await get_item_price('concrete');
        const transferCost = concretePrice * 5; 
        const factoryAnalysisResults = [];

        for (const comp of currentCompanies) {
            await regionScoreCache(comp.itemCode);
            const currentRegionScore = regionDataCache.get(comp.regionId);

            const alternatives = cachedRegionScores
            .filter(r => r.regionId !== comp.regionId)
            .slice(0, TOP_OPTIONS_COUNT)
            .map(r => ({
                regionId: r.regionId,
                score: r.score,
                hasBonus: r.hasBonus,
                regionName: regionDataCache.get(r.regionId)?.name || 'Unknown region',
                countryName: countryDataCache.get(regionDataCache.get(r.regionId)?.countryId) || 'Unknown country',
                countryBonus: countryDataCache.get(regionDataCache.get(r.regionId)?.countryId)?.bonus || 0,
                countryItem: countryDataCache.get(regionDataCache.get(r.regionId)?.countryId)?.specializedItem || null,
                depotquantity: regionDataCache.get(r.regionId)?.deposit.quantity || 0,
            }));

            factoryAnalysisResults.push({
                company: comp,
                currentRegionScore: currentRegionScore,
                alternatives: alternatives,
                transferCost: transferCost,
            });
        }

        updateFactoryStatus("Analyse terminée.", 'info');
        displayFactoryResults(factoryAnalysisResults, userPPPerSession);
        
    } catch (error) {
        console.error("Erreur analyse usine:", error);
        updateFactoryStatus("Erreur lors de l'analyse (voir console).", 'error');
    }
}
analyzeFactoryBtn.addEventListener('click', handleAnalyzeFactory);

// --- ANALYSE TRADING ---
function formatDuration(ms) {
    if (ms <= 0) return "Moins d'une seconde";
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const min = Math.round(ms / 60000);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}min`;
}

async function handleAnalyzeTrading() {
    const MAX_PAGES = 10;
    const PAGE_LIMIT = 100;
    updateTradingStatus(`Récupération ${MAX_PAGES * PAGE_LIMIT} transactions...`, 'loading');
    tradingOutput.innerHTML = ''; 

    let allTransactions = [];
    let currentCursor = null;
    let pagesFetched = 0;

    try {
        while (pagesFetched < MAX_PAGES) {
            const input = { limit: PAGE_LIMIT, transactionType: "trading", cursor: currentCursor };
            const res = await trpcQuery('transaction.getPaginatedTransactions', input);

            allTransactions.push(...(res.items || []));
            pagesFetched++;
            updateTradingStatus(`Page ${pagesFetched}/${MAX_PAGES}...`, 'loading');

            currentCursor = res.nextCursor;
            if (!currentCursor || res.hasMore === false) break;
        }

        const filteredTx = allTransactions || [];
        if (filteredTx.length === 0) {
            updateTradingStatus('Aucune transaction trouvée.', 'info');
            tradingOutput.innerHTML = '<p>Aucune transaction de trading trouvée.</p>';
            return;
        }

        filteredTx.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const duration = formatDuration(new Date(filteredTx[0].createdAt).getTime() - new Date(filteredTx[filteredTx.length - 1].createdAt).getTime());
        const timeSinceOldest = formatDuration(Date.now() - new Date(filteredTx[filteredTx.length - 1].createdAt).getTime());

        const itemAggregates = {};
        filteredTx.forEach(tx => {
            const code = tx.itemCode || tx.item;
            if (!itemAggregates[code]) {
                itemAggregates[code] = { itemCode: code, volume: 0, totalMoney: 0, transactionCount: 0 };
            }
            // Coercition explicite pour éviter concaténation si API renvoie des chaînes
            itemAggregates[code].volume += Number(tx.quantity) || 0;
            itemAggregates[code].totalMoney += Number(tx.money) || 0;
            itemAggregates[code].transactionCount += 1;
        });

        const uniqueCodes = Object.keys(itemAggregates);
        const topOrdersResults = {};

        // Récupérer les top orders pour chaque item en parallèle (avec throttling simple)
        for (const code of uniqueCodes) {
            try {
                const orders = await trpcQuery('tradingOrder.getTopOrders', { itemCode: code, limit: 2 });
                topOrdersResults[code] = orders || {};
            } catch (err) {
                console.warn('Erreur récupération ordres pour', code, err);
                topOrdersResults[code] = {};
            }
        }

        const analysisResults = Object.values(itemAggregates).map(item => {
            const orderData = topOrdersResults[item.itemCode] || {};
            const buy = orderData?.buyOrders?.[0]?.price || 0;
            const sell = orderData?.sellOrders?.[0]?.price || 0;
            const margin = (buy && sell) ? sell - buy : 0;

            const liquidityScoreRaw = item.volume * item.transactionCount * 10 * (1 + Math.max(0, margin));
            return {
                ...item,
                pricePerUnit: item.volume > 0 ? (item.totalMoney / item.volume) : 0,
                profitMargin: margin,
                liquidityScoreRaw
            };
        }).sort((a, b) => b.liquidityScoreRaw - a.liquidityScoreRaw);

        updateTradingStatus("Analyse terminée.", 'info');
        displayTradingResults(analysisResults, duration, timeSinceOldest);

    } catch (error) {
        console.error("Erreur récupération transactions:", error);
        updateTradingStatus("Erreur lors de la récupération (voir console).", 'error');
    }
}
analyzeTradingBtn.addEventListener('click', handleAnalyzeTrading);

// --- LOGIQUE DE LA BASE DE DONNÉES ---

// Fonction pour mettre à jour l'affichage des compteurs
async function refreshDbStats() {
    try {
        const stats = await getDatabaseOverview();
        if (dbCountEl) dbCountEl.textContent = stats.totalTransactions;
        if (dbLastSyncEl) dbLastSyncEl.textContent = stats.lastUpdateHuman || '-';
    } catch (err) {
        console.error("Erreur stats DB:", err);
    }
}

// Charger les stats dès que le script s'exécute
refreshDbStats();

// Gestion du clic sur le bouton "Synchroniser"
if (syncDbBtn) {
    syncDbBtn.addEventListener('click', async () => {
        const userId = localStorage.getItem('targetUserId');
        if (!userId) {
            alert("Veuillez d'abord configurer un ID utilisateur cible.");
            return;
        }
        syncDbBtn.disabled = true;
        syncProgressEl.style.display = 'block';
        syncProgressEl.textContent = "Vérification des nouvelles transactions...";

        try {
            const result = await runFullSync(userId, (count) => {
                syncProgressEl.textContent = `Synchronisation en cours... ${count} nouvelles transactions trouvées.`;
            });

            syncProgressEl.textContent = `✅ Terminé ! ${result.newCount} ajoutées. Total : ${result.totalInDB}`;
            await refreshDbStats();
        } catch (err) {
            syncProgressEl.innerHTML = `<span style="color:red">❌ Erreur : ${err.message}</span>`;
        } finally {
            syncDbBtn.disabled = false;
            // Cache le message après 8 secondes
            setTimeout(() => { syncProgressEl.style.display = 'none'; }, 8000);
        }
    });
}

// --- LOGIQUE DE NAVIGATION ENTRE LES PAGES ---
const btnHome = document.getElementById('btn-show-home');
const btnAnalysis = document.getElementById('btn-show-analysis');
const viewHome = document.getElementById('view-home');
const viewAnalysis = document.getElementById('view-analysis');

btnHome.addEventListener('click', () => {
    // Affiche Home, cache Analyse
    viewHome.classList.remove('hidden');
    viewAnalysis.classList.add('hidden');
    // Gère le style des boutons
    btnHome.classList.add('active', 'primary');
    btnHome.classList.remove('secondary');
    btnAnalysis.classList.remove('active', 'primary');
    btnAnalysis.classList.add('secondary');
});

btnAnalysis.addEventListener('click', () => {
    // Affiche Analyse, cache Home
    viewHome.classList.add('hidden');
    viewAnalysis.classList.remove('hidden');
    // Gère le style des boutons
    btnAnalysis.classList.add('active', 'primary');
    btnAnalysis.classList.remove('secondary');
    btnHome.classList.remove('active', 'primary');
    btnHome.classList.add('secondary');
});

// --- LOGIQUE DU SÉLECTEUR DE DATES (VIEW 2) ---
let globalOldestDate = null; // Stockera la date de la toute 1ere transaction

// Formatage YYYY-MM-DD pour les inputs date
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Initialisation des dates au chargement ou après une sync
 */
async function initAnalysisDates() {
    try {
        const oldestStr = await getOldestTransactionDate();
        if (oldestStr) {
            globalOldestDate = new Date(oldestStr);
            oldestDateInfoEl.textContent = `Données disponibles depuis le : ${formatDate(globalOldestDate)} (UTC)`;
        } else {
            oldestDateInfoEl.textContent = "Aucune donnée en base. Synchronisez d'abord.";
        }
        
        // PAR DÉFAUT : Analyse sur 1 jour
        await setAnalysisPeriod(1);
        
    } catch (err) {
        console.error("Erreur init dates:", err);
    }
}

// Listeners sur les boutons de période (1D, 7D, etc.)
dateQuickBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const days = btn.getAttribute('data-days');
        await setAnalysisPeriod(days);

        // Feedback visuel des boutons
        dateQuickBtns.forEach(b => b.classList.replace('primary', 'secondary'));
        btn.classList.replace('secondary', 'primary');
    });
});

// Lancement manuel de l'analyse
btnRunAnalysis.addEventListener('click', () => {
    const start = startDateInput.value;
    const end = endDateInput.value;

    if (!start || !end) {
        alert("Veuillez sélectionner une période valide.");
        return;
    }

    analysisResultsArea.innerHTML = `
        <div class="status-message loading">
            Analyse des transactions du <strong>${start}</strong> au <strong>${end}</strong>...
        </div>
    `;
    
    console.log(`Lancement analyse : ${start} -> ${end}`);
    // Ici on appellera la future fonction de calcul de profits
});


// Lancer l'initialisation au démarrage
initAnalysisDates();