// --- CONFIGURATION API ---
const trpcEndpoint = 'https://api2.warera.io/trpc';

// --- FONCTIONS CORE ---

export async function trpcQuery(procedureName, input = {}) {
    // AMELIORATION: Utiliser une librairie comme axios pourrait simplifier la gestion des erreurs et des headers.
    const cleanedInput = Object.keys(input).reduce((acc, key) => {
        if (input[key] !== null && input[key] !== undefined) {
            acc[key] = input[key];
        }
        return acc;
    }, {});

    const url = `${trpcEndpoint}/${procedureName}?input=${encodeURIComponent(JSON.stringify(cleanedInput))}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const errorText = await response.text(); 
        let errorMessage = `Erreur HTTP: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson?.error?.message) {
                errorMessage = errorJson.error.message;
            }
        } catch {}

        throw new Error(errorMessage);
    }

    const data = await response.json();

    if (data.result && data.result.data) {
        return data.result.data;
    }
    
    return data; 
}

// --- FONCTIONS UTILISATEUR ---

export async function getUserProductionAndName(userId) {
    try {
        const userData = await trpcQuery('user.getUserLite', { userId });
        
        return {
            production: userData.skills?.production?.value || 12,
            name: userData.username || userId.substring(0, 8) + '...',
        };

    } catch (error) {
        // AMELIORATION: Retourner une erreur explicite ou null permettrait de mieux gérer l'UI en cas d'échec partiel.
        console.error(`Erreur profil ${userId}:`, error);
        return {
            ppPerSession: 12,
            username: userId.substring(0, 8) + '...'
        }; 
    }
}

// --- FONCTIONS REGION & PAYS ---

export async function getAllRegions() {
    try {
        const regionsData = await trpcQuery('region.getRegionsObject', {});
        // AMELIORATION: Vérifier que regionsData est bien un objet avant d'utiliser Object.values
        return Object.values(regionsData) || [];
    } catch (error) {
        console.error("Erreur régions:", error);
        return [];
    }
}

export async function getAllCountries() {
    try {
        const countries = await trpcQuery('country.getAllCountries', {});
        return Array.isArray(countries) ? countries : [];
    } catch (error) {
        console.error('Erreur pays:', error);
        return [];
    }
}