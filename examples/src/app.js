// CaseHub Pages Examples Gallery Application
let samplesData = null;
let currentSample = null;
let currentSite = null;
let suppressHashChange = false;
let galleryThemeMode = 'dark';

// Strip TypeScript syntax for companion script execution
function stripTs(src) {
    return src
        .replace(/^import\s+type\s+.*?;\s*$/gm, '')
        .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];\s*$/gm, '')
        .replace(/^export\s+/gm, '')
        .replace(/\bas\s+\w+(?:<[^>]*>)?/g, '')
        .replace(/:\s*(?:readonly\s+)?(?:[A-Z]\w*(?:<[^>]*>)?(?:\[\])?(?:\s*\|\s*\w+(?:<[^>]*>)?)*)/g, '')
        .replace(/<[A-Z]\w*(?:,\s*[A-Z]\w*)*>/g, '');
}

// DOM Elements
const categoriesNav = document.getElementById('categories-nav');
const searchInput = document.getElementById('search');
const welcomeScreen = document.getElementById('welcome-screen');
const sampleContainer = document.getElementById('sample-container');
const sampleTarget = document.getElementById('sample-target');
const currentSampleName = document.getElementById('current-sample-name');
const sampleCount = document.getElementById('sample-count');
const statsContainer = document.getElementById('stats');
const openNewWindowBtn = document.getElementById('open-new-window');
const reloadSampleBtn = document.getElementById('reload-sample');
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const codeSidebar = document.getElementById('code-sidebar');
const codeToggleBtn = document.getElementById('code-toggle');
const sourceCodeElement = document.getElementById('source-code');
const galleryTabs = document.getElementById('gallery-tabs');
const serverStatus = document.getElementById('server-status');

// Tab state
let activeTab = 'client';
let loadingPath = null;

// Tab switching
function setActiveTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.gallery-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderCategories();
    renderStats();
    updateSampleCount();
    if (tab === 'server') {
        checkServerHealth();
    } else {
        removeBanner();
    }
}

const SERVER_URL = 'http://localhost:8090';

function checkServerHealth() {
    fetch(`${SERVER_URL}/api/demo/health`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(() => {
            serverStatus.className = 'server-status connected';
            removeBanner();
        })
        .catch(() => {
            serverStatus.className = 'server-status disconnected';
            showBanner();
        });
}

function showBanner() {
    removeBanner();
    const banner = document.createElement('div');
    banner.className = 'server-banner';
    banner.id = 'server-banner';
    banner.innerHTML = 'Server not running — start with <code>./start-server.sh</code> in <code>examples/</code>';
    categoriesNav.parentElement.insertBefore(banner, categoriesNav);
}

function removeBanner() {
    document.getElementById('server-banner')?.remove();
}

function updateSampleCount() {
    const filtered = samplesData.categories.filter(c =>
        activeTab === 'server' ? c.requiresServer === true : !c.requiresServer
    );
    const count = filtered.reduce((sum, c) => sum + c.samples.length, 0);
    sampleCount.textContent = `${count} samples`;
}

// Load samples.json
async function loadSamples() {
    try {
        const response = await fetch('samples.json');
        samplesData = await response.json();
        initializeApp();
    } catch (error) {
        console.error('Error loading samples:', error);
        categoriesNav.innerHTML = '<div style="padding: 20px; color: red;">Error loading samples.json</div>';
    }
}

// Initialize the application
function initializeApp() {
    renderCategories();
    renderStats();
    updateSampleCount();
    setupEventListeners();

    // Restore sample from hash or sessionStorage (loadSite overwrites the hash on load)
    let restored = false;
    const hash = window.location.hash.slice(1);
    if (hash) {
        restored = tryRestoreFromHash(hash);
    }
    if (!restored) {
        try {
            const saved = sessionStorage.getItem('pages-gallery-sample');
            if (saved) restored = tryRestoreFromHash(saved);
        } catch { /* private browsing */ }
    }
}

function tryRestoreFromHash(hash) {
    if (hash.startsWith('server/')) {
        setActiveTab('server');
        const rest = hash.slice(7);
        const [category, samplePath] = rest.split('/');
        if (category && samplePath) { loadSampleFromHash(category, samplePath); return true; }
    } else if (hash.startsWith('client/')) {
        setActiveTab('client');
        const rest = hash.slice(7);
        const [category, samplePath] = rest.split('/');
        if (category && samplePath) { loadSampleFromHash(category, samplePath); return true; }
    } else if (hash.includes('/')) {
        const [category, samplePath] = hash.split('/');
        if (category && samplePath) { loadSampleFromHash(category, samplePath); return true; }
    }
    return false;
}

// Render categories and samples
function renderCategories() {
    categoriesNav.innerHTML = '';

    const filtered = samplesData.categories.filter(c =>
        activeTab === 'server' ? c.requiresServer === true : !c.requiresServer
    );

    filtered.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.innerHTML = `
            <span>${category.category}</span>
            <span class="category-toggle">▼</span>
        `;

        const categoryItems = document.createElement('div');
        categoryItems.className = 'category-items';

        category.samples.forEach(sample => {
            const sampleItem = document.createElement('div');
            sampleItem.className = 'sample-item';
            sampleItem.textContent = sample.name;
            sampleItem.dataset.path = sample.path;
            sampleItem.dataset.name = sample.name;
            sampleItem.dataset.category = category.category;

            sampleItem.addEventListener('click', () => {
                loadSample(sample);
            });

            categoryItems.appendChild(sampleItem);
        });

        categoryHeader.addEventListener('click', () => {
            categoryDiv.classList.toggle('collapsed');
        });

        categoryDiv.appendChild(categoryHeader);
        categoryDiv.appendChild(categoryItems);
        categoriesNav.appendChild(categoryDiv);
    });
}

// Render statistics
function renderStats() {
    const filtered = samplesData.categories.filter(c =>
        activeTab === 'server' ? c.requiresServer === true : !c.requiresServer
    );
    const categoryCount = filtered.length;
    const totalSamples = filtered.reduce((sum, c) => sum + c.samples.length, 0);

    statsContainer.innerHTML = `
        <div class="stat-card">
            <h3>Total Samples</h3>
            <div class="value">${totalSamples}</div>
        </div>
        <div class="stat-card">
            <h3>Categories</h3>
            <div class="value">${categoryCount}</div>
        </div>
    `;
}

// Load a sample
function loadSample(sample) {
    currentSample = sample;
    loadingPath = sample.path;
    propertyOverrides = {};

    // Update active state
    document.querySelectorAll('.sample-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`[data-path="${sample.path}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }

    // Persist sample selection for refresh recovery (loadSite overwrites the hash)
    try { sessionStorage.setItem('pages-gallery-sample', `${activeTab}/${sample.category}/${encodeURIComponent(sample.path)}`); } catch { /* private browsing */ }

    // Update URL hash (suppress hashchange to avoid double-load)
    suppressHashChange = true;
    window.location.hash = `${activeTab}/${sample.category}/${encodeURIComponent(sample.path)}`;
    requestAnimationFrame(() => { suppressHashChange = false; });

    // Show sample container
    welcomeScreen.style.display = 'none';
    sampleContainer.style.display = 'flex';
    currentSampleName.textContent = sample.name;

    // Load sample in target div
    loadSampleInTarget(sample.path);

    // Load sample source code
    loadSampleSourceCode(sample.path);
}

// Load sample from URL hash
function loadSampleFromHash(category, samplePath) {
    const decodedPath = decodeURIComponent(samplePath);
    if (loadingPath === decodedPath) return;

    for (const cat of samplesData.categories) {
        for (const sample of cat.samples) {
            if (sample.path === decodedPath) {
                loadSample(sample);
                return;
            }
        }
    }
}

// Property overrides from the config bar
let propertyOverrides = {};

function extractUrlProperties(yamlText) {
    const props = {};
    const match = yamlText.match(/^properties:\s*\n((?:[ \t]+\S.*\n)*)/m);
    if (!match) return props;
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^\s+(\w+):\s*(.+)/);
        if (kv && (kv[2].includes('http') || kv[2].includes('localhost') || kv[1].toLowerCase().includes('url') || kv[2].includes('data/') || kv[2].includes('metrics') || kv[2].includes('/api/'))) {
            props[kv[1]] = kv[2].trim();
        }
    }
    return props;
}

function renderConfigBar(urlProps, samplePath) {
    const configBar = document.getElementById('config-bar');
    const keys = Object.keys(urlProps);
    if (keys.length === 0) {
        configBar.style.display = 'none';
        return;
    }
    configBar.style.display = 'flex';
    configBar.innerHTML = '';
    for (const key of keys) {
        const defaultVal = urlProps[key];
        const override = propertyOverrides[key] || '';
        const field = document.createElement('div');
        field.className = 'config-field';
        field.innerHTML = `<label>${key}</label><input type="text" data-prop="${key}" value="${override.replace(/"/g, '&quot;')}" placeholder="${defaultVal.replace(/"/g, '&quot;')}" />`;
        configBar.appendChild(field);
    }
    const applyBtn = document.createElement('button');
    applyBtn.className = 'config-apply';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
        for (const input of configBar.querySelectorAll('input[data-prop]')) {
            const val = input.value.trim();
            if (val) propertyOverrides[input.dataset.prop] = val;
            else delete propertyOverrides[input.dataset.prop];
        }
        loadSampleInTarget(samplePath);
    });
    configBar.appendChild(applyBtn);
    if (Object.keys(propertyOverrides).length > 0) {
        const status = document.createElement('span');
        status.className = 'config-status';
        status.textContent = 'Using custom URLs';
        configBar.appendChild(status);
    }
}

function applyPropertyOverrides(yamlText) {
    let result = yamlText;
    for (const [key, value] of Object.entries(propertyOverrides)) {
        const re = new RegExp(`(^\\s+${key}:\\s*).+`, 'm');
        result = result.replace(re, `$1${value}`);
    }
    return result;
}

// Load sample in target div using pages loadSite
async function loadSampleInTarget(samplePath) {
    try {
        const response = await fetch(`samples/${samplePath}`);
        let yamlText = await response.text();

        const urlProps = extractUrlProperties(yamlText);
        renderConfigBar(urlProps, samplePath);
        yamlText = applyPropertyOverrides(yamlText);

        if (currentSite) {
            currentSite.dispose();
            currentSite = null;
        }

        sampleTarget.innerHTML = "";
        sampleTarget.className = "";

        // Resolve base URL for relative dataset paths (e.g. url: metrics)
        const sampleDir = samplePath.substring(0, samplePath.lastIndexOf('/') + 1);
        const baseUrl = `${window.location.origin}/samples/${sampleDir}`;

        // Fallback fetch: when the real fetch fails (CORS, missing infra, unresolved
        // ${property} vars), serve mock Prometheus metrics so the gallery always shows
        // something useful.
        const galleryFetch = async (url, init) => {
            try {
                const urlStr = typeof url === 'string' ? url : url.toString();
                if (urlStr.includes('${')) {
                    throw new Error('Unresolved property variable');
                }
                const resp = await fetch(url, init);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return resp;
            } catch {
                const urlStr = typeof url === 'string' ? url : url.toString();
                const isRangeQuery = urlStr.includes('[') || urlStr.includes('%5B');
                let mockFile = 'prometheus-metrics.txt';
                if (urlStr.includes('/images/json')) mockFile = 'podman-images.json';
                else if (urlStr.includes('/containers/json')) mockFile = 'podman-containers.json';
                else if (urlStr.includes('/api/v1/query') && isRangeQuery) mockFile = 'prometheus-api-matrix.json';
                else if (urlStr.includes('/api/v1/query')) mockFile = 'prometheus-api-response.json';
                const mockResp = await fetch(`${window.location.origin}/mock-data/${mockFile}`);
                if (mockFile.endsWith('.txt')) {
                    const text = await mockResp.text();
                    const varied = text.replace(/(\s)([\d.]+)(\s*$)/gm, (_, pre, num, post) => {
                        const v = parseFloat(num);
                        if (isNaN(v) || v === 0) return `${pre}${num}${post}`;
                        const jitter = v * (0.95 + Math.random() * 0.1);
                        return `${pre}${Number.isInteger(v) ? Math.round(jitter) : jitter.toFixed(6)}${post}`;
                    });
                    return new Response(varied, { headers: { 'content-type': 'text/plain' } });
                }
                return mockResp;
            }
        };

        currentSite = await window.casehubPages.loadSite(sampleTarget, yamlText, { baseUrl, fetch: galleryFetch });
        const currentTheme = casehubPages.getTheme() || 'casehub-dark';
        currentSite.setTheme(currentTheme.endsWith('-dark') ? 'dark' : 'light');
        casehubPages.applyTheme(currentTheme, sampleTarget);

        if (sampleTarget.querySelector('.pages-dock-workbench, [data-frame-sandbox]')) {
            sampleTarget.classList.add('full-bleed');
        }

        // Execute companion TS/JS script if present
        if (currentSample && currentSample.tsPath) {
            try {
                const tsResp = await fetch(`samples/${currentSample.tsPath}`);
                if (tsResp.ok) {
                    const tsCode = await tsResp.text();
                    const jsCode = stripTs(tsCode);
                    const fn = new Function(jsCode);
                    fn();
                }
            } catch (e) {
                console.warn('Companion script error:', e);
            }
        }
    } catch (error) {
        console.error('Error loading sample:', error);
        sampleTarget.innerHTML = `
            <div style="padding: 24px; color: #d32f2f; background: #fce4ec; border-radius: 8px; margin: 16px;">
                <strong>Error loading sample</strong>
                <p style="margin-top: 8px; font-family: monospace; font-size: 13px;">${error.message || error}</p>
            </div>
        `;
    }
}

// Source code state
let currentYamlSource = '';
let currentTsSource = '';
let showingTs = true; // default to TS

// Load and display sample source code
async function loadSampleSourceCode(samplePath) {
    try {
        const response = await fetch(`samples/${samplePath}`);
        currentYamlSource = await response.text();

        // Load TS companion file only if the sample declares one
        currentTsSource = '';
        if (currentSample && currentSample.tsPath) {
            try {
                const tsResponse = await fetch(`samples/${currentSample.tsPath}`);
                if (tsResponse.ok) {
                    currentTsSource = await tsResponse.text();
                }
            } catch { /* no TS version */ }
        }

        // Show TS by default if available, otherwise YAML
        if (currentTsSource) {
            sourceCodeElement.textContent = currentTsSource;
            showingTs = true;
        } else {
            sourceCodeElement.textContent = currentYamlSource;
            showingTs = false;
        }

        // Update toggle button
        updateSourceToggle();
        codeToggleBtn.style.display = 'flex';
    } catch (error) {
        console.error('Error loading sample source:', error);
        sourceCodeElement.textContent = 'Error loading source code';
    }
}

function updateSourceToggle() {
    let toggleBtn = document.getElementById('source-format-toggle');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'source-format-toggle';
        toggleBtn.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 12px;border:1px solid #666;border-radius:4px;background:#333;color:#eee;cursor:pointer;font-size:12px;z-index:10';
        const codeContainer = sourceCodeElement.parentElement;
        if (codeContainer) {
            codeContainer.style.position = 'relative';
            codeContainer.appendChild(toggleBtn);
        }
        toggleBtn.addEventListener('click', () => {
            showingTs = !showingTs;
            sourceCodeElement.textContent = showingTs && currentTsSource ? currentTsSource : currentYamlSource;
            updateSourceToggle();
        });
    }
    if (currentTsSource) {
        toggleBtn.textContent = showingTs ? 'TS ▼' : 'YAML ▼';
        toggleBtn.title = `Showing ${showingTs ? 'TypeScript' : 'YAML'} — click to switch`;
        toggleBtn.style.display = '';
    } else {
        toggleBtn.style.display = 'none';
    }
}


// Toggle sidebar collapsed state
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    sidebarToggleBtn.classList.toggle('collapsed');
}


// Toggle code sidebar collapsed state
function toggleCodeSidebar() {
    codeSidebar.classList.toggle('collapsed');
    codeToggleBtn.classList.toggle('collapsed');
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    galleryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.gallery-tab');
        if (tab) setActiveTab(tab.dataset.tab);
    });

    // Sidebar toggle
    sidebarToggleBtn.addEventListener('click', toggleSidebar);

    // Code sidebar toggle
    codeToggleBtn.addEventListener('click', toggleCodeSidebar);

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        document.querySelectorAll('.sample-item').forEach(item => {
            const name = item.dataset.name.toLowerCase();
            const category = item.dataset.category.toLowerCase();

            if (name.includes(searchTerm) || category.includes(searchTerm)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });

        // Hide empty categories
        document.querySelectorAll('.category').forEach(category => {
            const visibleItems = category.querySelectorAll('.sample-item:not(.hidden)');
            if (visibleItems.length === 0 && searchTerm !== '') {
                category.style.display = 'none';
            } else {
                category.style.display = 'block';
            }
        });
    });

    // Open in new window
    openNewWindowBtn.addEventListener('click', () => {
        if (currentSample) {
            const url = `${window.location.origin}${window.location.pathname}#${activeTab}/${currentSample.category}/${encodeURIComponent(currentSample.path)}`;
            window.open(url, '_blank');
        }
    });

    // Reload sample
    reloadSampleBtn.addEventListener('click', () => {
        if (currentSample) {
            loadSample(currentSample);
        }
    });

    // Propagate theme changes to the loaded site and sample target
    let propagating = false;
    document.documentElement.addEventListener('pages-theme-change', (e) => {
        if (propagating) return;
        propagating = true;
        try {
            if (currentSite) {
                currentSite.setTheme(e.detail.mode);
            }
            const target = document.getElementById('sample-target');
            if (target) {
                casehubPages.applyTheme(e.detail.name, target);
            }
        } finally {
            propagating = false;
        }
    });

    // Density toggle
    const densityToggle = document.getElementById('density-toggle');
    let isCompact = false;
    densityToggle.addEventListener('click', () => {
        isCompact = !isCompact;
        document.documentElement.classList.toggle('pages-density-compact', isCompact);
        densityToggle.textContent = isCompact ? '⊞' : '⊟';
    });

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
        if (suppressHashChange) return;
        const hash = window.location.hash.slice(1);
        if (hash) {
            if (hash.startsWith('server/') || hash.startsWith('client/')) {
                const isServer = hash.startsWith('server/');
                setActiveTab(isServer ? 'server' : 'client');
                const rest = hash.slice(isServer ? 7 : 7);
                const [category, samplePath] = rest.split('/');
                if (category && samplePath) loadSampleFromHash(category, samplePath);
            } else {
                const [category, samplePath] = hash.split('/');
                loadSampleFromHash(category, samplePath);
            }
        } else {
            welcomeScreen.style.display = 'flex';
            sampleContainer.style.display = 'none';
            codeToggleBtn.style.display = 'none';
            sourceCodeElement.textContent = 'Select a sample to view its source code';
            document.querySelectorAll('.sample-item').forEach(item => {
                item.classList.remove('active');
            });
        }
    });
}

// Load samples when page loads
loadSamples();
