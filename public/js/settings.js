/**
 * Settings page functionality
 */
document.addEventListener('DOMContentLoaded', () => {
    // Provjeri autentifikaciju
    const user = checkAuth();
    if (!user) return;

    // Postavi prikaz korisnika
    setupUserDisplay(user);
    setupLogout();

    // Učitaj i primijeni spremljene postavke
    loadSettings();
    applyCurrentSettings();

    // Setup event listeners
    setupSaveSettings();
    setupExportData();
    setupClearData();
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

// Učitaj spremljene postavke
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');

    // Izgled
    if (settings.theme) {
        document.getElementById('themeSelect').value = settings.theme;
    }
    if (settings.fontSize) {
        document.getElementById('fontSizeSelect').value = settings.fontSize;
    }
    if (settings.compactView !== undefined) {
        document.getElementById('compactToggle').checked = settings.compactView;
    }

    // Editor
    if (settings.autosave !== undefined) {
        document.getElementById('autosaveToggle').checked = settings.autosave;
    }
    if (settings.autosaveInterval) {
        document.getElementById('autosaveInterval').value = settings.autosaveInterval;
    }
    if (settings.wordCount !== undefined) {
        document.getElementById('wordCountToggle').checked = settings.wordCount;
    }
    if (settings.spellcheck !== undefined) {
        document.getElementById('spellcheckToggle').checked = settings.spellcheck;
    }

    // Notifikacije
    if (settings.emailNotify !== undefined) {
        document.getElementById('emailNotifyToggle').checked = settings.emailNotify;
    }
    if (settings.soundNotify !== undefined) {
        document.getElementById('soundNotifyToggle').checked = settings.soundNotify;
    }
}

// Spremi postavke - automatski pri svakoj promjeni
function setupSaveSettings() {
    // Lista svih input elemenata koje treba pratiti
    const inputs = [
        'themeSelect',
        'fontSizeSelect',
        'compactToggle',
        'autosaveToggle',
        'autosaveInterval',
        'wordCountToggle',
        'spellcheckToggle',
        'emailNotifyToggle',
        'soundNotifyToggle'
    ];

    // Dodaj event listener na svaki input
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', saveSettings);
        }
    });
}

// Funkcija za spremanje postavki
function saveSettings() {
    const settings = {
        // Izgled
        theme: document.getElementById('themeSelect').value,
        fontSize: document.getElementById('fontSizeSelect').value,
        compactView: document.getElementById('compactToggle').checked,
        // Editor
        autosave: document.getElementById('autosaveToggle').checked,
        autosaveInterval: document.getElementById('autosaveInterval').value,
        wordCount: document.getElementById('wordCountToggle').checked,
        spellcheck: document.getElementById('spellcheckToggle').checked,
        // Notifikacije
        emailNotify: document.getElementById('emailNotifyToggle').checked,
        soundNotify: document.getElementById('soundNotifyToggle').checked,
    };

    localStorage.setItem('appSettings', JSON.stringify(settings));

    // Primijeni temu odmah
    applyTheme(settings.theme);

    // Prikaži kratku potvrdu
    showMessage('Postavke spremljene', 'success');
}

// Primijeni temu
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
    } else {
        // Auto - koristi sistemsku preferencu
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

// Izvoz podataka
function setupExportData() {
    const exportBtn = document.getElementById('exportDataBtn');

    exportBtn.addEventListener('click', async () => {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Izvoz...';

        try {
            // Dohvati sve scenarije
            const response = await fetch('/api/scenarios');
            if (!response.ok) throw new Error('Greška pri dohvaćanju');

            const data = await response.json();
            const scenarios = data.scenarios || [];

            // Dohvati detalje za svaki scenarij
            const fullData = await Promise.all(
                scenarios.map(async (s) => {
                    const res = await fetch(`/api/scenarios/${s.id}`);
                    if (res.ok) return res.json();
                    return s;
                })
            );

            // Kreiraj JSON za preuzimanje
            const exportData = {
                exportDate: new Date().toISOString(),
                scenariosCount: fullData.length,
                scenarios: fullData
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scenarijpro-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showMessage('Podaci su uspješno izvezeni!', 'success');
        } catch (err) {
            console.error('Export error:', err);
            showMessage('Greška pri izvozu podataka.', 'error');
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Izvezi
            `;
        }
    });
}

// Brisanje svih scenarija
function setupClearData() {
    const clearBtn = document.getElementById('clearDataBtn');
    const modal = document.getElementById('clearDataModal');
    const cancelBtn = document.getElementById('cancelClearBtn');
    const confirmBtn = document.getElementById('confirmClearBtn');
    const errorEl = document.getElementById('clearDataError');

    clearBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        errorEl.textContent = '';
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Brisanje...';

        try {
            // Dohvati sve scenarije
            const response = await fetch('/api/scenarios');
            if (!response.ok) throw new Error('Greška pri dohvaćanju');

            const data = await response.json();
            const scenarios = data.scenarios || [];

            // Obriši svaki scenarij
            for (const s of scenarios) {
                await fetch(`/api/scenarios/${s.id}`, { method: 'DELETE' });
            }

            modal.classList.add('hidden');
            showMessage(`Uspješno obrisano ${scenarios.length} scenarija.`, 'success');
        } catch (err) {
            console.error('Clear data error:', err);
            errorEl.textContent = 'Greška pri brisanju podataka.';
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Obriši sve';
        }
    });
}

// Show message
function showMessage(text, type) {
    const messageEl = document.getElementById('settingsMessage');
    messageEl.textContent = text;
    messageEl.className = `settings-message ${type}`;
    messageEl.classList.remove('hidden');

    // Auto-hide after 3 seconds
    setTimeout(() => {
        messageEl.classList.add('hidden');
    }, 3000);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Primijeni trenutne postavke pri učitavanju
function applyCurrentSettings() {
    const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
    applyTheme(settings.theme || 'light');
}
