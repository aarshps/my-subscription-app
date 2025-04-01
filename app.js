// app.js
require('dotenv').config(); // Load environment variables from .env file FIRST!

const express = require('express');
const path = require('path');
const session = require('express-session'); // Corrected require
const { OAuth2Client } = require('google-auth-library');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const app = express();

// --- Configuration from Environment Variables ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SESSION_SECRET = process.env.SESSION_SECRET;
const PORT = process.env.PORT || 3000; // Use port from .env or default to 3000

// --- Input Validation & Warnings ---
if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    console.warn('!!! WARNING: GOOGLE_CLIENT_ID is not set or is using the placeholder value in .env file. Google Sign-In will not work.');
}
if (!SESSION_SECRET || SESSION_SECRET === 'replace_this_with_a_very_strong_random_secret_string_xyz789') {
    console.warn('!!! WARNING: SESSION_SECRET is not set or is using the default insecure value in .env file. Please generate a strong secret!');
}

// --- Google Auth Client ---
const googleClient = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
    ? new OAuth2Client(GOOGLE_CLIENT_ID)
    : null;

if (!googleClient) {
    console.error("Google Client initialization failed. Check GOOGLE_CLIENT_ID in .env");
}

// --- Database Setup (Lowdb) ---
const adapter = new JSONFile('db.json');
// Structure: users: { 'googleUserId': { subscriptions: [] } }
const defaultData = { users: {} };
const db = new Low(adapter, defaultData);

// --- Session Configuration ---
app.use(session({
    secret: SESSION_SECRET || 'fallback-insecure-secret-!!-change-me-!!', // Use secret from .env or a fallback WARNING
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use NODE_ENV=production for secure cookies
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // Session expires after 7 days
    }
}));

// --- Middleware ---
app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// --- Favicon Handler (Add this before other routes) ---
app.get('/favicon.ico', (req, res) => res.status(204).send()); // Respond with No Content

// --- Authentication Middleware ---
const isAuthenticated = (req, res, next) => {
    if (req.session?.user) { // Use optional chaining
        return next();
    }
    res.status(401).json({ error: 'Unauthorized: Please log in.' });
};

// --- Helper Function: Calculate Next Due Date ---
function calculateNextDueDate(lastPaidMonthStr, recurrenceMonths, recurrenceDayOfMonth) {
    if (!lastPaidMonthStr || !/^\d{4}-\d{2}$/.test(lastPaidMonthStr) ||
        !recurrenceMonths || recurrenceMonths <= 0 ||
        !recurrenceDayOfMonth || recurrenceDayOfMonth <= 0 || recurrenceDayOfMonth > 31) {
        console.error("Invalid input to calculateNextDueDate:", { lastPaidMonthStr, recurrenceMonths, recurrenceDayOfMonth });
        return null;
    }
    try {
        const [year, month] = lastPaidMonthStr.split('-').map(Number);
        let potentialDueDate = new Date(Date.UTC(year, month - 1, 1)); // month is 0-indexed
        potentialDueDate.setUTCMonth(potentialDueDate.getUTCMonth() + recurrenceMonths);
        let targetYear = potentialDueDate.getUTCFullYear();
        let targetMonth = potentialDueDate.getUTCMonth();
        let daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        let targetDay = Math.min(recurrenceDayOfMonth, daysInTargetMonth);
        potentialDueDate.setUTCDate(targetDay);
        if (isNaN(potentialDueDate.getTime())) throw new Error("Invalid date calculation result"); // Check validity
        const yyyy = potentialDueDate.getUTCFullYear();
        const mm = String(potentialDueDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(potentialDueDate.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    } catch (error) {
        console.error("Error in calculateNextDueDate:", error);
        return null; // Return null on calculation error
    }
}

// --- Helper: Get or Create User Data ---
const getUserData = async (userId) => {
    await db.read();
    db.data.users = db.data.users || {};
    if (!db.data.users[userId]) {
        console.log(`Creating initial data structure for user ${userId}`);
        db.data.users[userId] = { subscriptions: [] }; // Simplified: only subscriptions
        await db.write();
    }
    db.data.users[userId].subscriptions = db.data.users[userId].subscriptions || [];
    return db.data.users[userId];
};

// --- Config API Endpoint ---
app.get('/api/config', (req, res) => {
    if (!googleClient) {
         console.error("Cannot provide Google Client ID to frontend, not configured correctly.");
         return res.status(500).json({ error: "Server configuration error." });
     }
    res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

// --- Authentication API Endpoints ---
app.post('/api/auth/google/callback', async (req, res) => {
    if (!googleClient) return res.status(500).json({ error: "Google Auth not configured." });
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential token.' });
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload?.sub) throw new Error('Invalid token payload');
        const userId = payload.sub;
        await getUserData(userId); // Ensure user exists in DB
        req.session.user = {
            id: userId,
            email: payload.email,
            name: payload.name,
            picture: payload.picture
        };
        console.log(`User logged in: ${payload.name} (${userId})`);
        res.status(200).json({ user: req.session.user });
    } catch (error) { console.error('Token verification failed:', error); res.status(401).json({ error: 'Authentication failed.' }); }
});

app.get('/api/auth/status', async (req, res) => {
     if (req.session?.user) {
         res.status(200).json({ user: req.session.user });
     } else {
         res.status(200).json({ user: null });
     }
});

app.post('/api/auth/logout', (req, res) => {
    if (req.session) {
        const userName = req.session.user?.name || 'User';
        req.session.destroy((err) => {
            if (err) { console.error('Error destroying session:', err); return res.status(500).json({ error: 'Failed to log out.' }); }
            console.log(`${userName} logged out.`);
            res.clearCookie('connect.sid'); // Ensure the session cookie is cleared
            res.status(200).json({ message: 'Logged out successfully.' });
        });
    } else { res.status(200).json({ message: 'No active session.' }); }
});

// --- Subscription API Endpoints ---
app.get('/api/subscriptions', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    try {
        const userData = await getUserData(userId);
        res.json(userData.subscriptions);
    }
    catch (error) { console.error(`Err fetch subs user ${userId}:`, error); res.status(500).json({ error: "Failed to fetch subs." }); }
});

app.post('/api/subscriptions', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    try {
        const userData = await getUserData(userId);
        const { name, lastPaidMonth, recurrenceMonths, recurrenceDayOfMonth } = req.body;
        const months = parseInt(recurrenceMonths); const day = parseInt(recurrenceDayOfMonth);
        if (!name || !lastPaidMonth || !/^\d{4}-\d{2}$/.test(lastPaidMonth) || !months || months <= 0 || !day || day <= 0 || day > 31) { return res.status(400).json({ error: 'Invalid input.' }); }
        const nextDueDate = calculateNextDueDate(lastPaidMonth, months, day);
        if (!nextDueDate) { return res.status(400).json({ error: 'Could not calc next due date.' }); }
        const maxId = userData.subscriptions.reduce((max, sub) => Math.max(max, sub.id || 0), 0);
        const nextId = maxId + 1;
        const newSubscription = { id: nextId, name: name.trim(), lastPaidMonth, recurrenceMonths: months, recurrenceDayOfMonth: day, nextDueDate };
        userData.subscriptions.push(newSubscription); await db.write();
        console.log(`Added sub user ${userId}:`, newSubscription.id); res.status(201).json(newSubscription);
    } catch (error) { console.error(`Err add sub user ${userId}:`, error); res.status(500).json({ error: "Failed add sub." }); }
});

app.put('/api/subscriptions/:id', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id; const idToUpdate = parseInt(req.params.id); const updates = req.body;
    if (isNaN(idToUpdate)) { return res.status(400).json({ error: 'Invalid ID.' }); }
    try {
        const userData = await getUserData(userId); const subIndex = userData.subscriptions.findIndex(sub => sub.id === idToUpdate);
        if (subIndex === -1) { return res.status(404).json({ error: `Sub ID ${idToUpdate} not found.` }); }
        const original = userData.subscriptions[subIndex]; let updated = { ...original }; let recalc = false;
        // Apply updates + validate
        if (updates.hasOwnProperty('name')) { if (typeof updates.name === 'string' && updates.name.trim()) { updated.name = updates.name.trim(); } else { return res.status(400).json({ error: 'Name empty.' }); } }
        if (updates.hasOwnProperty('recurrenceMonths')) { const nm = parseInt(updates.recurrenceMonths); if (!isNaN(nm) && nm > 0) { updated.recurrenceMonths = nm; recalc = true; } else { return res.status(400).json({ error: 'Months > 0.' }); } }
        if (updates.hasOwnProperty('recurrenceDayOfMonth')) { const nd = parseInt(updates.recurrenceDayOfMonth); if (!isNaN(nd) && nd > 0 && nd <= 31) { updated.recurrenceDayOfMonth = nd; recalc = true; } else { return res.status(400).json({ error: 'Day 1-31.' }); } }
        if (updates.hasOwnProperty('lastPaidMonth')) { if (typeof updates.lastPaidMonth === 'string' && /^\d{4}-\d{2}$/.test(updates.lastPaidMonth)) { const [y, m] = updates.lastPaidMonth.split('-').map(Number); if (y > 1900 && m >= 1 && m <= 12) { updated.lastPaidMonth = updates.lastPaidMonth; recalc = true; } else { return res.status(400).json({ error: 'Invalid month/year.' }); } } else { return res.status(400).json({ error: 'Month YYYY-MM.' }); } }
        // Recalc if needed
        if (recalc) { const newNext = calculateNextDueDate(updated.lastPaidMonth, updated.recurrenceMonths, updated.recurrenceDayOfMonth); if (!newNext) return res.status(500).json({ error: 'Err recalc due date.' }); updated.nextDueDate = newNext; }
        userData.subscriptions[subIndex] = updated; await db.write();
        console.log(`Updated sub ${idToUpdate} user ${userId}`); res.status(200).json(updated);
    } catch (error) { console.error(`Err update sub ${idToUpdate} user ${userId}:`, error); res.status(500).json({ error: "Failed update sub." }); }
});

app.delete('/api/subscriptions/:id', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id; const idToDelete = parseInt(req.params.id);
    if (isNaN(idToDelete)) { return res.status(400).json({ error: 'Invalid ID.' }); }
    try {
        const userData = await getUserData(userId); const initialLen = userData.subscriptions.length;
        userData.subscriptions = userData.subscriptions.filter(sub => sub.id !== idToDelete);
        if (userData.subscriptions.length === initialLen) { return res.status(404).json({ error: `Sub ID ${idToDelete} not found.` }); }
        else { await db.write(); console.log(`Deleted sub ${idToDelete} user ${userId}`); res.status(204).send(); }
    } catch (error) { console.error(`Err delete sub ${idToDelete} user ${userId}:`, error); res.status(500).json({ error: "Failed delete sub." }); }
});

// --- Server Start ---
const startServer = async () => {
    try {
        await db.read();
        // Ensure default structure if db file is empty or missing keys
        db.data ||= defaultData;
        db.data.users ||= {};
        await db.write(); // Ensure structure exists on disk
        app.listen(PORT, () => {
            console.log(`Subscription tracker listening at http://localhost:${PORT}`);
            console.log(`Database file: ${path.resolve('db.json')}`);
            if (!googleClient) { console.warn('!!! GOOGLE_CLIENT_ID not configured correctly !!!'); }
            if (!SESSION_SECRET || SESSION_SECRET === 'replace_this_with_a_very_strong_random_secret_string_xyz789') { console.warn('!!! Default/Missing SESSION_SECRET - VERY INSECURE !!!'); }
        });
    } catch (err) { console.error("Failed to init/start server:", err); process.exit(1); }
};

startServer(); // Start the server