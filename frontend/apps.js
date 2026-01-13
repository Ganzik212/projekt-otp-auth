const API_URL = 'http://localhost:3000/api';
let currentEmail = '';
let authToken = '';

// Elementy DOM
const registerSection = document.getElementById('registerSection');
const loginSection = document.getElementById('loginSection');
const otpSection = document.getElementById('otpSection');
const itemsSection = document.getElementById('itemsSection');

const userInfo = document.getElementById('userInfo');
const guestInfo = document.getElementById('guestInfo');
const userEmailSpan = document.getElementById('userEmail');

const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const otpForm = document.getElementById('otpForm');
const itemForm = document.getElementById('itemForm');

const messageBox = document.getElementById('messageBox');

// Przełączanie między formularzami
document.getElementById('showLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    registerSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
});

document.getElementById('showRegisterLink').addEventListener('click', (e) => {
    e.preventDefault();
    loginSection.classList.add('hidden');
    registerSection.classList.remove('hidden');
});

// Funkcja wyświetlania komunikatów
function showMessage(text, type = 'success') {
    messageBox.textContent = text;
    messageBox.className = `message ${type}`;
    messageBox.classList.remove('hidden');
    
    setTimeout(() => {
        messageBox.classList.add('hidden');
    }, 5000);
}

// Funkcja żądania HTTP
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, options);
        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || 'Wystąpił błąd');
        }

        return responseData;
    } catch (error) {
        throw error;
    }
}

// REJESTRACJA
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value.trim();

    try {
        const data = await apiRequest('/register', 'POST', { email });
        showMessage(data.message, 'success');
        
        // Przełącz na formularz logowania
        registerForm.reset();
        registerSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        
        // Wypełnij email w formularzu logowania
        document.getElementById('loginEmail').value = email;
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

// WYSYŁKA OTP
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    currentEmail = email;

    try {
        const data = await apiRequest('/login', 'POST', { email });
        showMessage(data.message + ' - kod wygasa za 5 minut', 'success');
        
        // Pokaż formularz OTP
        loginSection.classList.add('hidden');
        otpSection.classList.remove('hidden');
        document.getElementById('otpEmail').textContent = email;
        document.getElementById('otpCode').focus();
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

// Anulowanie OTP
document.getElementById('cancelOtpBtn').addEventListener('click', () => {
    otpSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    otpForm.reset();
    currentEmail = '';
});

// WERYFIKACJA OTP
otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const code = document.getElementById('otpCode').value.trim();

    try {
        const data = await apiRequest('/verify-otp', 'POST', { 
            email: currentEmail, 
            code 
        });
        
        authToken = data.token;
        showMessage(data.message, 'success');
        
        // Pokaż panel zalogowanego użytkownika
        otpSection.classList.add('hidden');
        itemsSection.classList.remove('hidden');
        
        guestInfo.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userEmailSpan.textContent = currentEmail;
        
        otpForm.reset();
        
        // Załaduj elementy użytkownika
        loadItems();
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

// WYLOGOWANIE
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await apiRequest('/logout', 'POST');
        
        authToken = '';
        currentEmail = '';
        
        itemsSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        
        userInfo.classList.add('hidden');
        guestInfo.classList.remove('hidden');
        
        document.getElementById('itemsList').innerHTML = '<p class="no-items">Brak notatek. Dodaj pierwszą!</p>';
        
        showMessage('Wylogowano pomyślnie', 'success');
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

// ŁADOWANIE ELEMENTÓW
async function loadItems() {
    try {
        const data = await apiRequest('/my-items', 'GET');
        displayItems(data.items);
    } catch (error) {
        if (error.message.includes('wygasła') || error.message.includes('token')) {
            showMessage('Sesja wygasła. Zaloguj się ponownie.', 'error');
            authToken = '';
            itemsSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
            userInfo.classList.add('hidden');
            guestInfo.classList.remove('hidden');
        } else {
            showMessage(error.message, 'error');
        }
    }
}

// WYŚWIETLANIE ELEMENTÓW
function displayItems(items) {
    const itemsList = document.getElementById('itemsList');
    
    if (items.length === 0) {
        itemsList.innerHTML = '<p class="no-items">Brak notatek. Dodaj pierwszą!</p>';
        return;
    }

    itemsList.innerHTML = items.map(item => `
        <div class="item" data-id="${item.id}">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.description) || '<em>Brak opisu</em>'}</p>
            <div class="item-actions">
                <button class="btn btn-edit btn-edit-item" data-id="${item.id}">Edytuj</button>
                <button class="btn btn-danger btn-delete-item" data-id="${item.id}">Usuń</button>
            </div>
        </div>
    `).join('');

    // Dodaj event listenery
    document.querySelectorAll('.btn-edit-item').forEach(btn => {
        btn.addEventListener('click', () => editItem(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', () => deleteItem(btn.dataset.id));
    });
}

// Escape HTML (zabezpieczenie XSS)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// DODAWANIE/EDYCJA ELEMENTU
itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('itemTitle').value.trim();
    const description = document.getElementById('itemDescription').value.trim();
    const editId = document.getElementById('editItemId').value;

    try {
        if (editId) {
            // Edycja
            await apiRequest(`/my-items/${editId}`, 'PUT', { title, description });
            showMessage('Notatka zaktualizowana pomyślnie', 'success');
        } else {
            // Dodawanie
            await apiRequest('/my-items', 'POST', { title, description });
            showMessage('Notatka dodana pomyślnie', 'success');
        }

        itemForm.reset();
        document.getElementById('editItemId').value = '';
        document.getElementById('formTitle').textContent = 'Dodaj notatkę';
        document.getElementById('saveItemBtn').textContent = 'Dodaj';
        document.getElementById('cancelEditBtn').classList.add('hidden');
        
        loadItems();
    } catch (error) {
        showMessage(error.message, 'error');
    }
});

// EDYCJA ELEMENTU
function editItem(id) {
    const itemElement = document.querySelector(`.item[data-id="${id}"]`);
    const title = itemElement.querySelector('h4').textContent;
    const description = itemElement.querySelector('p').textContent;

    document.getElementById('editItemId').value = id;
    document.getElementById('itemTitle').value = title;
    document.getElementById('itemDescription').value = description === 'Brak opisu' ? '' : description;
    
    document.getElementById('formTitle').textContent = 'Edytuj notatkę';
    document.getElementById('saveItemBtn').textContent = 'Zapisz';
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    
    document.getElementById('itemTitle').focus();
}

// Anulowanie edycji
document.getElementById('cancelEditBtn').addEventListener('click', () => {
    itemForm.reset();
    document.getElementById('editItemId').value = '';
    document.getElementById('formTitle').textContent = 'Dodaj notatkę';
    document.getElementById('saveItemBtn').textContent = 'Dodaj';
    document.getElementById('cancelEditBtn').classList.add('hidden');
});

// USUWANIE ELEMENTU
async function deleteItem(id) {
    if (!confirm('Czy na pewno chcesz usunąć tę notatkę?')) {
        return;
    }

    try {
        await apiRequest(`/my-items/${id}`, 'DELETE');
        showMessage('Notatka usunięta pomyślnie', 'success');
        loadItems();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}