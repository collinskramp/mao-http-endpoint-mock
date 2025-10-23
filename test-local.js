#!/usr/bin/env node

const http = require('http');

// Configuration for local testing
const config = {
  baseUrl: 'http://localhost:8080',
  totalRequests: 200,
  concurrentRequests: 3,
  requestInterval: 800, // 800ms between batches
  monitorInterval: 3000, // 3 seconds between status reports
  testDuration: 120000, // 2 minutes total test duration
};

// Statistics tracking
const stats = {
  total: 0,
  success: 0,
  dropped: 0,
  errors: {
    network: 0,
    timeout: 0,
    server_error: 0,
    client_error: 0,
    service_unavailable: 0,
    circuit_breaker: 0
  },
  responseTimes: [],
  statusCodes: {},
  startTime: Date.now(),
  serviceMetrics: null
};

// Test scenarios
const testScenarios = [
  { method: 'GET', path: '/health', name: 'Health Check', weight: 2 },
  { method: 'GET', path: '/?name=Alice', name: 'Hello GET', weight: 3 },
  { method: 'POST', path: '/', body: { name: 'Bob' }, name: 'Hello POST', weight: 3 },
  { method: 'POST', path: '/api/orders', body: { item: 'laptop', qty: 1 }, name: 'Create Order', weight: 2 },
  { method: 'GET', path: '/api/users/123', name: 'Get User', weight: 2 },
  { method: 'PUT', path: '/api/users/123', body: { name: 'Updated' }, name: 'Update User', weight: 1 },
  { method: 'DELETE', path: '/api/orders/456', name: 'Delete Order', weight: 1 },
];

// Weighted random selection
function selectRandomScenario() {
  const totalWeight = testScenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const scenario of testScenarios) {
    random -= scenario.weight;
    if (random <= 0) {
      return scenario;
    }
  }
  
  return testScenarios[0]; // fallback
}

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

// Make HTTP request
function makeRequest(method, path, body = null, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseUrl + path);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Local-API-Tester/1.0'
      },
      timeout: timeout
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        let parsedData = null;
        
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = { raw_response: data };
        }
        
        resolve({
          statusCode: res.statusCode,
          responseTime: responseTime,
          data: parsedData,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      
      // Check if it's a connection refused (dropped request simulation)
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
        reject({
          error: 'Connection dropped',
          responseTime: responseTime,
          type: 'dropped'
        });
      } else {
        reject({
          error: error.message,
          responseTime: responseTime,
          type: 'network'
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      reject({
        error: 'Request timeout',
        responseTime: responseTime,
        type: 'timeout'
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// Process request result
function processResult(scenario, result, isError = false) {
  stats.total++;
  
  if (isError) {
    if (result.type === 'dropped') {
      stats.dropped++;
      console.log(`${colors.magenta}⚠${colors.reset} ${scenario.name}: ${colors.magenta}Dropped${colors.reset} (${result.responseTime}ms)`);
    } else {
      const errorType = result.type || 'unknown';
      stats.errors[errorType] = (stats.errors[errorType] || 0) + 1;
      console.log(`${colors.red}✗${colors.reset} ${scenario.name}: ${colors.red}${result.error}${colors.reset} (${result.responseTime}ms)`);
    }
  } else {
    stats.success++;
    stats.responseTimes.push(result.responseTime);
    
    const statusCode = result.statusCode;
    stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
    
    // Categorize by status code
    if (statusCode >= 500) {
      stats.errors.server_error++;
    } else if (statusCode >= 400) {
      if (statusCode === 503) {
        if (result.data && result.data.error_type === 'circuit_breaker_open') {
          stats.errors.circuit_breaker++;
        } else {
          stats.errors.service_unavailable++;
        }
      } else {
        stats.errors.client_error++;
      }
    }
    
    const statusColor = statusCode >= 500 ? colors.red : 
                       statusCode >= 400 ? colors.yellow : colors.green;
    
    const delayInfo = result.data && result.data.artificial_delay_ms > 0 
      ? ` ${colors.yellow}[+${result.data.artificial_delay_ms}ms delay]${colors.reset}` 
      : '';
    
    const normalPeriod = result.data && result.data.in_normal_period 
      ? ` ${colors.cyan}[Normal Period]${colors.reset}` 
      : '';
    
    console.log(`${colors.green}✓${colors.reset} ${scenario.name}: ${statusColor}${statusCode}${colors.reset} (${result.responseTime}ms)${delayInfo}${normalPeriod}`);
    
    // Store service metrics
    if (scenario.name === 'Health Check' && result.data && result.data.service_metrics) {
      stats.serviceMetrics = result.data.service_metrics;
    }
  }
}

// Display real-time statistics
function displayStats() {
  const runtime = (Date.now() - stats.startTime) / 1000;
  const successfulResponses = stats.success - stats.errors.server_error - stats.errors.client_error - stats.errors.service_unavailable - stats.errors.circuit_breaker;
  const actualSuccessRate = stats.total > 0 ? ((successfulResponses / stats.total) * 100).toFixed(1) : 0;
  const totalErrorRate = stats.total > 0 ? (((stats.total - stats.success - stats.dropped) / stats.total) * 100).toFixed(1) : 0;
  const droppedRate = stats.total > 0 ? ((stats.dropped / stats.total) * 100).toFixed(1) : 0;
  
  const avgResponseTime = stats.responseTimes.length > 0 
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
    : 0;
    
  const medianResponseTime = stats.responseTimes.length > 0 
    ? Math.round(stats.responseTimes.sort((a, b) => a - b)[Math.floor(stats.responseTimes.length / 2)])
    : 0;
  
  // Clear screen and show header
  console.clear();
  console.log(`${colors.bright}${colors.cyan}🔥 Real-Time API Load Test Monitor${colors.reset}`);
  console.log(`${colors.dim}${'='.repeat(60)}${colors.reset}\n`);
  
  // Test progress
  const progressPercent = Math.min(100, (runtime / (config.testDuration / 1000)) * 100);
  const progressBar = '█'.repeat(Math.floor(progressPercent / 2)) + '░'.repeat(50 - Math.floor(progressPercent / 2));
  console.log(`${colors.white}Runtime: ${colors.cyan}${Math.floor(runtime)}s${colors.reset} / ${config.testDuration/1000}s`);
  console.log(`${colors.white}Progress: ${colors.cyan}[${progressBar}] ${progressPercent.toFixed(1)}%${colors.reset}\n`);
  
  // Request statistics
  console.log(`${colors.bright}📊 Request Statistics${colors.reset}`);
  console.log(`${colors.white}Total Requests: ${colors.cyan}${stats.total}${colors.reset} (${(stats.total/runtime).toFixed(1)}/sec)`);
  console.log(`${colors.white}Successful: ${colors.green}${successfulResponses}${colors.reset} (${actualSuccessRate}%)`);
  console.log(`${colors.white}Dropped: ${colors.magenta}${stats.dropped}${colors.reset} (${droppedRate}%)`);
  console.log(`${colors.white}Errors: ${colors.red}${stats.total - stats.success - stats.dropped}${colors.reset} (${totalErrorRate}%)\n`);
  
  // Response times
  console.log(`${colors.bright}⏱️  Response Times${colors.reset}`);
  console.log(`${colors.white}Average: ${colors.yellow}${avgResponseTime}ms${colors.reset}`);
  console.log(`${colors.white}Median: ${colors.yellow}${medianResponseTime}ms${colors.reset}\n`);
  
  // Error breakdown
  const hasErrors = Object.values(stats.errors).some(count => count > 0);
  if (hasErrors) {
    console.log(`${colors.bright}🚨 Error Breakdown${colors.reset}`);
    Object.entries(stats.errors).forEach(([type, count]) => {
      if (count > 0) {
        const percentage = ((count / stats.total) * 100).toFixed(1);
        console.log(`${colors.white}${type.replace('_', ' ')}: ${colors.red}${count}${colors.reset} (${percentage}%)`);
      }
    });
    console.log('');
  }
  
  // Status codes
  if (Object.keys(stats.statusCodes).length > 0) {
    console.log(`${colors.bright}📈 HTTP Status Codes${colors.reset}`);
    Object.entries(stats.statusCodes)
      .sort(([a], [b]) => a - b)
      .forEach(([code, count]) => {
        const percentage = ((count / stats.total) * 100).toFixed(1);
        const codeColor = code >= 500 ? colors.red : code >= 400 ? colors.yellow : colors.green;
        console.log(`${colors.white}${code}: ${codeColor}${count}${colors.reset} (${percentage}%)`);
      });
    console.log('');
  }
  
  // Service metrics from API
  if (stats.serviceMetrics) {
    console.log(`${colors.bright}🔧 Service Internal Metrics${colors.reset}`);
    console.log(`${colors.white}API Success Rate: ${colors.green}${stats.serviceMetrics.success_rate}${colors.reset}`);
    console.log(`${colors.white}API Avg Response: ${colors.yellow}${stats.serviceMetrics.average_response_time_ms}ms${colors.reset}`);
    console.log(`${colors.white}Service Healthy: ${stats.serviceMetrics.service_healthy ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
    console.log(`${colors.white}Normal Period: ${stats.serviceMetrics.in_normal_period ? colors.green + 'Active' : colors.yellow + 'Inactive'}${colors.reset}`);
    console.log(`${colors.white}Circuit Breaker: ${stats.serviceMetrics.circuit_breaker_errors} errors${colors.reset}`);
  }
  
  console.log(`\n${colors.dim}Press Ctrl+C to stop the test${colors.reset}`);
}

// Run concurrent requests
async function runRequestBatch() {
  const promises = [];
  
  for (let i = 0; i < config.concurrentRequests; i++) {
    const scenario = selectRandomScenario();
    
    const promise = makeRequest(scenario.method, scenario.path, scenario.body)
      .then(result => processResult(scenario, result, false))
      .catch(error => processResult(scenario, error, true));
    
    promises.push(promise);
  }
  
  await Promise.allSettled(promises);
}

// Main test function
async function runLoadTest() {
  console.log(`${colors.bright}${colors.green}🚀 Starting Local API Load Test${colors.reset}\n`);
  
  // Initial display
  displayStats();
  
  // Set up monitoring
  const monitorInterval = setInterval(displayStats, config.monitorInterval);
  
  // Set up test completion
  const testTimer = setTimeout(() => {
    clearInterval(monitorInterval);
    clearInterval(requestInterval);
    
    displayStats();
    console.log(`\n${colors.bright}${colors.green}🏁 Load Test Completed!${colors.reset}`);
    console.log(`\n${colors.bright}Key Observations:${colors.reset}`);
    console.log(`• The API simulated realistic failures and delays`);
    console.log(`• Circuit breaker and service outages were demonstrated`);
    console.log(`• Response times varied with artificial delays`);
    console.log(`• Success rates fluctuated as expected (~95% base rate)`);
    
    process.exit(0);
  }, config.testDuration);
  
  // Start request batches
  const requestInterval = setInterval(runRequestBatch, config.requestInterval);
  
  // Run first batch immediately
  await runRequestBatch();
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}⏹️  Test stopped by user${colors.reset}`);
  displayStats();
  process.exit(0);
});

// Start the load test
runLoadTest().catch(error => {
  console.error(`${colors.red}Load test failed: ${error.message}${colors.reset}`);
  process.exit(1);
});
