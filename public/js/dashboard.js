// ============ Global State ============
let socket;
let config = {};
let groups = [];
let members = [];
let membersChanged = false; // track if members were modified

// ============ Initialization ============
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupNavigation();
    setupEventListeners();
    loadInitialData();
});

// ============ Socket.IO ============
function initializeSocket() {
    console.log('🔌 Initializing socket connection...');
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connected to server');
        console.log('📡 Socket ID:', socket.id);
        updateConnectionStatus(true);
        addLog('✅ התחבר לשרת בהצלחה');
    });

    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        addLog('❌ שגיאת חיבור: ' + error.message, 'error');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        updateConnectionStatus(false);
        addLog('❌ התנתק מהשרת');
    });

    socket.on('status-update', (status) => {
        console.log('📊 Status update:', status);
        updateBotStatus(status);
    });

    socket.on('qr-code', (qr) => {
        console.log('📱 QR code received');
        displayQRCode(qr);
        addLog('📱 QR code נוצר - סרוק להתחברות');
    });

    socket.on('config-updated', (newConfig) => {
        console.log('⚙️ Config updated:', newConfig);
        config = newConfig;

        // עדכון רשימת החברים אם השתנתה
        if (newConfig.membersToAdd) {
            members = newConfig.membersToAdd;
            if (document.getElementById('membersPage').classList.contains('active')) {
                renderMembers();
            }
        }

        if (document.getElementById('settingsPage').classList.contains('active')) {
            loadSettings();
        }
        addLog('⚙️ ההגדרות עודכנו');
    });

    socket.on('members-updated', (data) => {
        console.log('🏃 Members updated:', data);
        members = data.members;
        if (document.getElementById('membersPage').classList.contains('active')) {
            renderMembers();
        }
        addLog('🏃 רשימת השחקנים עודכנה');
    });

    socket.on('message-received', (data) => {
        addLog(`📨 התקבלה הודעה מ-${data.group}`);
    });

    socket.on('message-sent', (data) => {
        if (data.success) {
            addLog(`✅ נשלחה תגובה ל-${data.group}`);
        }
    });

    socket.on('error', (data) => {
        addLog(`❌ שגיאה: ${data.message}`, 'error');
    });

    // התקדמות טעינה
    socket.on('loading-progress', (data) => {
        console.log(`⏳ Loading: ${data.percent}%`);
        updateLoadingProgress(data.percent, data.message);
    });

    // לוג מהשרת
    socket.on('log', (data) => {
        if (data.message) {
            addLog(`📡 ${data.message}`);
        }
    });
}

function updateLoadingProgress(percent, message) {
    const readyEl = document.getElementById('botReady');
    if (readyEl && percent < 100) {
        readyEl.textContent = `${percent}%`;
        readyEl.style.color = '#f59e0b';
    }
}

// ============ Navigation ============
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);

            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function switchPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(`${pageName}Page`);
    if (targetPage) {
        targetPage.classList.add('active');

        // Load page-specific data
        switch (pageName) {
            case 'groups':
                loadGroups();
                break;
            case 'members':
                loadMembers();
                break;
            case 'settings':
                loadSettings();
                break;
        }
    }
}

// ============ Event Listeners ============
function setupEventListeners() {
    // Groups
    document.getElementById('refreshGroupsBtn').addEventListener('click', () => {
        loadGroups(true);
    });

    // Members
    document.getElementById('addMemberBtn').addEventListener('click', addMember);
    document.getElementById('saveMembersBtn').addEventListener('click', () => {
        if (membersChanged) {
            saveMembersToServer();
        } else {
            addLog('ℹ️ אין שינויים לשמירה');
        }
    });

    // Settings
    document.getElementById('addKeywordBtn').addEventListener('click', addKeyword);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    document.getElementById('newKeyword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addKeyword();
        }
    });
}

// ============ Data Loading ============
async function loadInitialData() {
    try {
        const response = await fetch('/api/config');
        config = await response.json();
        console.log('Config loaded:', config);
    } catch (error) {
        console.error('Failed to load config:', error);
        addLog('❌ שגיאה בטעינת הגדרות', 'error');
    }
}

async function loadGroups(forceRefresh = false) {
    console.log('📋 loadGroups called, forceRefresh:', forceRefresh);
    const loadingEl = document.getElementById('groupsLoading');
    const listEl = document.getElementById('groupsList');

    loadingEl.style.display = 'flex';
    listEl.style.display = 'none';

    try {
        const endpoint = forceRefresh ? '/api/groups/refresh' : '/api/groups';
        console.log('📡 Fetching from:', endpoint);

        const response = forceRefresh
            ? await fetch(endpoint, { method: 'POST' })
            : await fetch(endpoint);

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
            throw new Error('Failed to load groups');
        }

        const data = await response.json();
        groups = forceRefresh ? data.groups : data;

        console.log('📊 Loaded groups:', groups.length, groups);

        renderGroups();
        addLog(`✅ נטענו ${groups.length} קבוצות`);
    } catch (error) {
        console.error('Failed to load groups:', error);
        // Don't show error if bot is not ready yet - this is expected
        listEl.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📱</div>
                <p style="color: var(--text-muted); margin-bottom: 0.5rem;">הבוט עדיין לא מחובר ל-WhatsApp</p>
                <p style="color: var(--text-muted); font-size: 0.9rem;">סרוק את ה-QR code בדשבורד כדי להתחבר</p>
            </div>
        `;
    } finally {
        loadingEl.style.display = 'none';
        listEl.style.display = 'flex';
    }
}

async function loadMembers() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        members = data.membersToAdd || [];
        renderMembers();
    } catch (error) {
        console.error('Failed to load members:', error);
        addLog('❌ שגיאה בטעינת שחקנים', 'error');
    }
}

function loadSettings() {
    // Keywords
    renderKeywords();

    // Reply mode
    document.getElementById('replyMode').checked = config.replyMode || false;

    // Confirmation
    const confirmCheckbox = document.getElementById('requireConfirmation');
    if (confirmCheckbox) {
        confirmCheckbox.checked = config.requireConfirmation || false;
    }

    // Waitlist
    const waitlistCheckbox = document.getElementById('addToWaitlist');
    if (waitlistCheckbox) {
        waitlistCheckbox.checked = config.addToWaitlist !== false; // default true
    }

    // Self test mode
    const selfTestCheckbox = document.getElementById('selfTestMode');
    if (selfTestCheckbox) {
        selfTestCheckbox.checked = config.selfTestMode || false;
    }

    // Delay - טעינת ערך ה-ms לפני שליחת הודעה
    const delayInput = document.getElementById('delayMs');
    if (delayInput) {
        delayInput.value = config.delayMs || 2000;
    }

    // Groups Load Timeout
    const timeoutInput = document.getElementById('groupsLoadTimeout');
    if (timeoutInput) {
        timeoutInput.value = config.groupsLoadTimeout || 60;
    }
}

// ============ Rendering ============
function renderGroups() {
    const listEl = document.getElementById('groupsList');

    if (!groups || groups.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-muted);">לא נמצאו קבוצות</p>';
        return;
    }

    // הפרד לנבחרות ולא נבחרות
    const selectedGroups = groups.filter(g => g.isSelected);
    const unselectedGroups = groups.filter(g => !g.isSelected);

    let html = '';

    // הצג קבוצות נבחרות קודם (עם כותרת)
    if (selectedGroups.length > 0) {
        html += `<div style="width: 100%; margin-bottom: 0.5rem;">
            <span style="color: #22c55e; font-weight: 600; font-size: 0.9rem;">⭐ קבוצות פעילות (${selectedGroups.length})</span>
        </div>`;
        html += selectedGroups.map(group => renderGroupItem(group)).join('');
    }

    // הצג קבוצות לא נבחרות (עם כותרת)
    if (unselectedGroups.length > 0) {
        html += `<div style="width: 100%; margin: 1rem 0 0.5rem 0; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="color: #94a3b8; font-weight: 600; font-size: 0.9rem;">📋 קבוצות אחרונות (${unselectedGroups.length})</span>
        </div>`;
        html += unselectedGroups.map(group => renderGroupItem(group)).join('');
    }

    listEl.innerHTML = html;
}

function renderGroupItem(group) {
    return `
        <div class="group-item ${group.isSelected ? 'selected' : ''}" data-group-id="${group.id}">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                <input type="checkbox" 
                       class="group-checkbox" 
                       ${group.isSelected ? 'checked' : ''} 
                       onchange="toggleGroup('${group.id}')">
                <span class="group-name">${group.name || 'קבוצה ללא שם'}</span>
                ${group.isSelected ? '<span style="color: #22c55e; font-size: 0.8rem;">✓ פעיל</span>' : ''}
            </div>
            ${group.isSelected ? `
                <button class="btn btn-secondary btn-sm" onclick="manageGroupMembers('${group.id}', '${(group.name || '').replace(/'/g, "\\'")}')"
                        style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
                    👥 שחקנים
                </button>
            ` : ''}
        </div>
    `;
}

function renderMembers() {
    const listEl = document.getElementById('membersList');

    if (!members || members.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-muted);">לא נוספו שחקנים. לחץ על "הוסף שחקן" כדי להתחיל.</p>';
        return;
    }

    listEl.innerHTML = members.map((member, index) => `
        <div class="member-item">
            <div class="member-order">${index + 1}</div>
            <input type="text" 
                   class="member-name" 
                   value="${member}" 
                   onchange="updateMemberName(${index}, this.value)">
            <div class="member-actions">
                ${index > 0 ? `<button class="btn btn-icon btn-secondary" onclick="moveMember(${index}, -1)">↑</button>` : ''}
                ${index < members.length - 1 ? `<button class="btn btn-icon btn-secondary" onclick="moveMember(${index}, 1)">↓</button>` : ''}
                <button class="btn btn-icon btn-danger" onclick="removeMember(${index})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderKeywords() {
    const listEl = document.getElementById('keywordsList');
    const keywords = config.keywords || [];

    if (keywords.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-muted);">לא הוגדרו מילות מפתח</p>';
        return;
    }

    listEl.innerHTML = keywords.map((keyword, index) => `
        <span class="keyword-tag">
            ${keyword}
            <button class="keyword-remove" onclick="removeKeyword(${index})">×</button>
        </span>
    `).join('');
}

// ============ Group Management ============
async function toggleGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    group.isSelected = !group.isSelected;

    const selectedGroups = groups
        .filter(g => g.isSelected)
        .map(g => g.id);

    try {
        const response = await fetch('/api/groups/selected', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedGroups })
        });

        if (!response.ok) throw new Error('Failed to update groups');

        renderGroups();
        addLog(`✅ קבוצה "${group.name}" ${group.isSelected ? 'נוספה' : 'הוסרה'}`);
    } catch (error) {
        console.error('Failed to toggle group:', error);
        addLog('❌ שגיאה בעדכון קבוצה', 'error');
        group.isSelected = !group.isSelected; // Revert
    }
}

// ============ Member Management ============
function addMember() {
    members.push('שחקן חדש');
    membersChanged = true;
    renderMembers();
    updateSaveButtonState();
}

function removeMember(index) {
    if (confirm('האם אתה בטוח שברצונך להסיר את השחקן הזה?')) {
        members.splice(index, 1);
        membersChanged = true;
        renderMembers();
        updateSaveButtonState();
    }
}

function updateMemberName(index, newName) {
    members[index] = newName;
    membersChanged = true;
    updateSaveButtonState();
}

function moveMember(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= members.length) return;

    [members[index], members[newIndex]] = [members[newIndex], members[index]];
    membersChanged = true;
    renderMembers();
    updateSaveButtonState();
}

async function saveMembersToServer() {
    try {
        const response = await fetch('/api/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members })
        });

        if (!response.ok) throw new Error('Failed to save members');

        // עדכון ה-config המקומי
        config.membersToAdd = members;
        membersChanged = false;

        renderMembers();
        updateSaveButtonState();
        addLog('✅ רשימת השחקנים נשמרה בהצלחה');
    } catch (error) {
        console.error('Failed to save members:', error);
        addLog('❌ שגיאה בשמירת שחקנים', 'error');
    }
}

function updateSaveButtonState() {
    const btn = document.getElementById('saveMembersBtn');
    if (!btn) return;

    if (membersChanged) {
        btn.style.opacity = '1';
        btn.innerHTML = '<span>💾</span> שמור *';
    } else {
        btn.style.opacity = '0.6';
        btn.innerHTML = '<span>💾</span> שמור';
    }
}

// ============ Settings Management ============
function addKeyword() {
    const input = document.getElementById('newKeyword');
    const keyword = input.value.trim();

    if (!keyword) return;

    if (!config.keywords) config.keywords = [];

    if (config.keywords.includes(keyword)) {
        alert('מילת המפתח כבר קיימת');
        return;
    }

    config.keywords.push(keyword);
    input.value = '';
    renderKeywords();
}

function removeKeyword(index) {
    if (!config.keywords) return;
    config.keywords.splice(index, 1);
    renderKeywords();
}

async function saveSettings() {
    const replyMode = document.getElementById('replyMode').checked;
    const delayMs = parseInt(document.getElementById('delayMs').value);
    
    // בדיקה אם האלמנט קיים לפני ניסיון לקרוא אותו
    const groupsLoadTimeoutInput = document.getElementById('groupsLoadTimeout');
    const groupsLoadTimeout = groupsLoadTimeoutInput ? parseInt(groupsLoadTimeoutInput.value) : (config.groupsLoadTimeout || 60);

    const confirmCheckbox = document.getElementById('requireConfirmation');
    const waitlistCheckbox = document.getElementById('addToWaitlist');
    const selfTestCheckbox = document.getElementById('selfTestMode');

    const updatedConfig = {
        ...config,
        replyMode,
        delayMs,
        groupsLoadTimeout,
        selfTestMode: selfTestCheckbox ? selfTestCheckbox.checked : false,
        requireConfirmation: confirmCheckbox ? confirmCheckbox.checked : false,
        addToWaitlist: waitlistCheckbox ? waitlistCheckbox.checked : true
    };

    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedConfig)
        });

        if (!response.ok) throw new Error('Failed to save settings');

        const data = await response.json();
        config = data.config;

        addLog('✅ ההגדרות נשמרו בהצלחה');

        // Show success feedback
        const btn = document.getElementById('saveSettingsBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ נשמר!';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    } catch (error) {
        console.error('Failed to save settings:', error);
        addLog('❌ שגיאה בשמירת הגדרות', 'error');
    }
}

// ============ Status Updates ============
function updateConnectionStatus(isConnected) {
    const statusDot = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');

    if (isConnected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'מחובר';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'מנותק';
    }
}

function updateBotStatus(status) {
    // Ready status - בפורמט קצר ל-Quick Stats
    const readyEl = document.getElementById('botReady');
    if (status.isReady) {
        readyEl.textContent = '✅';
        readyEl.style.color = '#22c55e';
    } else {
        readyEl.textContent = '⏳';
        readyEl.style.color = '#f59e0b';
    }

    // Auth status - בפורמט קצר
    const authEl = document.getElementById('botAuth');
    if (status.isAuthenticated) {
        authEl.textContent = '✅';
        authEl.style.color = '#22c55e';
    } else {
        authEl.textContent = '❌';
        authEl.style.color = '#ef4444';
    }

    // Connected clients
    document.getElementById('connectedClients').textContent = status.connectedClients || 0;

    // Hide QR code if ready
    if (status.isReady || status.isAuthenticated) {
        document.getElementById('qrCard').style.display = 'none';
    }
}

// ============ Group Member Management ============
let currentGroupId = null;
let currentGroupName = null;
let currentGroupMembers = [];
let groupMembersChanged = false;

async function manageGroupMembers(groupId, groupName) {
    currentGroupId = groupId;
    currentGroupName = groupName;
    groupMembersChanged = false;

    // Load current members for this group
    try {
        const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`);
        const data = await response.json();

        currentGroupMembers = data.members || [...config.membersToAdd]; // Copy global list if no specific list

        // Show modal
        showGroupMembersModal(groupName, data.useGlobal);
    } catch (error) {
        console.error('Failed to load group members:', error);
        addLog('❌ שגיאה בטעינת רשימת שחקנים לקבוצה', 'error');
    }
}

function showGroupMembersModal(groupName, useGlobal) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('groupMembersModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'groupMembersModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const globalBadge = useGlobal ? '<span style="color: var(--warning); font-size: 0.9rem;">📋 משתמש ברשימה גלובלית</span>' : '';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>👥 ניהול שחקנים - ${groupName}</h3>
                <button class="modal-close" onclick="closeGroupMembersModal()">×</button>
            </div>
            <div class="modal-body">
                ${globalBadge}
                <div style="margin: 1rem 0;">
                    <button class="btn btn-secondary" onclick="useGlobalList()" style="width: 100%;">
                        🌐 השתמש ברשימה גלובלית
                    </button>
                </div>
                <div style="margin: 1rem 0;">
                    <button class="btn btn-primary" id="addGroupMemberBtn" onclick="addGroupMember()">
                        ➕ הוסף שחקן
                    </button>
                </div>
                <div id="groupMembersList" class="members-list"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeGroupMembersModal()">ביטול</button>
                <button class="btn btn-primary" onclick="saveGroupMembers()">💾 שמור</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    renderGroupMembers();
}

function closeGroupMembersModal() {
    const modal = document.getElementById('groupMembersModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentGroupId = null;
    currentGroupName = null;
    currentGroupMembers = [];
    groupMembersChanged = false;
}

function renderGroupMembers() {
    const listEl = document.getElementById('groupMembersList');
    if (!listEl) return;

    if (!currentGroupMembers || currentGroupMembers.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-muted);">לא נוספו שחקנים. לחץ על "הוסף שחקן" כדי להתחיל.</p>';
        return;
    }

    listEl.innerHTML = currentGroupMembers.map((member, index) => `
        <div class="member-item">
            <div class="member-order">${index + 1}</div>
            <input type="text" 
                   class="member-name" 
                   value="${member}" 
                   onchange="updateGroupMemberName(${index}, this.value)">
            <div class="member-actions">
                <button class="btn btn-icon btn-danger" onclick="removeGroupMember(${index})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function addGroupMember() {
    currentGroupMembers.push('שחקן חדש');
    groupMembersChanged = true;
    renderGroupMembers();
}

function removeGroupMember(index) {
    if (confirm('האם אתה בטוח שברצונך להסיר את השחקן הזה?')) {
        currentGroupMembers.splice(index, 1);
        groupMembersChanged = true;
        renderGroupMembers();
    }
}

function updateGroupMemberName(index, newName) {
    currentGroupMembers[index] = newName;
    groupMembersChanged = true;
}

async function saveGroupMembers() {
    if (!currentGroupId) return;

    try {
        const response = await fetch(`/api/groups/${encodeURIComponent(currentGroupId)}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members: currentGroupMembers })
        });

        if (!response.ok) throw new Error('Failed to save group members');

        addLog(`✅ רשימת השחקנים נשמרה עבור ${currentGroupName}`);
        closeGroupMembersModal();
    } catch (error) {
        console.error('Failed to save group members:', error);
        addLog('❌ שגיאה בשמירת רשימת שחקנים לקבוצה', 'error');
    }
}

async function useGlobalList() {
    if (!currentGroupId) return;

    if (!confirm('האם אתה בטוח שברצונך להשתמש ברשימה הגלובלית? רשימה ספציפית זו תימחק.')) {
        return;
    }

    try {
        const response = await fetch(`/api/groups/${encodeURIComponent(currentGroupId)}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members: null })
        });

        if (!response.ok) throw new Error('Failed to reset to global list');

        addLog(`✅ ${currentGroupName} משתמש כעת ברשימה הגלובלית`);
        closeGroupMembersModal();
    } catch (error) {
        console.error('Failed to reset to global list:', error);
        addLog('❌ שגיאה באיפוס לרשימה גלובלית', 'error');
    }
}

// ============ Activity Log ============
function addLog(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    const time = new Date().toLocaleTimeString('he-IL');

    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    if (type === 'error') {
        logItem.style.borderRightColor = 'var(--danger)';
    } else if (type === 'success') {
        logItem.style.borderRightColor = 'var(--success)';
    }

    logItem.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;

    logContainer.insertBefore(logItem, logContainer.firstChild);

    // Keep only last 50 logs
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// Make functions globally accessible
window.toggleGroup = toggleGroup;
window.removeMember = removeMember;
window.updateMemberName = updateMemberName;
window.moveMember = moveMember;
window.removeKeyword = removeKeyword;
window.manageGroupMembers = manageGroupMembers;
window.closeGroupMembersModal = closeGroupMembersModal;
window.saveGroupMembers = saveGroupMembers;
window.useGlobalList = useGlobalList;
window.addGroupMember = addGroupMember;
window.removeGroupMember = removeGroupMember;
window.updateGroupMemberName = updateGroupMemberName;
window.logoutWhatsApp = logoutWhatsApp;
window.refreshQR = refreshQR;

// ============ WhatsApp Connection Management ============
async function logoutWhatsApp() {
    if (!confirm('האם אתה בטוח שברצונך להתנתק? תצטרך לסרוק QR code מחדש.')) {
        return;
    }

    try {
        addLog('🔄 מנתק מ-WhatsApp...');
        const response = await fetch('/api/logout', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            addLog('✅ התנתקות הצליחה! ממתין ל-QR code חדש...', 'success');
            document.getElementById('qrCard').style.display = 'block';
            document.getElementById('qrInstructions').textContent = 'מחכה ל-QR code...';
        } else {
            throw new Error(data.error || 'Logout failed');
        }
    } catch (error) {
        console.error('Logout failed:', error);
        addLog('❌ שגיאה בהתנתקות: ' + error.message, 'error');
    }
}

async function refreshQR() {
    try {
        addLog('🔄 מבקש QR code חדש...');
        document.getElementById('qrInstructions').textContent = 'מחכה ל-QR code...';
        document.getElementById('qrcode').innerHTML = '';

        const response = await fetch('/api/request-qr', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            addLog('✅ בקשה נשלחה. QR code יופיע בקרוב...', 'success');
        } else {
            addLog('ℹ️ ' + (data.message || 'כבר מחובר או ממתין'), 'info');
        }
    } catch (error) {
        console.error('QR refresh failed:', error);
        addLog('❌ שגיאה: ' + error.message, 'error');
    }
}

// ============ QR Code Display ============
function displayQRCode(qr) {
    console.log('📱 Displaying QR code');
    const qrElement = document.getElementById('qrcode');
    const qrCard = document.getElementById('qrCard');

    // Show QR card
    qrCard.style.display = 'block';

    // Clear previous QR code
    qrElement.innerHTML = '';

    // Generate new QR code
    try {
        QRCode.toCanvas(qr, { width: 300, margin: 2 }, (error, canvas) => {
            if (error) {
                console.error('QR generation error:', error);
                qrElement.innerHTML = '<p style="color: var(--danger);">שגיאה ביצירת QR code</p>';
                return;
            }
            qrElement.innerHTML = '';
            qrElement.appendChild(canvas);
        });
    } catch (error) {
        console.error('QR code error:', error);
        // Fallback: create a simple div with the QR string
        qrElement.innerHTML = `<div style="padding: 1rem; background: white; color: black; word-break: break-all; font-size: 0.7rem;">${qr}</div>`;
    }
}


