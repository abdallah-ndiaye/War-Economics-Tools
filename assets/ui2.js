// --- REFERENCES DOM ---
const userOutput = document.getElementById('user-output');
const companiesOutput = document.getElementById('companies-output');
const tradingOutput = document.getElementById('trading-output');
const factoryOutput = document.getElementById('factory-output');
const analysisResultsArea = document.getElementById('analysis-results-area');
const globalSummaryArea = document.getElementById('analysis-global-summary');

// --- HELPERS ---
export function setLoading(element, isLoading = false, message = 'Chargement...') {
    if (isLoading) {
        element.innerHTML = `<div class="status-message loading">${message}</div>`;
        element.classList.add('loading');
        element.classList.remove('error'); 
    } else {
        element.innerHTML = ''; 
        element.classList.remove('loading', 'error'); 
    }
}

export function setError(element, message) {
    element.innerHTML = `<div class="error">⚠️ ${message}</div>`;
    element.classList.add('error');
    element.classList.remove('loading');
}

// Helper: format a date/string to YYYY-MM-DD (UTC)
export function formatDateUTC(dateInput) {
    const d = (typeof dateInput === 'string') ? new Date(dateInput) : dateInput;
    const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return utcDate.toISOString().split('T')[0] + ' (UTC)';
} 

const formatCurrency = (value, fractionDigits = 3) => {
    if (typeof value !== 'number') return '?';
    return value.toLocaleString('fr-FR', { 
        style: 'currency', 
        currency: 'USD', 
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits 
    });
};

const formatNumber = (value) => {
    if (typeof value !== 'number') return '?';
    return Math.round(value).toLocaleString('fr-FR');
};

// --- UTILS: calculs réutilisables (centraliser la logique de profit)
export function computeCompanyProfit(comp) {
    const totalNetProfit = comp.totalWorkersNetProfit || 0;
    const nb_workers = comp.nb_workers || 0;
    const averageProfitPerWorker = nb_workers > 0 ? totalNetProfit / nb_workers : 0;
    const profit_user_pp = (comp.userPPPerSession || 0) * (1 + (comp.bonus || 0)) * (comp.netValuePerPP || 0);
    const totalprofit = averageProfitPerWorker + profit_user_pp;
    return { averageProfitPerWorker, profit_user_pp, totalprofit };
}

export function computeBestCompany(companies) {
    if (!Array.isArray(companies) || companies.length === 0) return null;
    let bestProfit = -Infinity;
    let bestCompany = null;
    for (const c of companies) {
        const { totalprofit } = computeCompanyProfit(c);
        if (totalprofit > bestProfit) {
            bestProfit = totalprofit;
            bestCompany = c;
        }
    }
    return { company: bestCompany, profit: bestProfit };
}

/**
 * Affiche le bilan financier global en haut de la vue
 */
export function displayGlobalSummary(globalData) {
    const isPositive = globalData.netProfit >= 0;
    const fluxClass = isPositive ? 'flux-positive' : 'flux-negative';

    globalSummaryArea.innerHTML = `
        <div class="summary-card-container">
            <div class="summary-card">
                <h4>Bilan Net (Profit/Perte)</h4>
                <div class="value ${fluxClass}">${formatCurrency(globalData.netProfit)}</div>
            </div>
            <div class="summary-card">
                <h4>Total Ventes (Recettes)</h4>
                <div class="value cell-sell" style="background: none !important; color: #007BFF;">${formatCurrency(globalData.totalSell)}</div>
            </div>
            <div class="summary-card">
                <h4>Total Achats (Dépenses)</h4>
                <div class="value cell-buy" style="background: none !important; color: #8B4513;">${formatCurrency(globalData.totalBuy)}</div>
            </div>
            <div class="summary-card">
                <h4>Transactions</h4>
                <div class="value">${globalData.count}</div>
            </div>
        </div>
    `;
}

/**
 * Génère le tableau HTML pour les données traitées (Globales ou d'un jour précis)
 */
export function displayAnalysisResults(processedData) {
    let html = '<table class="result-table">';
    html += `
        <thead>
            <tr>
                <th>Type / Ressource</th>
                <th>Nb Trans.</th>
                <th class="cell-buy">Qté Achat</th>
                <th class="cell-buy">Moy. Achat</th>
                <th class="cell-sell">Qté Vente</th>
                <th class="cell-sell">Moy. Vente</th>
                <th>Flux Argent</th>
            </tr>
        </thead>
        <tbody>
    `;

    // Fusionner byItem et byType pour l'affichage
    const allEntries = [
        ...Object.values(processedData.byItem),
        ...Object.values(processedData.byType)
    ];

    if (allEntries.length === 0) {
        analysisResultsArea.innerHTML = '<div class="status-message info">Aucune donnée trouvée pour cette période.</div>';
        return;
    }

    allEntries.forEach(item => {
        const avgBuy = item.buyQty > 0 ? item.buyTotal / item.buyQty : 0;
        const avgSell = item.sellQty > 0 ? item.sellTotal / item.sellQty : 0;
        const itemNet = item.sellTotal - item.buyTotal;
        const fluxClass = itemNet >= 0 ? 'flux-positive' : 'flux-negative';

        html += `
            <tr>
                <td><strong>${item.name.toUpperCase()}</strong></td>
                <td>${item.count}</td>
                <td class="cell-buy">${formatNumber(item.buyQty)}</td>
                <td class="cell-buy">${formatCurrency(avgBuy)}</td>
                <td class="cell-sell">${formatNumber(item.sellQty)}</td>
                <td class="cell-sell">${formatCurrency(avgSell)}</td>
                <td class="${fluxClass}">${formatCurrency(itemNet)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    analysisResultsArea.innerHTML = html;
}

/**
 * Affiche la liste des jours pour le mode "Par Jour"
 */
export function displayDailyList(dailyData, onDayClick) {
    let html = '<h3>Détail par Jour</h3><div class="daily-list">';
    
    // Trier les jours du plus récent au plus ancien
    const sortedDays = Object.keys(dailyData).sort((a, b) => b.localeCompare(a));

    sortedDays.forEach(day => {
        const data = dailyData[day];
        const fluxClass = data.global.netProfit >= 0 ? 'flux-positive' : 'flux-negative';
        
        html += `
            <div class="summary-card" style="cursor:pointer; margin-bottom:10px; border-left: 5px solid #00bcd4;" onclick="window.dispatchDayClick('${day}')">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>📅 ${formatDateUTC(day)}</strong>
                    <span class="${fluxClass}">${formatCurrency(data.global.netProfit)}</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    analysisResultsArea.innerHTML = html;
    
    // Attacher l'événement au window pour qu'il soit accessible
    window.dispatchDayClick = onDayClick;
}

// --- AFFICHAGE USER ---
export function displayUser(userData, countryData) {
    if (!userData || !userData.username) {
        userOutput.innerHTML = '<div class="error">Impossible de lire les données utilisateur.</div>';
        return;
    }

    const name = userData.username;
    const level = userData.leveling ? userData.leveling.level : '?';
    const ppPerSession = userData.skills?.production?.value || 12;
    const countryName = countryData?.name || 'Inconnu';
    const countryFlag = countryData?.flagEmoji || '🌍'; 

    userOutput.innerHTML = `
        <div style="background: #333; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h3>👤 Profil Joueur</h3>
            <p><strong>Nom :</strong> ${name}</p>
            <p><strong>Niveau :</strong> ${level}</p>
            <p><strong>Pays :</strong> ${countryFlag} ${countryName}</p>
            <p><strong>Votre Production Brute par Session :</strong> <strong>${ppPerSession} PP</strong></p>
        </div>
    `;
}

// --- AFFICHAGE WORKERS ---
function displayWorkerDetails(workers, minBonusRequired, company) {
    if (!Array.isArray(workers) || workers.length === 0) {
        return '<p style="margin-top: 10px;">Aucun employé actif.</p>';
    }
    
    const breakEvenValues = workers.map(w => {
        const bePrice = typeof w.breakEvenPrice === 'number' ? w.breakEvenPrice : 0;
        return (bePrice * company.ppneeded) + company.costMP;
    });
    const maxBreakEvenPerItem = breakEvenValues.length ? Math.max(...breakEvenValues) : 0;
    const maxBreakEvenDisplay = formatCurrency(maxBreakEvenPerItem, 3);

    const minBonusDisplay = (minBonusRequired * 100).toFixed(2) + '%';
    const bonusText = ` (Bonus Min: ${minBonusDisplay})`;

    // Affichage agrégé: rentabilité moyenne par employé (déjà calculée au niveau de la compagnie)
    const totalWorkersNetProfit = company.totalWorkersNetProfit || 0;
    const nbWorkers = workers.length || company.nb_workers || 0;
    const avgProfitPerWorker = nbWorkers > 0 ? totalWorkersNetProfit / nbWorkers : 0;
    const avgProfitDisplay = formatCurrency(avgProfitPerWorker, 3);
    const avgProfitClass = avgProfitPerWorker >= 0 ? 'profit-positive' : 'profit-negative';

    let html = `<div class="worker-details">`;
    html += `<h4>👥 Employés Actifs (${workers.length}) — Seuil max: ${maxBreakEvenDisplay} <span style="font-size:0.9em; color:#ffcc00;">${bonusText}</span> <span class="employee-profit ${avgProfitClass}" style="margin-left:10px; font-size:0.95em;">— Rentabilité moyenne des employés: ${avgProfitDisplay}/session</span></h4>`;
    html += `<table class="result-table small-table">`;
    html += `<thead><tr>
                <th>Nom Employé</th>
                <th>PP/Session</th>
                <th>PPs Stockés</th>
                <th>Salaire/PP</th>
                <th>Coût Total/Session</th>
                <th>Seuil Rentabilité/PP</th>
                <th>Seuil Rentabilité/Vente</th>
                <th>Bénéfice Net/Session (avec MP)</th>
                <th>Bénéfice Net/Session (sans MP)</th>
            </tr></thead><tbody>`;
        const totalPPsNeeded = company.ppneeded || 1;
    workers.forEach(worker => {
        const wageDisplay = formatCurrency(worker.wage, 4);
        const ppDisplay = worker.ppPerSession;
        const ppStockedDisplay = worker.ppStocked.toFixed(2); 
        const costPerSession = worker.costperSession;
        const costDisplay = formatCurrency(costPerSession, 3);
        
        const profitClass = worker.netProfit > 0 ? 'profit-positive' : 'profit-negative';
        const profitDisplay = formatCurrency(worker.netProfit, 3);

        const profitGrossClass = worker.netProfitGross > 0 ? 'profit-positive' : 'profit-negative';
        const profitGrossDisplay = formatCurrency(worker.netProfitGross, 3);

        const workerName = worker.name || 'Inconnu';

        const breakEvenDisplay = formatCurrency(worker.breakEvenPrice, 3);
        const breakEvenPerItem = (worker.breakEvenPrice * totalPPsNeeded) + company.costMP;
        const breakEvenPerItemDisplay = formatCurrency(breakEvenPerItem, 3);

        html += `
            <tr>
                <td>${workerName}</td> 
                <td>${ppDisplay}</td>
                <td>${ppStockedDisplay}</td>
                <td>${wageDisplay}</td>
                <td>${costDisplay}</td>
                <td>${breakEvenDisplay}</td>
                <td><strong>${breakEvenPerItemDisplay}</strong></td>
                <td class="${profitClass}">
                    ${profitDisplay} 
                    ${worker.netProfit > 0 ? '💰' : '🔻'}
                </td>
                <td class="${profitGrossClass}">
                    ${profitGrossDisplay} 
                    ${worker.netProfitGross > 0 ? '' : '🔻'}
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    return html;
}

// --- AFFICHAGE COMPAGNIES ---
export function displayCompanies(companiesList) {
    if (!Array.isArray(companiesList) || companiesList.length === 0) {
        companiesOutput.innerHTML = '<div>Aucune compagnie trouvée.</div>';
        return;
    }
    const best = computeBestCompany(companiesList);
    const name_best = best?.company?.name || 'Sans nom';
    let html = `<h3>🏭 Mes Compagnies (${companiesList.length}) - Meilleure Rentabilité : ${name_best}</h3>`;
    
    companiesList.forEach(comp => {
       
        const name = comp.name || 'Sans nom';
        const itemCode = comp.itemCode ? comp.itemCode.toUpperCase() : 'Inconnu';
        const regionName = comp.regionName || 'Inconnu'; 
        const countryName = comp.countryData?.name || 'Inconnu';

        const countryBonusDisplay = (comp.countryBonus * 100).toFixed(1) + '%';
        const depositBonusDisplay = (comp.hasBonus) ? '✅ 30.0%' : '❌ 0.0%'; 
        const totalBonus = (comp.bonus * 100).toFixed(1) + '%';

        const itemPriceDisplay = formatCurrency(comp.itemPrice, 3);
        const netValuePerPPDisplay = formatCurrency(comp.netValuePerPP, 3); 
        const grossNetValuePerPPDisplay = formatCurrency(comp.grossNetValuePerPP, 3);
        
        const marketProfitClass = comp.marketProfit > 0 ? 'profit-positive' : 'profit-negative';
        const marketProfitDisplay = formatCurrency(comp.marketProfit, 3);
        const marketWageDisplay = formatCurrency(comp.marketMaxWage, 3);
        
        const { averageProfitPerWorker, profit_user_pp, totalprofit } = computeCompanyProfit(comp);
        const profitClass = totalprofit >= 0 ? 'profit-positive' : 'profit-negative';
        const profitSign = totalprofit >= 0 ? '+' : '-';
        const profitDisplay = formatCurrency(Math.abs(totalprofit), 3);
        const ppneeded = comp.ppneeded || 1;
        const specializedItem = comp.countryData?.specializedItem || 'Inconnu';
        const depositQuantity = comp.regionData?.deposit.quantity || 0;
        const profitStatusHtml = `<span class="summary-profit ${profitClass}"> - Rentabilité de l'entreprise: ${profitSign} ${profitDisplay} par Session</span>`;

        html += `<div style="background: #333; padding: 15px; border-radius: 8px; margin-bottom: 25px;">`;
        html += `<h4>${name} (${itemCode}) - ${regionName}, ${countryName}${profitStatusHtml}</h4>`;
        
        html += `<table class="result-table" style="width: 100%; margin-bottom: 15px;">`;
        html += `<thead><tr>
                    <th>Bonus Pays</th>
                    <th>Item specialisé</th>
                    <th>Bonus Dépôt</th>
                    <th>Bonus Total</th>
                    <th>Quantité Dépôt</th>
                    <th>Prix Vente Item</th>
                    <th>Coût en PP</th>
                    <th>Valeur Nette / PP (avec MP)</th>
                    <th>Valeur Nette / PP (sans MP)</th>
                    <th>Salaire Max Marché</th>
                    <th>Rentabilité si Alignement (12 PP)</th>
                </tr></thead><tbody>`;
        html += `
            <tr>
                <td>${countryBonusDisplay}</td>
                <td>${specializedItem.toUpperCase()}</td>
                <td>${depositBonusDisplay}</td>
                <td><strong>${totalBonus}</strong></td>
                <td>${depositQuantity}</td>
                <td>${itemPriceDisplay}</td>
                <td>${ppneeded}</td>
                <td>${netValuePerPPDisplay}</td>
                <td>${grossNetValuePerPPDisplay}</td>
                <td>${marketWageDisplay}</td>
                <td class="${marketProfitClass}">
                    ${marketProfitDisplay} 
                    ${comp.marketProfit > 0 ? '🟢' : '🔴'}
                </td>
            </tr>
        `;
        html += '</tbody></table>';
        
        html += displayWorkerDetails(comp.workersInfo, comp.minBonusRequired, comp);

        // --- SECTION SPECIALE POUR LE TABLEAU REEL ---
        if (comp.realStats) {
            html += displayRealStats(comp.realStats);
        }

        html += `</div>`;
    });

    companiesOutput.innerHTML = html;
}

// --- SCANNER USINES (Inchangé) ---
export function updateFactoryStatus(message, type = 'info') {
    const statusDiv = document.getElementById('factory-status');
    statusDiv.innerHTML = message;
    statusDiv.className = 'status-message';
    if (type === 'loading') {
        statusDiv.classList.add('loading');
    } else if (type === 'error') {
        statusDiv.classList.add('error');
    }
}

export function displayFactoryResults(factoryAnalysis, userPPPerSession) {
    if (!Array.isArray(factoryAnalysis) || factoryAnalysis.length === 0) {
        factoryOutput.innerHTML = '<p>Aucune analyse de compagnie à effectuer.</p>';
        return;
    }

    let html = '';
    
    factoryAnalysis.forEach(item => {
        const comp = item.company;
        const transferCost = item.transferCost;
        const itemCodeUpper = comp.itemCode.toUpperCase();
        const itemPrice = comp.itemPrice || 0;
        const totalPPsNeeded = comp.ppneeded || 1;
        const transferCostDisplay = formatCurrency(transferCost, 3); 
        
        html += `<div class="optimization-table">`;
        html += `<h3>🏭 ${comp.name} (Produit: ${itemCodeUpper})</h3>`;
        html += `<p><em>Coût estimé d'un déménagement : <strong>${transferCostDisplay}</strong> (5x CONCRETE)</em></p>`;
        
        html += '<table class="result-table">';
        html += '<thead><tr><th>Rang</th><th>Région</th><th>Pays</th><th>Item Specialisé</th><th>Bonus Pays</th><th>Dépôt</th><th>Bonus Total</th><th>Seuil de Rentabilité (Unités)</th><th>Sessions de Travail</th></tr></thead><tbody>';

        // --- LIGNE ACTUELLE ---
        const currentBonus = (comp.bonus * 100).toFixed(1) + '%';
        const currentDepositQty = comp.regionData?.deposit?.quantity || 0;
        const depositInfoCurrent = comp.hasBonus ? `✅ ${formatNumber(currentDepositQty)}` : `❌`;

        html += `
            <tr class="highlight-current">
                <td>**ACTUEL**</td>
                <td><strong>${comp.regionName}</strong></td>
                <td>${comp.countryData?.name || 'Inconnu'}</td> 
                <td>${(comp.countryData?.specializedItem).toUpperCase() || 'Aucun'}</td>
                <td>${(comp.countryBonus * 100).toFixed(1)}%</td>
                <td>${depositInfoCurrent}</td>
                <td>${currentBonus}</td>
                <td>N/A (Coût = 0)</td>
                <td>N/A</td>
            </tr>
        `;
        
        // --- LIGNES ALTERNATIVES ---
        item.alternatives.forEach((option, index) => {
            const totalBonus = (option.score * 100).toFixed(1) + '%';
            const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
            const rankClass = index === 0 ? 'recommendation-rank' : '';
            
            const depositInfo = option.hasBonus ? `✅ ${formatNumber(option.depotquantity)}` : `❌`;
            
            let breakEvenText = 'N/A';
            let sessionsText = 'N/A';
            
            if (transferCost > 0 && itemPrice > 0) {
                // Calcul basé sur le bonus de la destination
                const priceWithBonus = itemPrice * (1 + option.score);
                const breakEvenUnits = transferCost / priceWithBonus;
                const totalPPsToCoverCost = breakEvenUnits * totalPPsNeeded;
                const breakEvenSessions = totalPPsToCoverCost / userPPPerSession;

                breakEvenText = `${formatNumber(breakEvenUnits)} unités`;
                sessionsText = `${formatNumber(breakEvenSessions)} sessions`;
            }
            
            html += `
                <tr>
                    <td class="${rankClass}">${rankEmoji} ${index + 1}</td>
                    <td><strong>${option.regionName}</strong></td>
                    <td>${option.countryName.name || 'Inconnu'}</td> 
                    <td>${(option.countryItem).toUpperCase() || 'Aucun'}</td>
                    <td>${(option.countryBonus * 100).toFixed(1)}%</td>
                    <td>${depositInfo}</td>
                    <td>${totalBonus}</td>
                    <td>${breakEvenText}</td>
                    <td>${sessionsText}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        html += '</div>';
    });

    factoryOutput.innerHTML = html;
}

// --- TRADING RAPIDE (Inchangé) ---
export function updateTradingStatus(message, type = 'info') {
    const statusDiv = document.getElementById('trading-status');
    statusDiv.innerHTML = message;
    statusDiv.className = 'status-message';
    if (type === 'loading') {
        statusDiv.classList.add('loading');
    } else if (type === 'error') {
        statusDiv.classList.add('error');
    }
}

export function displayTradingResults(results, analysisDuration, timeSinceOldest) {
    if (!Array.isArray(results) || results.length === 0) {
        tradingOutput.innerHTML = `<p>Aucune transaction de trading trouvée. Durée de l'analyse : ${analysisDuration}</p>`;
        return;
    }

    const maxScore = results[0]?.liquidityScoreRaw || 1;
    const numResults = results.length;

    let html = `<h3>Analyse des Marchés (${numResults} Produits Trouvés)</h3>`;
    html += `<p><em>Analysé sur 1000 transactions. Durée couverte: <strong>${analysisDuration}</strong>. 
             La plus vieille transaction a eu lieu il y a : ${timeSinceOldest}.</em></p>`;

    html += '<table class="result-table">';
    html += '<thead><tr><th>Rang</th><th>Produit</th><th>Score de Liquidité (0-1000)</th><th>Volume</th><th>Prix Moyen</th><th>Marge Potentielle</th></tr></thead><tbody>';

    results.forEach((item, index) => {
        const volumeDisplay = formatNumber(item.volume);
        const priceDisplay = formatCurrency(item.pricePerUnit, 3);
        const marginDisplay = formatCurrency(item.profitMargin, 3);
        const normalizedScore = (item.liquidityScoreRaw / maxScore) * 1000;
        const liquidityScoreDisplay = formatNumber(normalizedScore);
        const rank = index + 1;

        html += `
            <tr>
                <td>${rank}</td>
                <td><strong>${item.itemCode.toUpperCase()}</strong></td>
                <td>${liquidityScoreDisplay}</td>
                <td>${volumeDisplay}</td>
                <td>${priceDisplay}</td>
                <td>${marginDisplay}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    tradingOutput.innerHTML = html;
}