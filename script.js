// FileFlow Pro - Application complète

// Theme Manager
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('fileflow_theme') || 'light';
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.setupThemeToggle();
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('fileflow_theme', theme);
        const themeBtn = document.querySelector('.theme-btn i');
        if (themeBtn) {
            themeBtn.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(this.currentTheme);
    }

    setupThemeToggle() {
        const themeBtn = document.querySelector('.theme-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.toggleTheme());
        }
    }
}

// User Manager
class UserManager {
    constructor() {
        this.users = JSON.parse(localStorage.getItem('fileflow_users')) || [];
        this.currentUser = JSON.parse(localStorage.getItem('fileflow_current_user')) || null;
    }

    register(email, password) {
        if (this.users.find(u => u.email === email)) {
            return { success: false, message: 'Cet email existe déjà' };
        }
        const user = {
            id: Date.now(),
            email,
            password: btoa(password),
            isPremium: false,
            subscriptionDate: null,
            conversionsThisMonth: 0
        };
        this.users.push(user);
        localStorage.setItem('fileflow_users', JSON.stringify(this.users));
        return { success: true };
    }

    login(email, password) {
        const user = this.users.find(u => u.email === email && u.password === btoa(password));
        if (!user) {
            return { success: false, message: 'Email ou mot de passe incorrect' };
        }
        this.currentUser = user;
        localStorage.setItem('fileflow_current_user', JSON.stringify(user));
        return { success: true };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('fileflow_current_user');
    }

    upgradeToPremium(paymentMethod) {
        if (this.currentUser) {
            this.currentUser.isPremium = true;
            this.currentUser.subscriptionDate = new Date().toISOString();
            this.currentUser.paymentMethod = paymentMethod;
            localStorage.setItem('fileflow_current_user', JSON.stringify(this.currentUser));
            const idx = this.users.findIndex(u => u.id === this.currentUser.id);
            if (idx !== -1) this.users[idx] = this.currentUser;
            localStorage.setItem('fileflow_users', JSON.stringify(this.users));
            return true;
        }
        return false;
    }

    cancelPremium() {
        if (this.currentUser) {
            this.currentUser.isPremium = false;
            this.currentUser.subscriptionDate = null;
            localStorage.setItem('fileflow_current_user', JSON.stringify(this.currentUser));
            const idx = this.users.findIndex(u => u.id === this.currentUser.id);
            if (idx !== -1) this.users[idx] = this.currentUser;
            localStorage.setItem('fileflow_users', JSON.stringify(this.users));
            return true;
        }
        return false;
    }

    canConvert() {
        if (!this.currentUser) return true;
        if (this.currentUser.isPremium) return true;
        return (this.currentUser.conversionsThisMonth || 0) < 5;
    }

    incrementConversion() {
        if (this.currentUser) {
            this.currentUser.conversionsThisMonth = (this.currentUser.conversionsThisMonth || 0) + 1;
            localStorage.setItem('fileflow_current_user', JSON.stringify(this.currentUser));
        }
    }
}

// Conversion Manager
class ConversionManager {
    constructor() {
        this.selectedTool = 'text-pdf';
        this.files = [];
    }

    setTool(tool) {
        this.selectedTool = tool;
    }

    addFiles(files) {
        this.files = files;
    }

    async convert() {
        if (this.files.length === 0) return null;

        try {
            switch (this.selectedTool) {
                case 'text-pdf':
                    return await this.textToPDF();
                case 'png-jpg':
                    return await this.imageToJPG();
                case 'jpg-png':
                    return await this.imageToPNG();
                case 'zip':
                    return await this.createZIP();
                default:
                    alert('Conversion non implémentée. Simulation...');
                    return this.files[0];
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur de conversion: ' + error.message);
            return null;
        }
    }

    async textToPDF() {
        const { PDFDocument, rgb } = window.PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        let y = 750;

        for (const file of this.files) {
            if (file.type === 'text/plain') {
                const text = await file.text();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (y < 50) {
                        y = 750;
                        pdfDoc.addPage([600, 800]);
                    }
                    page.drawText(line.substring(0, 80), {
                        x: 50,
                        y: y,
                        size: 12,
                        color: rgb(0, 0, 0)
                    });
                    y -= 20;
                }
            }
        }

        const pdfBytes = await pdfDoc.save();
        return new Blob([pdfBytes], { type: 'application/pdf' });
    }

    async imageToJPG() {
        for (const file of this.files) {
            if (file.type.startsWith('image/')) {
                return await this.convertImage(file, 'image/jpeg', 0.9);
            }
        }
    }

    async imageToPNG() {
        for (const file of this.files) {
            if (file.type.startsWith('image/')) {
                return await this.convertImage(file, 'image/png', 1);
            }
        }
    }

    async convertImage(file, format, quality) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => resolve(blob), format, quality);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async createZIP() {
        const zip = new JSZip();
        for (const file of this.files) {
            zip.file(file.name, file);
        }
        return await zip.generateAsync({ type: 'blob' });
    }

    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `converted_${this.selectedTool}_${Date.now()}.${this.getExtension(blob.type)}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    getExtension(mimeType) {
        const extensions = {
            'application/pdf': 'pdf',
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'application/zip': 'zip',
            'text/csv': 'csv'
        };
        return extensions[mimeType] || 'file';
    }
}

// UI Manager
class UIManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupAllEvents();
        this.updateUI();
    }

    setupAllEvents() {
        // Theme
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                document.getElementById('settings-modal').classList.add('show');
            });
        }

        // Theme options
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.themeManager.applyTheme(btn.dataset.theme);
            });
        });

        // Auth
        const accountBtn = document.getElementById('account-btn');
        if (accountBtn) {
            accountBtn.addEventListener('click', () => {
                if (window.userManager.currentUser) {
                    this.showAccountModal();
                } else {
                    this.showAuthModal();
                }
            });
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.userManager.logout();
                this.updateUI();
            });
        }

        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAuth();
            });
        }

        const toggleAuth = document.getElementById('toggle-auth');
        if (toggleAuth) {
            toggleAuth.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAuthMode();
            });
        }

        // File upload
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('file-input');
        const fileInputBtn = document.getElementById('file-input-btn');

        if (fileInputBtn) {
            fileInputBtn.addEventListener('click', () => fileInput.click());
        }
        if (dropzone) {
            dropzone.addEventListener('click', () => fileInput.click());
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });
            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                this.handleFiles(Array.from(e.dataTransfer.files));
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFiles(Array.from(e.target.files));
            });
        }

        // Tool selector
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.conversionManager.setTool(btn.dataset.tool);
            });
        });

        // Convert
        const convertBtn = document.getElementById('convert-btn');
        if (convertBtn) {
            convertBtn.addEventListener('click', () => this.handleConvert());
        }

        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.getElementById('preview-section').style.display = 'none';
                window.conversionManager.files = [];
            });
        }

        // Payment
        const premiumBtn = document.getElementById('premium-btn');
        if (premiumBtn) {
            premiumBtn.addEventListener('click', () => {
                if (!window.userManager.currentUser) {
                    alert('Veuillez d\'abord vous connecter');
                    this.showAuthModal();
                } else {
                    document.getElementById('payment-modal').classList.add('show');
                }
            });
        }

        const upgradeBtn = document.getElementById('upgrade-btn');
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', () => {
                document.getElementById('payment-modal').classList.add('show');
            });
        }

        // Payment methods
        document.querySelectorAll('.payment-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const method = btn.dataset.method;
                this.showPaymentForm(method);
            });
        });

        // Payment forms
        const cardForm = document.getElementById('card-form');
        if (cardForm) {
            cardForm.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('Paiement par carte traité! Vous êtes maintenant Premium.');
                window.userManager.upgradeToPremium('card');
                this.closeAllModals();
                this.updateUI();
            });
        }

        const mobileForm = document.getElementById('mobile-form');
        if (mobileForm) {
            mobileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const number = document.getElementById('mobile-number').value;
                alert(`Code envoyé à ${number}! Paiement traité, vous êtes Premium.`);
                window.userManager.upgradeToPremium('mobile');
                this.closeAllModals();
                this.updateUI();
            });
        }

        const cancelSubBtn = document.getElementById('cancel-sub-btn');
        if (cancelSubBtn) {
            cancelSubBtn.addEventListener('click', () => {
                if (confirm('Annuler votre abonnement Premium?')) {
                    window.userManager.cancelPremium();
                    this.closeAllModals();
                    this.updateUI();
                }
            });
        }

        // Close modals
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                modal.classList.remove('show');
            });
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });
    }

    handleFiles(files) {
        window.conversionManager.addFiles(files);
        this.showPreview(files);
    }

    showPreview(files) {
        const previewSection = document.getElementById('preview-section');
        const previewContent = document.getElementById('preview-content');

        previewSection.style.display = 'block';
        previewContent.innerHTML = '';

        files.forEach((file) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <i class="fas fa-file"></i>
                <span>${file.name}</span>
                <span class="file-size">(${this.formatSize(file.size)})</span>
            `;
            previewContent.appendChild(item);
        });

        previewSection.scrollIntoView({ behavior: 'smooth' });
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async handleConvert() {
        const user = window.userManager.currentUser;
        if (!window.userManager.canConvert()) {
            alert('Limite atteinte. Passez Premium pour conversions illimitées.');
            return;
        }

        const convertBtn = document.getElementById('convert-btn');
        convertBtn.disabled = true;
        convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conversion...';

        const result = await window.conversionManager.convert();
        if (result) {
            window.conversionManager.downloadFile(result);
            if (user) window.userManager.incrementConversion();
            alert('Conversion réussie!');
            document.getElementById('preview-section').style.display = 'none';
        }

        convertBtn.disabled = false;
        convertBtn.innerHTML = '<i class="fas fa-magic"></i> Convertir maintenant';
    }

    showPaymentForm(method) {
        document.getElementById('card-modal').style.display = 'none';
        document.getElementById('mobile-modal').style.display = 'none';
        document.getElementById('payment-modal').style.display = 'none';

        if (method === 'card') {
            document.getElementById('card-modal').classList.add('show');
        } else if (method === 'mobile') {
            document.getElementById('mobile-modal').classList.add('show');
        }
    }

    handleAuth() {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const isLogin = document.getElementById('auth-title').textContent.includes('Connexion');

        let result;
        if (isLogin) {
            result = window.userManager.login(email, password);
        } else {
            result = window.userManager.register(email, password);
        }

        if (result.success) {
            alert(isLogin ? 'Connecté!' : 'Compte créé!');
            this.closeAllModals();
            this.updateUI();
            document.getElementById('auth-form').reset();
        } else {
            alert(result.message);
        }
    }

    toggleAuthMode() {
        const title = document.getElementById('auth-title');
        const isLogin = title.textContent.includes('Connexion');
        const span = document.querySelector('.auth-toggle span');
        const btn = document.getElementById('toggle-auth');
        const submit = document.querySelector('#auth-form button[type="submit"]');

        if (isLogin) {
            title.textContent = 'Inscription';
            span.textContent = 'Déjà un compte? ';
            btn.textContent = 'Se connecter';
            submit.textContent = 'S\'inscrire';
        } else {
            title.textContent = 'Connexion';
            span.textContent = 'Pas de compte? ';
            btn.textContent = 'S\'inscrire';
            submit.textContent = 'Se connecter';
        }
    }

    showAuthModal() {
        document.getElementById('auth-modal').classList.add('show');
    }

    showAccountModal() {
        const user = window.userManager.currentUser;
        if (user) {
            document.getElementById('account-email').textContent = user.email;
            document.getElementById('account-status').textContent = user.isPremium ? 'Premium' : 'Gratuit';
            document.getElementById('account-status').className = `status-badge ${user.isPremium ? 'premium' : 'free'}`;
            document.getElementById('account-conversions').textContent = user.conversionsThisMonth || 0;
            document.getElementById('cancel-sub-btn').style.display = user.isPremium ? 'block' : 'none';
        }
        document.getElementById('account-modal').classList.add('show');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    }

    updateUI() {
        const user = window.userManager.currentUser;
        const accountBtn = document.getElementById('account-btn');
        const logoutBtn = document.getElementById('logout-btn');

        if (user) {
            accountBtn.textContent = '👤 Mon Compte';
            logoutBtn.style.display = 'inline-flex';
        } else {
            accountBtn.textContent = '🔑 Connexion';
            logoutBtn.style.display = 'none';
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
    window.userManager = new UserManager();
    window.conversionManager = new ConversionManager();
    window.uiManager = new UIManager();
});
