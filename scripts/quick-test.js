// Test multi-user sync — vérification que localhost ↔ 192.168.1.133 synchro

const BASE_URLS = [
  'http://localhost:4173',
  'http://192.168.1.133:4173'
];

async function testMultiUserSync() {
  console.log('🧪 TEST: Multi-User Sync Check\n');
  
  // Step 1: Verify both URLs accessible
  for (const url of BASE_URLS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✅ ${url} - Accessible`);
      } else {
        console.log(`❌ ${url} - Status ${res.status}`);
      }
    } catch(e) {
      console.log(`❌ ${url} - Error: ${e.message}`);
    }
  }

  console.log('\n✅ Multi-User Sync Test Ready');
  console.log('   Next: Open 2 browsers and test manually');
  console.log('   - Browser A: http://localhost:4173');
  console.log('   - Browser B: http://192.168.1.133:4173');
  console.log('   - Login, create task in A');
  console.log('   - Refresh B → should see task < 1 sec');
}

// Also check backend
async function testBackendEndpoints() {
  console.log('\n🧪 TEST: Backend Endpoints\n');
  
  const tests = [
    { method: 'GET', url: 'http://localhost:3001/health', desc: 'Health check' },
    { method: 'GET', url: 'http://localhost:3001/', desc: 'Root endpoint' },
  ];

  for (const test of tests) {
    try {
      const res = await fetch(test.url);
      const data = await res.json();
      console.log(`✅ ${test.desc}: ${res.status} - ${JSON.stringify(data).substring(0, 60)}...`);
    } catch(e) {
      console.log(`❌ ${test.desc}: ${e.message}`);
    }
  }
}

// Run tests
testBackendEndpoints();
setTimeout(testMultiUserSync, 1000);
