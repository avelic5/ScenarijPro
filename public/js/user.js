/**
 * User settings page functionality
 */
document.addEventListener('DOMContentLoaded', () => {
    // Primijeni temu
    applyTheme();
    
    // Provjeri autentifikaciju
    const user = checkAuth();
    if (!user) return;

    // Popuni formu sa podacima korisnika
    populateForm(user);

    // Setup event listeners
    setupFormSubmit(user);
    setupDeleteAccount(user);
});

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

// Popuni formu sa podacima korisnika
function populateForm(user) {
    // Avatar
    const avatar = document.getElementById('userAvatarLarge');
    if (avatar && user.firstName) {
        avatar.textContent = user.firstName.charAt(0).toUpperCase();
    }

    // Podaci
    document.getElementById('firstName').value = user.firstName || '';
    document.getElementById('lastName').value = user.lastName || '';
    document.getElementById('email').value = user.email || '';

    // Informacije o računu
    document.getElementById('accountStatus').textContent = 'Aktivan';
    document.getElementById('membershipType').textContent = 'Član';

    // Datum registracije
    if (user.createdAt) {
        const date = new Date(user.createdAt);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('registrationDate').textContent = date.toLocaleDateString('hr-HR', options);
    } else {
        document.getElementById('registrationDate').textContent = 'Nepoznato';
    }
}

// Setup form submit
function setupFormSubmit(user) {
    const form = document.getElementById('userForm');
    const saveBtn = document.getElementById('saveBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessage();

        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        // Validacija
        if (!firstName || !lastName) {
            showMessage('Ime i prezime su obavezni.', 'error');
            return;
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showMessage('Unesite ispravnu email adresu.', 'error');
            return;
        }

        // Validacija lozinke ako se mijenja
        if (newPassword || confirmNewPassword) {
            if (!currentPassword) {
                showMessage('Unesite trenutnu lozinku za promjenu lozinke.', 'error');
                return;
            }
            if (newPassword.length < 6) {
                showMessage('Nova lozinka mora imati minimalno 6 znakova.', 'error');
                return;
            }
            if (newPassword !== confirmNewPassword) {
                showMessage('Nove lozinke se ne podudaraju.', 'error');
                return;
            }
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Spremanje...';

        try {
            const body = {
                firstName,
                lastName,
                email
            };

            if (newPassword && currentPassword) {
                body.currentPassword = currentPassword;
                body.newPassword = newPassword;
            }

            const response = await fetch(`/api/auth/user/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (response.ok) {
                // Ažuriraj localStorage
                const updatedUser = { ...user, ...data.user };
                localStorage.setItem('user', JSON.stringify(updatedUser));

                showMessage('Promjene su uspješno spremljene!', 'success');

                // Očisti polja za lozinku
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmNewPassword').value = '';

                // Ažuriraj avatar
                const avatar = document.getElementById('userAvatarLarge');
                if (avatar && updatedUser.firstName) {
                    avatar.textContent = updatedUser.firstName.charAt(0).toUpperCase();
                }
            } else {
                showMessage(data.message || 'Greška pri spremanju promjena.', 'error');
            }
        } catch (err) {
            console.error('Update error:', err);
            showMessage('Greška pri povezivanju sa serverom.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Spasi promjene';
        }
    });
}

// Setup delete account
function setupDeleteAccount(user) {
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const modal = document.getElementById('deleteModal');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const deleteError = document.getElementById('deleteError');
    const passwordInput = document.getElementById('deleteConfirmPassword');

    deleteBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        passwordInput.value = '';
        deleteError.textContent = '';
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Zatvori modal klikom izvan
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    confirmBtn.addEventListener('click', async () => {
        const password = passwordInput.value;

        if (!password) {
            deleteError.textContent = 'Unesite lozinku za potvrdu.';
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Brisanje...';

        try {
            const response = await fetch(`/api/auth/user/${user.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.removeItem('user');
                window.location.href = '/html/login.html';
            } else {
                deleteError.textContent = data.message || 'Greška pri brisanju računa.';
            }
        } catch (err) {
            console.error('Delete error:', err);
            deleteError.textContent = 'Greška pri povezivanju sa serverom.';
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Obriši trajno';
        }
    });
}

// Show message
function showMessage(text, type) {
    const messageEl = document.getElementById('formMessage');
    messageEl.textContent = text;
    messageEl.className = `form-message ${type}`;
    messageEl.classList.remove('hidden');

    // Scroll to message
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Hide message
function hideMessage() {
    const messageEl = document.getElementById('formMessage');
    messageEl.classList.add('hidden');
}
