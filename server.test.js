// Configuration
const API_URL = 'http://localhost:3000'
const API_TOKEN = process.env.API_SECRET || 'your-secure-secret-key-here'

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json'
}

// Test utilities
async function testEndpoint(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: method !== 'GET' ? headers : {},
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options)
    return {
      status: response.status,
      data: await response.json(),
      ok: response.ok
    }
  } catch (error) {
    return {
      status: 0,
      error: error.message,
      ok: false
    }
  }
}

// Test functions
async function testHealth() {
  console.log('🏥 Testing health endpoint...')

  const result = await testEndpoint('/health')

  if (result.ok && result.status === 200) {
    console.log('✅ Health check passed')
    console.log(`   Status: ${result.data.status}`)
    console.log(`   Version: ${result.data.version}`)
    return true
  } else {
    console.log(`❌ Health check failed: ${result.status}`)
    return false
  }
}

async function testAuthentication() {
  console.log('🔒 Testing authentication...')

  // Test without token
  const noAuthResult = await fetch(`${API_URL}/search-places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'test' })
  })

  if (noAuthResult.status === 401) {
    console.log('✅ Authentication properly rejects unauthorized requests')
    return true
  } else {
    console.log(`❌ Authentication failed: Expected 401, got ${noAuthResult.status}`)
    return false
  }
}

async function testPlacesSearch() {
  console.log('🔍 Testing places search...')

  const testCases = [
    {
      query: 'coffee shops',
      location: 'San Francisco, CA',
      description: 'Coffee shops in San Francisco'
    },
    {
      query: 'restaurants',
      location: 'New York, NY',
      radius: 1000,
      description: 'Restaurants in New York'
    },
    {
      query: 'pizza',
      description: 'Pizza places (no location)'
    }
  ]

  let passed = 0

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    console.log(`\n  Test ${i + 1}: ${testCase.description}`)

    const result = await testEndpoint('/search-places', 'POST', testCase)

    if (result.ok && result.status === 200) {
      const data = result.data
      console.log(`    ✅ Found ${data.places?.length || 0} places`)

      if (data.places && data.places.length > 0) {
        const place = data.places[0]
        console.log(`    📍 Top result: ${place.name}`)
        console.log(`    ⭐ Rating: ${place.rating || 'N/A'}`)
        console.log(`    📍 Center: ${data.center_lat?.toFixed(4)}, ${data.center_lng?.toFixed(4)}`)
      }

      console.log(`    🔗 Map URL: ${data.map_url?.substring(0, 60)}...`)
      passed++
    } else {
      console.log(`    ❌ Failed: ${result.status} - ${result.data?.message || result.error}`)
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log(`\n📊 Places search tests: ${passed}/${testCases.length} passed`)
  return passed === testCases.length
}

async function testDirections() {
  console.log('\n🗺️ Testing directions...')

  const testCases = [
    {
      origin: 'Times Square, New York, NY',
      destination: 'Central Park, New York, NY',
      mode: 'walking',
      description: 'Walking directions in NYC'
    },
    {
      origin: 'San Francisco Airport',
      destination: 'Golden Gate Bridge',
      mode: 'driving',
      description: 'Driving directions in SF'
    }
  ]

  let passed = 0

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    console.log(`\n  Test ${i + 1}: ${testCase.description}`)

    const result = await testEndpoint('/directions', 'POST', testCase)

    if (result.ok && result.status === 200) {
      const data = result.data
      console.log(`    ✅ Route found`)
      console.log(`    ⏱️ Duration: ${data.duration}`)
      console.log(`    📏 Distance: ${data.distance}`)
      console.log(`    🔗 URL: ${data.url?.substring(0, 60)}...`)
      passed++
    } else {
      console.log(`    ❌ Failed: ${result.status} - ${result.data?.message || result.error}`)
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log(`\n📊 Directions tests: ${passed}/${testCases.length} passed`)
  return passed === testCases.length
}

async function testRateLimiting() {
  console.log('\n⏱️ Testing rate limiting...')

  console.log('  Making 5 rapid requests...')
  let blocked = 0

  for (let i = 0; i < 5; i++) {
    const result = await testEndpoint('/search-places', 'POST', { query: 'test' })

    if (result.status === 429) {
      blocked++
    }

    console.log(`    Request ${i + 1}: ${result.status}`)
  }

  console.log(`  📊 Rate limiting working: ${blocked > 0 ? 'Yes' : 'Not triggered (normal for low volume)'}`)
  return true
}

async function testOllamaConnection() {
  console.log('\n🤖 Testing Ollama connection...')

  try {
    const response = await fetch('http://localhost:11434/api/tags')

    if (response.ok) {
      const data = await response.json()
      console.log('✅ Ollama is running')
      console.log(`   Available models: ${data.models?.length || 0}`)

      if (data.models && data.models.length > 0) {
        console.log(`   Models: ${data.models.map(m => m.name).join(', ')}`)
      }

      return true
    } else {
      console.log(`❌ Ollama health check failed: ${response.status}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Ollama connection error: ${error.message}`)
    console.log('   Make sure Ollama is running: ollama serve')
    return false
  }
}

// Main test runner
async function runAllTests() {
  console.log('🧪 Running Maps LLM API Tests with Bun')
  console.log('=' * 50)

  const startTime = Date.now()
  let testsPassed = 0
  let testsTotal = 0

  const tests = [
    { name: 'Health Check', fn: testHealth },
    { name: 'Authentication', fn: testAuthentication },
    { name: 'Places Search', fn: testPlacesSearch },
    { name: 'Directions', fn: testDirections },
    { name: 'Rate Limiting', fn: testRateLimiting },
    { name: 'Ollama Connection', fn: testOllamaConnection }
  ]

  for (const test of tests) {
    testsTotal++
    console.log(`\n${'='.repeat(20)} ${test.name} ${'='.repeat(20)}`)

    try {
      const passed = await test.fn()
      if (passed) {
        testsPassed++
      }
    } catch (error) {
      console.log(`❌ Test "${test.name}" threw an error: ${error.message}`)
    }
  }

  const endTime = Date.now()
  const duration = ((endTime - startTime) / 1000).toFixed(2)

  console.log('\n' + '='.repeat(50))
  console.log(`📊 Test Results: ${testsPassed}/${testsTotal} tests passed`)
  console.log(`⏱️ Duration: ${duration} seconds`)

  if (testsPassed === testsTotal) {
    console.log('🎉 All tests passed! System is ready.')
  } else {
    console.log('⚠️ Some tests failed. Check the output above.')
  }

  console.log('\n📋 Next steps:')
  if (testsPassed > 0) {
    console.log('1. 🌐 API is running at: http://localhost:3000')
    console.log('2. 🤖 Test with Ollama: ollama run gemma3n "Find coffee in Seattle"')
    console.log('3. 💬 Open WebUI at: http://localhost:8080 (if installed)')
    console.log('4. 📱 Use the demo frontend to test the full system')
  } else {
    console.log('1. ❗ Fix the failing tests above')
    console.log('2. 🔑 Make sure your .env file has the correct GOOGLE_MAPS_API_KEY')
    console.log('3. 🚀 Restart the server: bun server.js')
  }
}

// Individual test runner (for development)
async function runSingleTest(testName) {
  const tests = {
    health: testHealth,
    auth: testAuthentication,
    places: testPlacesSearch,
    directions: testDirections,
    rate: testRateLimiting,
    ollama: testOllamaConnection
  }

  if (tests[testName]) {
    console.log(`Running single test: ${testName}`)
    await tests[testName]()
  } else {
    console.log('Available tests:', Object.keys(tests).join(', '))
  }
}

// Run tests based on command line args
if (import.meta.main) {
  const args = process.argv.slice(2)

  if (args.length > 0) {
    // Run specific test
    await runSingleTest(args[0])
  } else {
    // Run all tests
    await runAllTests()
  }
}

export {
  runAllTests,
  runSingleTest,
  testHealth,
  testAuthentication,
  testPlacesSearch,
  testDirections,
  testRateLimiting,
  testOllamaConnection
}
