// ============ GRIST WIDGET - SYNC CONNECTOR ============
// Widget de synchronisation entre deux tables Grist
// avec tests de diagnostic CORS

let gristDocApi;
let currentTable = null;
let targetTableConfig = null;

// État du widget
const state = {
  initialized: false,
  apiKey: '',
  targetDocId: '',
  targetTableName: '',
  lastSyncTime: null,
  syncInProgress: false
};

// Initialisation du widget
async function initWidget() {
  console.log('🚀 Initialisation du widget Grist Sync Connector');
  
  try {
    // Attendre que grist soit disponible
    if (typeof grist === 'undefined') {
      console.error('❌ grist API non disponible');
      setStatus('❌ Erreur: API Grist non disponible', 'error');
      return;
    }

    // Récupérer l'API du document
    gristDocApi = grist.docApi;
    
    if (!gristDocApi) {
      throw new Error('grist.docApi non accessible');
    }

    console.log('✅ API Grist disponible');
    
    // Charger la configuration sauvegardée
    loadConfiguration();
    
    state.initialized = true;
    setStatus('✅ Widget initialisé', 'success');
    
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
    setStatus(`❌ Erreur initialisation: ${error.message}`, 'error');
  }
}

// Sauvegarder/charger configuration
function saveConfiguration() {
  const config = {
    apiKey: document.getElementById('targetApiKey')?.value || '',
    targetDocId: document.getElementById('targetDocId')?.value || '',
    targetTableName: document.getElementById('targetTableName')?.value || ''
  };
  localStorage.setItem('grist-sync-config', JSON.stringify(config));
  setStatus('✅ Configuration sauvegardée', 'success');
}

function loadConfiguration() {
  const saved = localStorage.getItem('grist-sync-config');
  if (saved) {
    try {
      const config = JSON.parse(saved);
      if (document.getElementById('targetApiKey')) {
        document.getElementById('targetApiKey').value = config.apiKey || '';
        document.getElementById('targetDocId').value = config.targetDocId || '';
        document.getElementById('targetTableName').value = config.targetTableName || '';
      }
      console.log('✅ Configuration chargée depuis localStorage');
    } catch (e) {
      console.error('❌ Erreur chargement config:', e);
    }
  }
}

// Afficher le statut
function setStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    console.log(message);
  }
}

// ============ TESTS CORS AVEC getAccessToken() ============

async function testGetAccessToken() {
  console.log('\n🔐 TEST 1: Obtenir un Access Token via grist.docApi');
  const resultsDiv = document.getElementById('testResults');
  
  try {
    const result = await grist.docApi.getAccessToken({readOnly: false});
    const {token, baseUrl} = result;
    
    console.log('✅ Token obtenu avec succès');
    console.log('   Token:', token.substring(0, 20) + '...');
    console.log('   Base URL:', baseUrl);
    
    // Afficher dans l'interface
    if (resultsDiv) {
      resultsDiv.innerHTML += `
        <div class="test-result success">
          <strong>✅ TEST 1: getAccessToken()</strong><br>
          Token obtenu: ${token.substring(0, 30)}...<br>
          Base URL: ${baseUrl}
        </div>
      `;
    }
    
    return {token, baseUrl};
  } catch (err) {
    console.error('❌ Erreur:', err);
    if (resultsDiv) {
      resultsDiv.innerHTML += `
        <div class="test-result error">
          <strong>❌ TEST 1: getAccessToken()</strong><br>
          Erreur: ${err.message}
        </div>
      `;
    }
    return null;
  }
}

async function testListTables(tokenData) {
  if (!tokenData) return;
  
  console.log('\n📋 TEST 2: Lister les tables avec auth en query param');
  const resultsDiv = document.getElementById('testResults');
  const {token, baseUrl} = tokenData;
  
  try {
    const url = `${baseUrl}/tables?auth=${encodeURIComponent(token)}`;
    console.log('URL:', url);
    
    const response = await fetch(url);
    console.log('Statut HTTP:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Tables listées:', data);
    
    if (resultsDiv) {
      resultsDiv.innerHTML += `
        <div class="test-result success">
          <strong>✅ TEST 2: Lister les tables</strong><br>
          Réponse: ${JSON.stringify(data).substring(0, 200)}...
        </div>
      `;
    }
    
    return data;
  } catch (err) {
    console.error('❌ Erreur:', err);
    if (resultsDiv) {
      resultsDiv.innerHTML += `
        <div class="test-result error">
          <strong>❌ TEST 2: Lister les tables</strong><br>
          Erreur: ${err.message}
        </div>
      `;
    }
  }
}

async function testFetchRecords(tokenData) {
  if (!tokenData) return;
  
  console.log('\n📊 TEST 3: Récupérer les records de la table source');
  const resultsDiv = document.getElementById('testResults');
  const {token, baseUrl} = tokenData;
  
  try {
    // Récupérer la table source via l'API Grist
    const tables = await grist.docApi.listTables();
    if (tables.length === 0) {
      throw new Error('Aucune table disponible dans ce document');
    }
    
    const sourceTableId = tables[0].id;
    console.log('Table source:', sourceTableId);
    
    const url = `${baseUrl}/tables/${sourceTableId}/records?auth=${encodeURIComponent(token)}`;
    console.log('URL:', url);
    
    const response = await fetch(url);
    console.log('Statut HTTP:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Records récupérés:', data.records?.length || 0, 'lignes');
    
    if (resultsDiv) {
      resultsDiv.innerHTML += `
        <div class="test-result success">
          <strong>✅ TEST 3: Récupérer records</strong><br>
          Table: ${sourceTableId}<br>
          Records trouvés: ${data.records?.length || 0}
        </div>
      `;
    }
    
    return data;
  } catch (err) {
    console.error('❌ Erreur:', err);
    if (resultsDiv) {
      resultsDiv.innerHTML += `
        <div class="test-result error">
          <strong>❌ TEST 3: Récupérer records</strong><br>
          Erreur: ${err.message}
        </div>
      `;
    }
  }
}

// Lancer tous les tests
async function runAllTests() {
  console.clear();
  console.log('='
.repeat(50));
  console.log('🧪 SUITE DE TESTS - SYNC CONNECTOR');
  console.log('='.repeat(50));
  
  const resultsDiv = document.getElementById('testResults');
  if (resultsDiv) {
    resultsDiv.innerHTML = '<h3>📊 Résultats des tests:</h3>';
  }
  
  setStatus('🧪 Tests en cours...', 'info');
  
  // Test 1: getAccessToken
  const tokenData = await testGetAccessToken();
  
  if (tokenData) {
    // Test 2: Lister les tables
    await testListTables(tokenData);
    
    // Test 3: Récupérer les records
    await testFetchRecords(tokenData);
  }
  
  setStatus('✅ Tests terminés - voir console et résultats ci-dessous', 'success');
  console.log('='
.repeat(50));
}

// ============ SYNCHRONISATION ============

async function performSync() {
  if (state.syncInProgress) {
    setStatus('⏳ Synchronisation déjà en cours...', 'warning');
    return;
  }
  
  state.syncInProgress = true;
  setStatus('🔄 Synchronisation en cours...', 'info');
  
  try {
    // Étape 1: Récupérer les données source
    console.log('📥 Récupération des données source...');
    const tables = await grist.docApi.listTables();
    if (tables.length === 0) {
      throw new Error('Aucune table dans le document source');
    }
    
    const sourceTable = tables[0];
    const records = await grist.docApi.fetchTable(sourceTable.id);
    console.log(`✅ ${records.length} lignes récupérées`);
    
    // Étape 2: Vérifier la configuration cible
    const apiKey = document.getElementById('targetApiKey')?.value;
    const targetDocId = document.getElementById('targetDocId')?.value;
    const targetTableName = document.getElementById('targetTableName')?.value;
    
    if (!apiKey || !targetDocId || !targetTableName) {
      throw new Error('Configuration incomplète: clé API, ID doc ou table manquant');
    }
    
    // Étape 3: Préparer les données pour l'envoi
    console.log('📦 Préparation des données...');
    const preparedData = {
      records: records.map(r => ({
        fields: r.fields
      }))
    };
    
    // Étape 4: Envoyer vers le document cible
    console.log('📤 Envoi vers le document cible...');
    const targetUrl = `https://grist.numerique.gouv.fr/o/docs/api/docs/${targetDocId}/tables/${targetTableName}/records`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preparedData)
    });
    
    if (!response.ok) {
      throw new Error(`Erreur serveur: HTTP ${response.status}`);
    }
    
    state.lastSyncTime = new Date().toLocaleString('fr-FR');
    setStatus(`✅ Synchronisation réussie (${records.length} lignes) - ${state.lastSyncTime}`, 'success');
    console.log('✅ Synchronisation terminée');
    
  } catch (error) {
    console.error('❌ Erreur sync:', error);
    setStatus(`❌ Erreur: ${error.message}`, 'error');
  } finally {
    state.syncInProgress = false;
  }
}

// ============ EVENT LISTENERS ============

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM chargé, initialisation...');
  initWidget();
  
  // Boutons
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', saveConfiguration);
  }
  
  const runTestsBtn = document.getElementById('runTestsBtn');
  if (runTestsBtn) {
    runTestsBtn.addEventListener('click', runAllTests);
  }
  
  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', performSync);
  }
});

// Initialiser immédiatement en cas de chargement différé
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
