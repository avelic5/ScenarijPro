/**
 * Login/Register page functionality
 */

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

document.addEventListener('DOMContentLoaded', () => {
    // Primijeni temu
    applyTheme();
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const loginError = document.getElementById('loginError');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show/hide forms
            if (tab === 'login') {
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
            }

            // Clear error messages
            clearMessages();
        });
    });

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        if (!email || !password) {
            showError(loginError, 'Molimo unesite email i lozinku.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Prijavljivanje...';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Spremi korisnika u localStorage
                localStorage.setItem('user', JSON.stringify(data.user));
                // Preusmjeri na projects stranicu
                window.location.href = '/html/projects.html';
            } else {
                showError(loginError, data.message || 'Pogrešan email ili lozinka.');
            }
        } catch (err) {
            console.error('Login error:', err);
            showError(loginError, 'Greška pri povezivanju sa serverom.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Prijavi se';
        }
    });

    // Register form submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();

        const firstName = document.getElementById('registerFirstName').value.trim();
        const lastName = document.getElementById('registerLastName').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        // Validacija
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            showError(registerError, 'Molimo popunite sva polja.');
            return;
        }

        if (password.length < 6) {
            showError(registerError, 'Lozinka mora imati minimalno 6 znakova.');
            return;
        }

        if (password !== confirmPassword) {
            showError(registerError, 'Lozinke se ne podudaraju.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Registracija...';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Spremi korisnika u localStorage i preusmjeri na projects
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = '/html/projects.html';
            } else {
                showError(registerError, data.message || 'Greška pri registraciji.');
            }
        } catch (err) {
            console.error('Register error:', err);
            showError(registerError, 'Greška pri povezivanju sa serverom.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Registriraj se';
        }
    });

    // Helper funkcije
    function clearMessages() {
        loginError.textContent = '';
        registerError.textContent = '';
        registerSuccess.textContent = '';
    }

    function showError(element, message) {
        element.textContent = message;
    }

    function showSuccess(element, message) {
        element.textContent = message;
    }

    // Provjeri da li je korisnik već prijavljen
    const user = localStorage.getItem('user');
    if (user) {
        window.location.href = '/html/projects.html';
    }
});
