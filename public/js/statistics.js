/**
 * Statistics page functionality
 */
document.addEventListener('DOMContentLoaded', () => {
    // Provjeri autentifikaciju
    const user = checkAuth();
    if (!user) return;

    // Postavi prikaz korisnika
    setupUserDisplay(user);
    setupLogout();
    
    // Primijeni temu
    applyTheme();

    // Učitaj statistiku
    loadStatistics();
});

// Provjeri da li je korisnik prijavljen
function checkAuth() {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = '/html/login.html';
        return null;
    }
    try {
        return JSON.parse(userStr);
    } catch {
        localStorage.removeItem('user');
        window.location.href = '/html/login.html';
        return null;
    }
}

// Postavi korisničke podatke u sidebar
function setupUserDisplay(user) {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userStatus = document.getElementById('userStatus');

    if (userAvatar && user.firstName) {
        userAvatar.textContent = user.firstName.charAt(0).toUpperCase();
    }
    if (userName && user.firstName && user.lastName) {
        userName.textContent = `${user.firstName} ${user.lastName}`;
    }
    if (userStatus) {
        userStatus.textContent = 'Član';
    }
}

// Logout funkcionalnost
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('user');
            window.location.href = '/html/login.html';
        });
    }
}

// Učitaj sve statistike
async function loadStatistics() {
    try {
        // Dohvati listu svih scenarija
        const response = await fetch('/api/scenarios');
        if (!response.ok) {
            throw new Error('Greška pri dohvaćanju scenarija');
        }

        const data = await response.json();
        const scenarios = data.scenarios || [];

        if (scenarios.length === 0) {
            showNoScenarios();
            return;
        }

        // Dohvati detalje za svaki scenarij
        const scenarioDetails = await Promise.all(
            scenarios.map(s => fetchScenarioDetails(s.id))
        );

        // Izračunaj statistike
        const stats = calculateStats(scenarioDetails);

        // Prikaži statistike
        displayStats(stats);
        displayScenariosTable(scenarioDetails);
        displayCharacters(stats.characters);

    } catch (err) {
        console.error('Greška pri učitavanju statistike:', err);
    }
}

// Dohvati detalje jednog scenarija
async function fetchScenarioDetails(scenarioId) {
    try {
        const response = await fetch(`/api/scenarios/${scenarioId}`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

// Izračunaj ukupne statistike
function calculateStats(scenarios) {
    const validScenarios = scenarios.filter(s => s !== null);

    let totalLines = 0;
    let totalWords = 0;
    const characterCounts = new Map();

    for (const scenario of validScenarios) {
        const content = scenario.content || [];
        totalLines += content.length;

        for (const line of content) {
            const text = line.text || '';

            // Broj riječi
            const words = text.trim().split(/\s+/).filter(w => w.length > 0);
            totalWords += words.length;

            // Detektiraj likove (VELIKA SLOVA)
            if (isRoleLine(text)) {
                const charName = text.trim().toUpperCase();
                characterCounts.set(charName, (characterCounts.get(charName) || 0) + 1);
            }
        }
    }

    // Sortiraj likove po broju pojavljivanja
    const characters = Array.from(characterCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12); // Top 12 likova

    return {
        totalScenarios: validScenarios.length,
        totalLines,
        totalWords,
        totalCharacters: characterCounts.size,
        characters,
        scenarios: validScenarios
    };
}

// Provjeri da li je linija ime uloge
function isRoleLine(text) {
    const t = (text || '').trim();
    if (t.length === 0 || t.length > 50) return false;
    // Samo velika slova i razmaci
    const onlyUpperAndSpace = /^[A-ZŠĐČĆŽ ]+$/;
    const hasLetter = /[A-ZŠĐČĆŽ]/;
    return onlyUpperAndSpace.test(t) && hasLetter.test(t);
}

// Prikaži glavne statistike
function displayStats(stats) {
    document.getElementById('totalScenarios').textContent = stats.totalScenarios;
    document.getElementById('totalLines').textContent = stats.totalLines;
    document.getElementById('totalCharacters').textContent = stats.totalCharacters;
    document.getElementById('totalWords').textContent = stats.totalWords.toLocaleString();
}

// Prikaži tabelu scenarija
function displayScenariosTable(scenarios) {
    const tbody = document.getElementById('scenariosTableBody');
    const noMessage = document.getElementById('noScenariosMessage');

    if (!scenarios || scenarios.length === 0) {
        tbody.innerHTML = '';
        noMessage.classList.remove('hidden');
        return;
    }

    noMessage.classList.add('hidden');

    tbody.innerHTML = scenarios.map(scenario => {
        if (!scenario) return '';

        const content = scenario.content || [];
        const lineCount = content.length;

        // Broj likova u ovom scenariju
        const chars = new Set();
        let wordCount = 0;
        for (const line of content) {
            const text = line.text || '';
            if (isRoleLine(text)) {
                chars.add(text.trim().toUpperCase());
            }
            wordCount += text.trim().split(/\s+/).filter(w => w.length > 0).length;
        }

        const status = scenario.status || 'U radu';

        return `
            <tr>
                <td>
                    <a href="/html/writing.html?scenarioId=${scenario.id}" class="scenario-name-link">
                        ${escapeHtml(scenario.title || `Scenarij ${scenario.id}`)}
                    </a>
                </td>
                <td>${lineCount}</td>
                <td>${chars.size}</td>
                <td>${wordCount.toLocaleString()}</td>
                <td><span class="status-badge in-progress">${escapeHtml(status)}</span></td>
            </tr>
        `;
    }).join('');
}

// Prikaži likove
function displayCharacters(characters) {
    const grid = document.getElementById('charactersGrid');
    const noMessage = document.getElementById('noCharactersMessage');

    if (!characters || characters.length === 0) {
        grid.innerHTML = '';
        noMessage.classList.remove('hidden');
        return;
    }

    noMessage.classList.add('hidden');

    // Razne boje za avatare
    const colors = ['#5B43F0', '#059669', '#d97706', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#be185d'];

    grid.innerHTML = characters.map((char, index) => {
        const initial = char.name.charAt(0);
        const color = colors[index % colors.length];

        return `
            <div class="character-card">
                <div class="character-avatar" style="background-color: ${color}">${initial}</div>
                <div class="character-info">
                    <p class="character-name" title="${escapeHtml(char.name)}">${escapeHtml(char.name)}</p>
                    <p class="character-lines">${char.count} ${char.count === 1 ? 'pojavljivanje' : 'pojavljivanja'}</p>
                </div>
            </div>
        `;
    }).join('');
}

// Prikaži poruku kada nema scenarija
function showNoScenarios() {
    document.getElementById('totalScenarios').textContent = '0';
    document.getElementById('totalLines').textContent = '0';
    document.getElementById('totalCharacters').textContent = '0';
    document.getElementById('totalWords').textContent = '0';

    document.getElementById('scenariosTableBody').innerHTML = '';
    document.getElementById('noScenariosMessage').classList.remove('hidden');

    document.getElementById('charactersGrid').innerHTML = '';
    document.getElementById('noCharactersMessage').classList.remove('hidden');
}

// Escape HTML za sigurnost
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Primijeni temu iz postavki
function applyTheme() {
    const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    
    if (settings.theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (settings.theme === 'auto') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        }
    } else {
        document.body.classList.remove('dark-theme');
    }
}
