// Configuration
const PAYPAL_EMAIL = "votre-email@paypal.com";
let currentUser = null;

// Initialisation
function init() {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
        currentUser = JSON.parse(saved);
        showSection('dashboard');
    }
}

// Navigation entre les sections
function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
    }
}

// Gestion de la connexion (Simplifiée)
function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) {
        alert('Veuillez entrer un email');
        return;
    }
    currentUser = { email: email, isPremium: false };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    showSection('dashboard');
}

// Déconnexion
function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showSection('auth');
}

// Lancement au chargement
window.onload = init;
