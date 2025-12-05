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
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connected to server');
        updateConnectionStatus(true);
        addLog('✅ התחבר לשרת בהצלחה');
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
    const loadingEl = document.getElementById('groupsLoading');
    const listEl = document.getElementById('groupsList');

    loadingEl.style.display = 'flex';
    listEl.style.display = 'none';

    try {
        const endpoint = forceRefresh ? '/api/groups/refresh' : '/api/groups';
        const response = forceRefresh
            ? await fetch(endpoint, { method: 'POST' })
            : await fetch(endpoint);

        if (!response.ok) {
            throw new Error('Failed to load groups');
        }

        const data = await response.json();
        groups = forceRefresh ? data.groups : data;

        renderGroups();
        addLog(`✅ נטענו ${groups.length} קבוצות`);
    } catch (error) {
        console.error('Failed to load groups:', error);
        addLog('❌ שגיאה בטעינת קבוצות', 'error');
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-muted);">הבוט עדיין לא מוכן. המתן לחיבור...</p>';
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

    // Delay
    document.getElementById('delayMs').value = config.delayMs || 2000;
}

// ============ Rendering ============
function renderGroups() {
    const listEl = document.getElementById('groupsList');

    if (!groups || groups.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-muted);">לא נמצאו קבוצות</p>';
        return;
    }

    listEl.innerHTML = groups.map(group => `
        <div class="group-item ${group.isSelected ? 'selected' : ''}" data-group-id="${group.id}">
            <input type="checkbox" 
                   class="group-checkbox" 
                   ${group.isSelected ? 'checked' : ''} 
                   onchange="toggleGroup('${group.id}')">
            <span class="group-name">${group.name}</span>
        </div>
    `).join('');
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

    const confirmCheckbox = document.getElementById('requireConfirmation');
    const waitlistCheckbox = document.getElementById('addToWaitlist');
    const selfTestCheckbox = document.getElementById('selfTestMode');

    const updatedConfig = {
        ...config,
        replyMode,
        delayMs,
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
    // Ready status
    const readyEl = document.getElementById('botReady');
    if (status.isReady) {
        readyEl.textContent = '✅ מחובר ופעיל';
        readyEl.style.color = 'var(--success)';
    } else {
        readyEl.textContent = '⏳ לא מחובר';
        readyEl.style.color = 'var(--warning)';
    }

    // Auth status
    const authEl = document.getElementById('botAuth');
    if (status.isAuthenticated) {
        authEl.textContent = '✅ מאומת';
        authEl.style.color = 'var(--success)';
    } else {
        authEl.textContent = '❌ לא מאומת';
        authEl.style.color = 'var(--danger)';
    }

    // Connected clients
    document.getElementById('connectedClients').textContent = status.connectedClients || 0;

    // Hide QR code if ready
    if (status.isReady || status.isAuthenticated) {
        document.getElementById('qrCard').style.display = 'none';
    }
}

function displayQRCode(qrData) {
    const qrCard = document.getElementById('qrCard');
    const qrContainer = document.getElementById('qrcode');

    qrCard.style.display = 'block';
    qrContainer.innerHTML = '';

    QRCode.toCanvas(qrData, { width: 256, margin: 2 }, (error, canvas) => {
        if (error) {
            console.error('QR Code generation failed:', error);
            qrContainer.innerHTML = '<p style="color: var(--danger);">שגיאה ביצירת QR code</p>';
            return;
        }

        qrContainer.appendChild(canvas);
    });
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
