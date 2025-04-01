// public/script.js

// --- Global Variables & Constants ---
const API_BASE_URL = '/api';
const TRANSITION_DURATION = 300; // Corresponds to --transition-duration-medium in CSS (in ms)
let activeEditInput = null;
let currentUser = null;
let googleClientId = null; // Will be fetched from backend

// --- DOM Element References (Declare with let, assign inside DOMContentLoaded) ---
let tableBody, loadingMessage, emptyMessage, addBtn, modal, closeModalBtn, addForm, formError, authStatusDiv, userInfoSpan, logoutButton, googleSignInButtonContainer, authLoadingSpan, appContent, loginContainer, initErrorMessage, modalContentElement;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Assign DOM Element References NOW & LOGGING ---
    console.log("DOMContentLoaded fired. Finding elements...");
    tableBody = document.getElementById('subscription-table-body'); console.log("tableBody:", tableBody);
    loadingMessage = document.getElementById('loading-message'); console.log("loadingMessage:", loadingMessage);
    emptyMessage = document.getElementById('empty-message'); console.log("emptyMessage:", emptyMessage);
    addBtn = document.getElementById('add-btn'); console.log("addBtn:", addBtn);
    modal = document.getElementById('add-form-modal'); console.log("modal:", modal);
    // These depend on 'modal' existing, check 'modal' first
    closeModalBtn = modal ? modal.querySelector('.close-btn') : null; console.log("closeModalBtn:", closeModalBtn);
    modalContentElement = modal ? modal.querySelector('.modal-content') : null; console.log("modalContentElement:", modalContentElement);

    addForm = document.getElementById('add-subscription-form'); console.log("addForm:", addForm);
    formError = document.getElementById('form-error'); console.log("formError:", formError);
    authStatusDiv = document.getElementById('auth-status'); console.log("authStatusDiv:", authStatusDiv);
    userInfoSpan = document.getElementById('user-info'); console.log("userInfoSpan:", userInfoSpan);
    logoutButton = document.getElementById('logout-button'); console.log("logoutButton:", logoutButton);
    googleSignInButtonContainer = document.getElementById('google-signin-button-container'); console.log("googleSignInButtonContainer:", googleSignInButtonContainer);
    authLoadingSpan = document.getElementById('auth-loading'); console.log("authLoadingSpan:", authLoadingSpan);
    appContent = document.getElementById('app-content'); console.log("appContent:", appContent);
    loginContainer = document.getElementById('login-container'); console.log("loginContainer:", loginContainer);
    initErrorMessage = document.getElementById('init-error-message'); console.log("initErrorMessage:", initErrorMessage);


    // Check if essential elements were found
    // Added elements that depend on others (closeModalBtn, modalContentElement)
    // Made the list more comprehensive based on usage
    const essentialElements = {
        tableBody, loadingMessage, emptyMessage, addBtn, modal, closeModalBtn,
        addForm, formError, authStatusDiv, userInfoSpan, logoutButton,
        googleSignInButtonContainer, authLoadingSpan, appContent, loginContainer,
        initErrorMessage, modalContentElement
    };
    const missingElements = Object.entries(essentialElements)
                                  .filter(([name, element]) => !element)
                                  .map(([name]) => name);

    if (missingElements.length > 0) {
        const errorMsg = `Fatal Error: Could not find essential UI elements on DOMContentLoaded: ${missingElements.join(', ')}. Check HTML IDs and console logs above.`;
        console.error(errorMsg);
        // Try to display error even if some elements are missing
        const body = document.body;
        if (body) {
             body.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--google-red); background-color: #121212; min-height: 100vh;">${errorMsg}</div>`;
        } else {
            alert(errorMsg); // Fallback if body is not available
        }
        return; // Stop further execution
    }
    console.log("All essential elements found.");

    // Set initial hidden states without transition
    loginContainer.style.transition = 'none';
    appContent.style.transition = 'none';
    modal.style.transition = 'none';
    modalContentElement.style.transition = 'none';
    logoutButton.style.transition = 'none'; // Also disable transition initially
    userInfoSpan.style.transition = 'none'; // Also disable transition initially
    addBtn.style.transition = 'none';      // FAB button

    loginContainer.classList.remove('visible');
    appContent.classList.remove('visible');
    modal.classList.remove('visible');
    logoutButton.classList.remove('visible');
    userInfoSpan.classList.remove('visible');
    // FAB is handled by CSS :not(.visible) on parent

    // Restore transitions after initial setup
    requestAnimationFrame(() => {
        if (loginContainer) loginContainer.style.transition = '';
        if (appContent) appContent.style.transition = '';
        if (modal) modal.style.transition = '';
        if (modalContentElement) modalContentElement.style.transition = '';
        if (logoutButton) logoutButton.style.transition = '';
        if (userInfoSpan) userInfoSpan.style.transition = '';
        if (addBtn) addBtn.style.transition = '';
    });


    loadConfigAndInitialize();
    setupEventListeners();
});

// --- Helper: Show/Hide Animated Element ---
function setElementVisibility(element, isVisible) {
    if (!element) {
        // console.warn("Attempted to set visibility on a null element."); // Already logged during init
        return;
    }
    requestAnimationFrame(() => {
        // Determine default display style (block or flex)
        let defaultDisplay = 'block';
        if (element === loginContainer || element === userInfoSpan || element === modal ) {
            defaultDisplay = 'flex';
        }

        if (isVisible) {
            // Set display before adding class if it was 'none'
             if (getComputedStyle(element).display === 'none') {
                element.style.display = defaultDisplay;
             }
            // Delay adding class slightly might help ensure transition triggers reliably
            setTimeout(() => element.classList.add('visible'), 10);
        } else {
            element.classList.remove('visible');
             // Optionally set display: none after transition completes for layout purposes
             // Note: This might interfere if quickly toggled back on. Opacity: 0 is often sufficient.
             // setTimeout(() => {
             //     if (!element.classList.contains('visible')) {
             //        element.style.display = 'none';
             //     }
             // }, TRANSITION_DURATION + 50); // Add buffer
        }
    });
}


// --- Load Config and Initialize Auth ---
const loadConfigAndInitialize = async () => {
    // Add checks for elements used here
    if(authLoadingSpan) authLoadingSpan.style.display = 'inline';
    if(googleSignInButtonContainer) googleSignInButtonContainer.style.display = 'none';
    if(initErrorMessage) initErrorMessage.style.display = 'none';
    try {
        console.log("Fetching configuration...");
        const response = await fetch(`${API_BASE_URL}/config`);
        if (!response.ok) { throw new Error(`Config fetch failed: ${response.status}`); }
        const config = await response.json();
        googleClientId = config.googleClientId;
        if (!googleClientId) { throw new Error('Google Client ID missing from config.'); }
        console.log("Config received.");
        initializeGoogleSignIn();
        await checkLoginStatus();
    } catch (error) {
        console.error("Initialization failed:", error);
        if(initErrorMessage) {
            initErrorMessage.textContent = `Initialization Error: ${error.message}. Please check configuration and reload.`;
            initErrorMessage.style.display = 'block';
        }
        setElementVisibility(loginContainer, true);
        if(authStatusDiv) authStatusDiv.innerHTML = '<span style="color: var(--google-red);">Init Error</span>';
    } finally {
        if(authLoadingSpan) authLoadingSpan.style.display = 'none';
    }
};

const initializeGoogleSignIn = () => {
     if (window.google?.accounts?.id) {
         console.log("Initializing GSI...");
         try {
             google.accounts.id.initialize({ client_id: googleClientId, callback: handleCredentialResponse });
             if(googleSignInButtonContainer){
                 google.accounts.id.renderButton(googleSignInButtonContainer, { theme: "outline", size: "large", text: "continue_with", shape: "pill", logo_alignment: "left" });
                 console.log("GSI button rendered.");
                 googleSignInButtonContainer.style.display = 'block';
             } else {
                 // Error already logged during init
             }
         } catch (error) {
            console.error("GSI Init Error:", error);
            if(initErrorMessage) { initErrorMessage.textContent = `Google Sign-In Init Error: ${error.message}`; initErrorMessage.style.display = 'block'; }
            if(googleSignInButtonContainer) googleSignInButtonContainer.style.display = 'none';
            if(authStatusDiv) authStatusDiv.innerHTML = '<span style="color: var(--google-red);">GSI Init Error</span>';
        }
     } else {
        console.error("GSI lib not loaded.");
        if(initErrorMessage) { initErrorMessage.textContent = 'Google Sign-In library failed to load. Please check connection or browser extensions.'; initErrorMessage.style.display = 'block'; }
        if(googleSignInButtonContainer) googleSignInButtonContainer.style.display = 'none';
        if(authStatusDiv) authStatusDiv.innerHTML = '<span style="color: var(--google-red);">GSI Load Error</span>';
    }
};

// --- Authentication Functions ---
window.handleCredentialResponse = async (response) => {
    console.log("GSI Response received.");
    try {
        const res = await fetch(`${API_BASE_URL}/auth/google/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: response.credential }) });
        if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || `Server error ${res.status}`); }
        const data = await res.json();
        if (data.user) {
            currentUser = data.user;
            updateUIBasedOnLoginStatus();
            await fetchSubscriptions();
        } else { throw new Error('No user data received.'); }
    } catch (error) {
        console.error("GSI Callback Error:", error);
        alert(`Login failed: ${error.message}`);
        currentUser = null;
        updateUIBasedOnLoginStatus();
    }
};

const checkLoginStatus = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/status`);
        if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
        const data = await res.json();
        currentUser = data.user;
        console.log("Login status:", currentUser ? `Logged in (${currentUser.name})` : "Not logged in");
    } catch (error) {
        console.error("Login status check error:", error);
        currentUser = null;
    }
    finally {
        updateUIBasedOnLoginStatus();
        if (currentUser) {
            await fetchSubscriptions();
        }
    }
};

const handleLogout = async () => {
    if (!confirm("Sign out?")) return;
    try { await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' }); console.log("Logout success."); }
    catch (error) { console.error("Logout error:", error); /* Proceed with frontend logout */ }
    finally {
        currentUser = null;
        if (window.google?.accounts?.id) { google.accounts.id.disableAutoSelect(); }
        updateUIBasedOnLoginStatus();
        clearSubscriptionData();
    }
};

const updateUIBasedOnLoginStatus = () => {
    if (currentUser) {
        if(userInfoSpan){
            userInfoSpan.innerHTML = `<img src="${currentUser.picture || ''}" alt="" onerror="this.style.display='none'"> <span>${currentUser.name || currentUser.email}</span>`;
            setElementVisibility(userInfoSpan, true);
        }
        if(logoutButton) setElementVisibility(logoutButton, true);

        setElementVisibility(loginContainer, false);
        setElementVisibility(appContent, true);

        if(loadingMessage) loadingMessage.style.display = 'block';
        if(emptyMessage) emptyMessage.style.display = 'none';
        if(initErrorMessage) initErrorMessage.style.display = 'none';
    } else {
        if(userInfoSpan) setElementVisibility(userInfoSpan, false);
        if(logoutButton) setElementVisibility(logoutButton, false);

        setElementVisibility(appContent, false);
        setElementVisibility(loginContainer, true);
        clearSubscriptionData();
    }
    if(authLoadingSpan) authLoadingSpan.style.display = 'none';
};

const clearSubscriptionData = () => {
    if(tableBody) tableBody.innerHTML = '';
    if(loadingMessage) loadingMessage.style.display = 'none';
    if(emptyMessage) emptyMessage.style.display = 'none';
};

// --- Core Subscription Functions ---
const fetchSubscriptions = async () => {
    if (!currentUser || !tableBody || !loadingMessage || !emptyMessage) return;
    loadingMessage.style.display = 'block'; emptyMessage.style.display = 'none'; tableBody.innerHTML = ''; activeEditInput = null;
    try {
        const response = await fetch(`${API_BASE_URL}/subscriptions`);
        if (response.status === 401) { handleSessionExpired(); return; }
        if (!response.ok) throw new Error(`Fetch subs failed: ${response.status}`);
        const subscriptions = await response.json();
        loadingMessage.style.display = 'none';
        if (!subscriptions || subscriptions.length === 0) { emptyMessage.style.display = 'block'; }
        else { emptyMessage.style.display = 'none'; renderSubscriptions(subscriptions); }
    } catch (error) { console.error("Fetch subs error:", error); loadingMessage.textContent = 'Error loading subscriptions.'; loadingMessage.style.display = 'block'; emptyMessage.style.display = 'none'; }
};

const renderSubscriptions = (subscriptions) => {
    if(!tableBody) return;
    tableBody.innerHTML = '';
    subscriptions.sort((a, b) => {
         try {
            const dateA = new Date(a.nextDueDate + 'T00:00:00Z').getTime();
            const dateB = new Date(b.nextDueDate + 'T00:00:00Z').getTime();
            if (isNaN(dateA) && isNaN(dateB)) return 0;
            if (isNaN(dateA)) return 1;
            if (isNaN(dateB)) return -1;
            return dateA - dateB;
        } catch (e) { return 0;}
    });

    subscriptions.forEach(sub => {
        const row = document.createElement('tr'); row.dataset.id = sub.id;
        row.appendChild(createTableCell(sub.name, 'name', true));
        row.appendChild(createTableCell(sub.recurrenceMonths, 'recurrenceMonths', true));
        row.appendChild(createTableCell(sub.recurrenceDayOfMonth, 'recurrenceDayOfMonth', true));
        row.appendChild(createTableCell(sub.lastPaidMonth, 'lastPaidMonth', true));
        const timelineCell = document.createElement('td'); timelineCell.classList.add('timeline-cell');
        renderTimeline(timelineCell, sub.lastPaidMonth, sub.nextDueDate); row.appendChild(timelineCell);
        const actionsCell = document.createElement('td'); const deleteButton = document.createElement('button'); deleteButton.textContent = 'Delete'; deleteButton.classList.add('delete-btn', 'button-small'); deleteButton.dataset.id = sub.id; actionsCell.appendChild(deleteButton); row.appendChild(actionsCell);
        tableBody.appendChild(row);
    });
};

const createTableCell = (content, fieldName, isEditable) => { const cell = document.createElement('td'); cell.textContent = content ?? ''; if (isEditable) { cell.classList.add('editable'); cell.dataset.field = fieldName; } return cell; };

const renderTimeline = (cell, lastPaidMonthStr, nextDueDateStr) => {
    cell.innerHTML = ''; if (!lastPaidMonthStr || !nextDueDateStr || !/^\d{4}-\d{2}$/.test(lastPaidMonthStr)) { cell.textContent = 'N/A'; return; }
    const progressBar = document.createElement('progress'); const timelineText = document.createElement('span'); timelineText.classList.add('timeline-text');
    try {
        const [lastYear, lastMonth] = lastPaidMonthStr.split('-').map(Number);
        const startOfPeriod = new Date(Date.UTC(lastYear, lastMonth - 1 + 1, 1));
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const nextDue = new Date(nextDueDateStr + 'T00:00:00Z');
        if (isNaN(startOfPeriod.getTime()) || isNaN(nextDue.getTime())) { throw new Error("Invalid date for timeline"); }
        const msPerDay = 86400000;
        const totalDurationMs = nextDue.getTime() - startOfPeriod.getTime();
        const elapsedMs = today.getTime() - startOfPeriod.getTime();
        const daysRemaining = Math.max(0, Math.ceil((nextDue.getTime() - today.getTime()) / msPerDay));
        let progressValue = 0;
        if (totalDurationMs > 0) { progressValue = Math.max(0, Math.min(1, elapsedMs / totalDurationMs)); }
        else if (today >= startOfPeriod) { progressValue = (today >= nextDue) ? 1 : 0; }
        progressBar.value = progressValue; progressBar.max = 1;
        progressBar.classList.remove('warning', 'danger');
        timelineText.style.color = 'var(--text-color-secondary)';
        if (today >= nextDue) { progressBar.classList.add('danger'); timelineText.textContent = `Due / Overdue`; timelineText.style.color = 'var(--google-red)'; }
        else if (daysRemaining <= 7) { progressBar.classList.add('warning'); timelineText.textContent = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`; timelineText.style.color = 'var(--google-yellow)'; }
        else { timelineText.textContent = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`; }
        cell.appendChild(progressBar); cell.appendChild(timelineText);
    } catch (e) { console.error("Timeline render error:", e, { lastPaidMonthStr, nextDueDateStr }); cell.textContent = "Date Error"; }
};

// --- Event Handlers & Setup ---
const setupEventListeners = () => {
    if(logoutButton) logoutButton.addEventListener('click', handleLogout);

    if(addBtn) {
        addBtn.addEventListener('click', () => {
            if (!currentUser || !modal || !addForm) return;
            addForm.reset();
            if(formError) formError.style.display = 'none';
            const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
            const lastPaidMonthInput = document.getElementById('last-paid-month');
            const recurrenceMonthsInput = document.getElementById('recurrence-months');
            const recurrenceDayInput = document.getElementById('recurrence-day');
            const nameInput = document.getElementById('name');

            if(lastPaidMonthInput) lastPaidMonthInput.value = `${y}-${m}`;
            if(recurrenceMonthsInput) recurrenceMonthsInput.value = '1';
            if(recurrenceDayInput) recurrenceDayInput.value = '1';
            setElementVisibility(modal, true);
            if(nameInput) nameInput.focus();
        });
    }

    if(closeModalBtn) closeModalBtn.addEventListener('click', () => { setElementVisibility(modal, false); });
    if(modal) window.addEventListener('click', (event) => { if (event.target === modal) setElementVisibility(modal, false); });
    if(addForm) addForm.addEventListener('submit', handleAddFormSubmit);
    if(tableBody) tableBody.addEventListener('click', handleTableClick);
};

const handleAddFormSubmit = async (event) => {
    event.preventDefault(); if (!currentUser || !addForm || !formError) return; formError.style.display = 'none';
    const formData = new FormData(addForm); const data = Object.fromEntries(formData.entries());
    const months = parseInt(data.recurrenceMonths); const day = parseInt(data.recurrenceDayOfMonth);
    if (!data.name?.trim() || !data.lastPaidMonth || !/^\d{4}-\d{2}$/.test(data.lastPaidMonth) || !months || months <= 0 || !day || day <= 0 || day > 31) { formError.textContent = 'Please fill all fields correctly (Month: YYYY-MM).'; formError.style.display = 'block'; return; }
    data.recurrenceMonths = months; data.recurrenceDayOfMonth = day;

    const submitButton = addForm.querySelector('button[type="submit"]');
    if(submitButton) { submitButton.disabled = true; submitButton.textContent = 'Adding...'; }

    try {
        const res = await fetch(`${API_BASE_URL}/subscriptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.status === 401) { handleSessionExpired(); return; }
        if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || `Server error ${res.status}`); }
        setElementVisibility(modal, false);
        await fetchSubscriptions();
    } catch (error) { console.error("Add sub error:", error); formError.textContent = `Error: ${error.message}`; formError.style.display = 'block'; }
    finally { if(submitButton) { submitButton.disabled = false; submitButton.textContent = 'Add Item'; } }
};

const handleTableClick = async (event) => {
    if (!currentUser) return; const target = event.target;
    if (target.classList.contains('editable')) { makeCellEditable(target); }
    else if (target.classList.contains('delete-btn')) {
        if (activeEditInput) { saveOrCancelEdit(activeEditInput.td, activeEditInput.input, false); }
        const idToDelete = target.dataset.id;
        const row = target.closest('tr');
        if (!row) return;
        const subName = row?.querySelector('td[data-field="name"]')?.textContent || `ID: ${idToDelete}`;
        if (!confirm(`Delete subscription "${subName}"?`)) return;

        target.disabled = true; target.textContent = 'Deleting...';
        row.classList.add('deleting');

        setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/subscriptions/${idToDelete}`, { method: 'DELETE' });
                if (res.status === 401) { handleSessionExpired(); row.classList.remove('deleting'); target.disabled = false; target.textContent = 'Delete'; return; }
                if (!res.ok && res.status !== 204) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || `Failed delete ${res.status}`); }
                row.remove();
                console.log(`Deleted sub ${idToDelete} user ${currentUser.id}`);
                if (tableBody && tableBody.childElementCount === 0) {
                    if(emptyMessage) emptyMessage.style.display = 'block';
                 }
            } catch (error) {
                console.error("Delete error:", error);
                alert(`Error deleting subscription: ${error.message}`);
                row.classList.remove('deleting');
                target.disabled = false; target.textContent = 'Delete';
            }
        }, TRANSITION_DURATION);
    }
};

// --- Inline Editing Functions ---
const makeCellEditable = (td) => {
    if (activeEditInput && activeEditInput.td !== td) { saveOrCancelEdit(activeEditInput.td, activeEditInput.input, false); }
    if (td.classList.contains('editing')) return;
    const field = td.dataset.field; const originalValue = td.textContent; let inputType = 'text';
    if (field === 'lastPaidMonth') inputType = 'month'; else if (field === 'recurrenceMonths' || field === 'recurrenceDayOfMonth') inputType = 'number';
    const input = document.createElement('input'); input.type = inputType; input.className = 'edit-input'; input.value = originalValue;
    if (inputType === 'number') { input.min = '1'; if (field === 'recurrenceDayOfMonth') input.max = '31'; }
    input.originalValue = originalValue; input.td = td; td.innerHTML = ''; td.appendChild(input); td.classList.add('editing'); input.focus();
    if (inputType === 'text') input.select();
    activeEditInput = { input, td };
    input.addEventListener('blur', handleBlur); input.addEventListener('keydown', handleKeyDown);
};
const handleBlur = (event) => { setTimeout(() => { if (document.activeElement !== event.target && activeEditInput && event.target === activeEditInput.input) { saveOrCancelEdit(activeEditInput.td, activeEditInput.input); } }, 150); };
const handleKeyDown = (event) => { const input = event.target; const td = input.td; if (event.key === 'Enter') { event.preventDefault(); saveOrCancelEdit(td, input, true); } else if (event.key === 'Escape') { event.preventDefault(); saveOrCancelEdit(td, input, false); } };
const saveOrCancelEdit = async (td, input, forceSave = null) => {
     const currentActive = activeEditInput;
    if (input) { input.removeEventListener('blur', handleBlur); input.removeEventListener('keydown', handleKeyDown); }
    if (currentActive && currentActive.input === input) { activeEditInput = null; }
    td.classList.remove('editing');

    if (!currentUser || !input || !td) { if (td && input?.originalValue) td.textContent = input.originalValue; return; };
    const newValue = input.value.trim(); const originalValue = input.originalValue; const field = td.dataset.field; const row = td.closest('tr'); const id = row?.dataset.id;
    if (!row || !id) { console.error("Missing row/id for edit."); td.textContent = originalValue; return; }

    let shouldSave = forceSave === true || (forceSave === null && newValue !== originalValue && newValue !== '');

    if (shouldSave) {
        if (field === 'name' && newValue === '') { alert('Name cannot be empty.'); shouldSave = false; }
        else if (field === 'lastPaidMonth' && !/^\d{4}-\d{2}$/.test(newValue)) { alert('Invalid Month format. Use YYYY-MM.'); shouldSave = false; }
        else if (field === 'recurrenceMonths' && (isNaN(parseInt(newValue)) || parseInt(newValue) <= 0)) { alert('Recurrence Months must be a number greater than 0.'); shouldSave = false; }
        else if (field === 'recurrenceDayOfMonth' && (isNaN(parseInt(newValue)) || parseInt(newValue) <= 0 || parseInt(newValue) > 31)) { alert('Recurrence Day must be a number between 1 and 31.'); shouldSave = false; }
    }

    if (shouldSave && id) {
        td.textContent = 'Saving...';
        try {
            const updateData = { [field]: newValue };
            const response = await fetch(`${API_BASE_URL}/subscriptions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData) });
            if (response.status === 401) { handleSessionExpired(); return; }
            if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `Server error ${response.status}`); }
            const updatedSub = await response.json();
            // Update all relevant cells directly
            const nameCell = row.querySelector(`td[data-field="name"]`);
            const monthsCell = row.querySelector(`td[data-field="recurrenceMonths"]`);
            const dayCell = row.querySelector(`td[data-field="recurrenceDayOfMonth"]`);
            const lastPaidCell = row.querySelector(`td[data-field="lastPaidMonth"]`);
            const timelineCell = row.querySelector('.timeline-cell');

            if(nameCell) nameCell.textContent = updatedSub.name;
            if(monthsCell) monthsCell.textContent = updatedSub.recurrenceMonths;
            if(dayCell) dayCell.textContent = updatedSub.recurrenceDayOfMonth;
            if(lastPaidCell) lastPaidCell.textContent = updatedSub.lastPaidMonth;
            if (timelineCell) renderTimeline(timelineCell, updatedSub.lastPaidMonth, updatedSub.nextDueDate);

            td.textContent = updatedSub[field] ?? originalValue;

        } catch (error) {
            console.error(`Update error ID ${id}:`, error);
            alert(`Update failed: ${error.message}`);
            td.textContent = originalValue;
        }
    } else {
        td.textContent = originalValue;
    }
}; // End of saveOrCancelEdit

// --- Utility / Helper Functions ---
const handleSessionExpired = () => {
    console.warn("Session expired or invalid.");
    alert("Your session has expired. Please sign in again.");
    currentUser = null;
    updateUIBasedOnLoginStatus();
    clearSubscriptionData();
};