const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Baza danych (plik JSON)
const DB_FILE = path.join(__dirname, 'database.json');

// Inicjalizacja bazy danych
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [],
            otpCodes: [],
            sessions: [],
            items: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
}

// Odczyt bazy danych
function readDB() {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

// Zapis do bazy danych
function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Generowanie OTP (6-cyfrowy kod)
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

// Generowanie tokenu sesji
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Logowanie OTP (symulacja wysyłki email)
function logOTP(email, code) {
    const timestamp = new Date().toISOString();
    console.log('\n' + '='.repeat(50));
    console.log('📧 SYMULACJA WYSYŁKI EMAIL');
    console.log('='.repeat(50));
    console.log(`Czas: ${timestamp}`);
    console.log(`Do: ${email}`);
    console.log(`Temat: Twój kod OTP`);
    console.log(`Treść: Twój jednorazowy kod logowania: ${code}`);
    console.log(`Kod wygasa za: 5 minut`);
    console.log('='.repeat(50) + '\n');
}

// Middleware autoryzacji
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Brak tokenu autoryzacji' });
    }

    const token = authHeader.substring(7);
    const db = readDB();
    const session = db.sessions.find(s => s.token === token);

    if (!session) {
        return res.status(401).json({ error: 'Nieprawidłowy token' });
    }

    // Sprawdź czy sesja nie wygasła (30 minut)
    const now = Date.now();
    if (now > session.expiresAt) {
        // Usuń wygasłą sesję
        db.sessions = db.sessions.filter(s => s.token !== token);
        writeDB(db);
        return res.status(401).json({ error: 'Sesja wygasła' });
    }

    // Znajdź użytkownika
    const user = db.users.find(u => u.email === session.email);
    if (!user) {
        return res.status(401).json({ error: 'Użytkownik nie istnieje' });
    }

    req.user = user;
    next();
}

// === ENDPOINTY ===

// POST /api/register - rejestracja użytkownika
app.post('/api/register', (req, res) => {
    const { email } = req.body;

    // Walidacja
    if (!email) {
        return res.status(400).json({ error: 'Email jest wymagany' });
    }

    // Walidacja formatu email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Nieprawidłowy format email' });
    }

    const db = readDB();

    // Sprawdź czy użytkownik już istnieje
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ error: 'Użytkownik o tym adresie email już istnieje' });
    }

    // Utwórz nowego użytkownika
    const newUser = {
        id: crypto.randomUUID(),
        email: email,
        createdAt: Date.now()
    };

    db.users.push(newUser);
    writeDB(db);

    console.log(`✅ Zarejestrowano nowego użytkownika: ${email}`);

    res.status(201).json({ 
        message: 'Użytkownik zarejestrowany pomyślnie',
        email: newUser.email 
    });
});

// POST /api/login - wysłanie kodu OTP
app.post('/api/login', (req, res) => {
    const { email } = req.body;

    // Walidacja
    if (!email) {
        return res.status(400).json({ error: 'Email jest wymagany' });
    }

    const db = readDB();

    // Sprawdź czy użytkownik istnieje
    const user = db.users.find(u => u.email === email);
    if (!user) {
        return res.status(401).json({ error: 'Użytkownik nie istnieje' });
    }

    // Generuj kod OTP
    const otpCode = generateOTP();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minut

    // Usuń stare kody OTP dla tego użytkownika
    db.otpCodes = db.otpCodes.filter(otp => otp.email !== email);

    // Zapisz nowy kod OTP
    db.otpCodes.push({
        email: email,
        code: otpCode,
        expiresAt: expiresAt,
        createdAt: Date.now()
    });

    writeDB(db);

    // "Wyślij" kod OTP (logowanie w konsoli)
    logOTP(email, otpCode);

    res.json({ 
        message: 'Kod OTP został wysłany (sprawdź logi serwera)',
        expiresIn: 300 // 5 minut w sekundach
    });
});

// POST /api/verify-otp - weryfikacja kodu OTP i logowanie
app.post('/api/verify-otp', (req, res) => {
    const { email, code } = req.body;

    // Walidacja
    if (!email || !code) {
        return res.status(400).json({ error: 'Email i kod są wymagane' });
    }

    const db = readDB();

    // Znajdź kod OTP
    const otpRecord = db.otpCodes.find(otp => otp.email === email);
    if (!otpRecord) {
        return res.status(401).json({ error: 'Brak kodu OTP dla tego użytkownika' });
    }

    // Sprawdź czy kod nie wygasł
    if (Date.now() > otpRecord.expiresAt) {
        // Usuń wygasły kod
        db.otpCodes = db.otpCodes.filter(otp => otp.email !== email);
        writeDB(db);
        return res.status(401).json({ error: 'Kod OTP wygasł' });
    }

    // Sprawdź czy kod jest poprawny
    if (otpRecord.code !== code) {
        return res.status(401).json({ error: 'Nieprawidłowy kod OTP' });
    }

    // Usuń użyty kod OTP
    db.otpCodes = db.otpCodes.filter(otp => otp.email !== email);

    // Utwórz sesję
    const sessionToken = generateSessionToken();
    const sessionExpiresAt = Date.now() + (30 * 60 * 1000); // 30 minut

    db.sessions.push({
        token: sessionToken,
        email: email,
        createdAt: Date.now(),
        expiresAt: sessionExpiresAt
    });

    writeDB(db);

    console.log(`✅ Użytkownik ${email} zalogowany pomyślnie`);

    res.json({
        message: 'Zalogowano pomyślnie',
        token: sessionToken,
        expiresIn: 1800 // 30 minut w sekundach
    });
});

// POST /api/logout - wylogowanie
app.post('/api/logout', authMiddleware, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7);

    const db = readDB();
    
    // Usuń sesję
    db.sessions = db.sessions.filter(s => s.token !== token);
    writeDB(db);

    console.log(`✅ Użytkownik ${req.user.email} wylogowany`);

    res.json({ message: 'Wylogowano pomyślnie' });
});

// GET /api/my-items - pobierz elementy użytkownika
app.get('/api/my-items', authMiddleware, (req, res) => {
    const db = readDB();
    const userItems = db.items.filter(item => item.userId === req.user.id);
    
    res.json({ items: userItems });
});

// POST /api/my-items - dodaj element
app.post('/api/my-items', authMiddleware, (req, res) => {
    const { title, description } = req.body;

    // Walidacja
    if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Tytuł jest wymagany' });
    }

    if (title.length > 100) {
        return res.status(400).json({ error: 'Tytuł może mieć maksymalnie 100 znaków' });
    }

    if (description && description.length > 500) {
        return res.status(400).json({ error: 'Opis może mieć maksymalnie 500 znaków' });
    }

    const db = readDB();

    const newItem = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        title: title.trim(),
        description: description ? description.trim() : '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    db.items.push(newItem);
    writeDB(db);

    res.status(201).json({ 
        message: 'Element dodany pomyślnie',
        item: newItem 
    });
});

// PUT /api/my-items/:id - edytuj element
app.put('/api/my-items/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;

    // Walidacja
    if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: 'Tytuł jest wymagany' });
    }

    if (title.length > 100) {
        return res.status(400).json({ error: 'Tytuł może mieć maksymalnie 100 znaków' });
    }

    if (description && description.length > 500) {
        return res.status(400).json({ error: 'Opis może mieć maksymalnie 500 znaków' });
    }

    const db = readDB();
    const itemIndex = db.items.findIndex(item => item.id === id);

    if (itemIndex === -1) {
        return res.status(404).json({ error: 'Element nie znaleziony' });
    }

    // Sprawdź czy element należy do użytkownika
    if (db.items[itemIndex].userId !== req.user.id) {
        return res.status(403).json({ error: 'Brak uprawnień do edycji tego elementu' });
    }

    // Aktualizuj element
    db.items[itemIndex].title = title.trim();
    db.items[itemIndex].description = description ? description.trim() : '';
    db.items[itemIndex].updatedAt = Date.now();

    writeDB(db);

    res.json({ 
        message: 'Element zaktualizowany pomyślnie',
        item: db.items[itemIndex]
    });
});

// DELETE /api/my-items/:id - usuń element
app.delete('/api/my-items/:id', authMiddleware, (req, res) => {
    const { id } = req.params;

    const db = readDB();
    const itemIndex = db.items.findIndex(item => item.id === id);

    if (itemIndex === -1) {
        return res.status(404).json({ error: 'Element nie znaleziony' });
    }

    // Sprawdź czy element należy do użytkownika
    if (db.items[itemIndex].userId !== req.user.id) {
        return res.status(403).json({ error: 'Brak uprawnień do usunięcia tego elementu' });
    }

    // Usuń element
    db.items.splice(itemIndex, 1);
    writeDB(db);

    res.json({ message: 'Element usunięty pomyślnie' });
});

// Inicjalizacja
initDB();

app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na http://localhost:${PORT}`);
});